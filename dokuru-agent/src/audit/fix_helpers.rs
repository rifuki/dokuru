/// Shared helpers for `fix_fn` implementations
use crate::audit::types::{FixOutcome, FixStatus, FixTarget};
use bollard::{
    Docker,
    container::{
        Config, CreateContainerOptions, RemoveContainerOptions, StartContainerOptions,
        StopContainerOptions, UpdateContainerOptions,
    },
    models::{ContainerInspectResponse, ContainerSummary},
};
use serde_yaml::{Mapping, Value};
use std::collections::HashSet;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use tokio::process::Command;

const DEFAULT_MEMORY_BYTES: i64 = 256 * 1024 * 1024;
const DEFAULT_CPU_SHARES: i64 = 512;
const DEFAULT_PIDS_LIMIT: i64 = 100;
const COMPOSE_FILENAMES: &[&str] = &[
    "compose.yaml",
    "docker-compose.yaml",
    "docker-compose.yml",
    "compose.yml",
];

/// Run a shell command and return (stdout, stderr, success)
pub async fn run_cmd(cmd: &str, args: &[&str]) -> std::io::Result<(String, String, bool)> {
    let output = Command::new(cmd).args(args).output().await?;
    Ok((
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
        output.status.success(),
    ))
}

/// Outcome builder helpers
pub fn applied(rule_id: &str, msg: &str, requires_restart: bool) -> FixOutcome {
    FixOutcome {
        rule_id: rule_id.into(),
        status: FixStatus::Applied,
        message: msg.into(),
        requires_restart,
        restart_command: if requires_restart {
            Some("sudo systemctl restart docker".into())
        } else {
            None
        },
        requires_elevation: true,
    }
}

pub fn blocked(rule_id: &str, msg: &str) -> FixOutcome {
    FixOutcome {
        rule_id: rule_id.into(),
        status: FixStatus::Blocked,
        message: msg.into(),
        requires_restart: false,
        restart_command: None,
        requires_elevation: false,
    }
}

pub fn supports_cgroup_resource_fix(rule_id: &str) -> bool {
    matches!(rule_id, "5.11" | "5.12" | "5.29" | "cgroup_all")
}

pub async fn apply_default_cgroup_resource_fix(
    docker: &Docker,
    rule_id: &str,
) -> eyre::Result<FixOutcome> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut targets = Vec::new();

    for container in &containers {
        let Some(target) = default_target_for_rule(docker, rule_id, container).await else {
            continue;
        };
        targets.push(target);
    }

    apply_cgroup_resource_fix(docker, rule_id, &targets).await
}

async fn default_target_for_rule(
    docker: &Docker,
    rule_id: &str,
    container: &ContainerSummary,
) -> Option<FixTarget> {
    let id = container.id.as_deref()?;
    let inspect = docker.inspect_container(id, None).await.ok()?;
    let host_config = inspect.host_config.as_ref()?;

    let memory = host_config.memory.unwrap_or(0);
    let cpu_shares = host_config.cpu_shares.unwrap_or(0);
    let pids_limit = host_config.pids_limit.unwrap_or(0);

    let needs_update = match rule_id {
        "5.11" => memory == 0,
        "5.12" => cpu_shares == 0,
        "5.29" => pids_limit <= 0,
        "cgroup_all" => memory == 0 || cpu_shares == 0 || pids_limit <= 0,
        _ => false,
    };

    if !needs_update {
        return None;
    }

    Some(FixTarget {
        container_id: id.to_string(),
        memory: (matches!(rule_id, "5.11" | "cgroup_all") && memory == 0)
            .then_some(DEFAULT_MEMORY_BYTES),
        cpu_shares: (matches!(rule_id, "5.12" | "cgroup_all") && cpu_shares == 0)
            .then_some(DEFAULT_CPU_SHARES),
        pids_limit: (matches!(rule_id, "5.29" | "cgroup_all") && pids_limit <= 0)
            .then_some(DEFAULT_PIDS_LIMIT),
        strategy: None,
    })
}

pub async fn apply_cgroup_resource_fix(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
) -> eyre::Result<FixOutcome> {
    if !supports_cgroup_resource_fix(rule_id) {
        return Ok(blocked(
            rule_id,
            "Parameterized fix currently supports only cgroup rules 5.11, 5.12, 5.29, or cgroup_all",
        ));
    }

    if targets.is_empty() {
        return Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Applied,
            message: "No containers needed cgroup resource updates".to_string(),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        });
    }

    let mut updated = Vec::new();
    let mut failed = Vec::new();

    for target in targets {
        let container_label = container_label(docker, &target.container_id).await;
        let options = match update_options(rule_id, target) {
            Ok(options) => options,
            Err(error) => {
                failed.push(format!("{container_label}: {error}"));
                continue;
            }
        };

        match docker.update_container(&target.container_id, options).await {
            Ok(()) => match verify_cgroup_update(docker, rule_id, target).await {
                Ok(()) => updated.push(container_label),
                Err(error) => {
                    failed.push(format!("{container_label}: verification failed: {error}"));
                }
            },
            Err(error) => failed.push(format!("{container_label}: update failed: {error}")),
        }
    }

    let mut message = format!("Updated cgroup limits for {} container(s)", updated.len());
    if !updated.is_empty() {
        let _ = write!(message, ": {}", updated.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    Ok(FixOutcome {
        rule_id: rule_id.to_string(),
        status: if updated.is_empty() && !failed.is_empty() {
            FixStatus::Blocked
        } else {
            FixStatus::Applied
        },
        message,
        requires_restart: false,
        restart_command: None,
        requires_elevation: false,
    })
}

fn update_options(
    rule_id: &str,
    target: &FixTarget,
) -> eyre::Result<UpdateContainerOptions<String>> {
    if target.container_id.trim().is_empty() {
        return Err(eyre::eyre!("container_id is required"));
    }

    let mut options = UpdateContainerOptions::<String>::default();

    if matches!(rule_id, "5.11" | "cgroup_all") {
        let memory = target.memory.unwrap_or(DEFAULT_MEMORY_BYTES);
        if memory <= 0 {
            return Err(eyre::eyre!("memory must be greater than zero"));
        }
        options.memory = Some(memory);
    }

    if matches!(rule_id, "5.12" | "cgroup_all") {
        let cpu_shares = target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES);
        if cpu_shares <= 0 {
            return Err(eyre::eyre!("cpu_shares must be greater than zero"));
        }
        let cpu_shares =
            isize::try_from(cpu_shares).map_err(|_| eyre::eyre!("cpu_shares is too large"))?;
        options.cpu_shares = Some(cpu_shares);
    }

    if matches!(rule_id, "5.29" | "cgroup_all") {
        let pids_limit = target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT);
        if pids_limit <= 0 {
            return Err(eyre::eyre!("pids_limit must be greater than zero"));
        }
        options.pids_limit = Some(pids_limit);
    }

    let has_update =
        options.memory.is_some() || options.cpu_shares.is_some() || options.pids_limit.is_some();

    if !has_update {
        return Err(eyre::eyre!("no supported cgroup field supplied"));
    }

    Ok(options)
}

async fn verify_cgroup_update(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
) -> eyre::Result<()> {
    let inspect = docker.inspect_container(&target.container_id, None).await?;
    let host_config = inspect
        .host_config
        .ok_or_else(|| eyre::eyre!("missing host_config"))?;

    if matches!(rule_id, "5.11" | "cgroup_all") {
        let expected = target.memory.unwrap_or(DEFAULT_MEMORY_BYTES);
        if host_config.memory.unwrap_or(0) != expected {
            return Err(eyre::eyre!("memory limit did not update to {expected}"));
        }
    }

    if matches!(rule_id, "5.12" | "cgroup_all") {
        let expected = target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES);
        if host_config.cpu_shares.unwrap_or(0) != expected {
            return Err(eyre::eyre!("CPU shares did not update to {expected}"));
        }
    }

    if matches!(rule_id, "5.29" | "cgroup_all") {
        let expected = target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT);
        if host_config.pids_limit.unwrap_or(0) != expected {
            return Err(eyre::eyre!("PIDs limit did not update to {expected}"));
        }
    }

    Ok(())
}

async fn container_label(docker: &Docker, id: &str) -> String {
    match docker.inspect_container(id, None).await {
        Ok(inspect) => inspect
            .name
            .map(|name| name.trim_start_matches('/').to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| short_id(id)),
        Err(_) => short_id(id),
    }
}

fn short_id(id: &str) -> String {
    id.chars().take(12).collect()
}

pub fn supports_namespace_fix(rule_id: &str) -> bool {
    matches!(rule_id, "5.10" | "5.16" | "5.17" | "5.21" | "5.31")
}

pub fn supports_privileged_fix(rule_id: &str) -> bool {
    rule_id == "5.5"
}

/// Stop → remove → recreate (without --privileged) → start all privileged containers.
pub async fn apply_privileged_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixOutcome> {
    if !supports_privileged_fix(rule_id) {
        return Ok(blocked(rule_id, "Privileged fix only supports rule 5.5"));
    }

    let containers = docker.list_containers::<String>(None).await?;
    let mut updated: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    let mut compose_services: HashSet<String> = HashSet::new();

    for c in &containers {
        let id = c.id.as_deref().unwrap_or("");
        let inspect = match docker.inspect_container(id, None).await {
            Ok(i) => i,
            Err(e) => {
                failed.push(format!("{}: inspect failed: {e}", short_id(id)));
                continue;
            }
        };

        let is_privileged = inspect
            .host_config
            .as_ref()
            .and_then(|h| h.privileged)
            .unwrap_or(false);

        if !is_privileged {
            continue;
        }

        let label = inspect
            .name
            .as_deref()
            .unwrap_or("")
            .trim_start_matches('/')
            .to_string();
        let label = if label.is_empty() {
            short_id(id)
        } else {
            label
        };

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_fix(docker, rule_id, &ctx).await {
                    Ok(()) => updated.push(format!("{}:{} (compose)", ctx.project, ctx.service)),
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match recreate_without_privileged(docker, id, inspect).await {
            Ok(()) => updated.push(label),
            Err(e) => failed.push(format!("{label}: {e}")),
        }
    }

    if updated.is_empty() && failed.is_empty() {
        return Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Applied,
            message: "No containers were running in privileged mode".to_string(),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        });
    }

    let mut message = format!(
        "Recreated {} container(s) without --privileged",
        updated.len()
    );
    if !updated.is_empty() {
        let _ = write!(message, ": {}", updated.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    Ok(FixOutcome {
        rule_id: rule_id.to_string(),
        status: if updated.is_empty() && !failed.is_empty() {
            FixStatus::Blocked
        } else {
            FixStatus::Applied
        },
        message,
        requires_restart: false,
        restart_command: None,
        requires_elevation: false,
    })
}

async fn recreate_without_privileged(
    docker: &Docker,
    id: &str,
    inspect: bollard::models::ContainerInspectResponse,
) -> eyre::Result<()> {
    let name = inspect
        .name
        .as_deref()
        .unwrap_or("")
        .trim_start_matches('/')
        .to_string();

    let container_config = inspect
        .config
        .ok_or_else(|| eyre::eyre!("missing container config"))?;

    let mut host_config = inspect.host_config.unwrap_or_default();
    host_config.privileged = Some(false);

    docker
        .stop_container(id, Some(StopContainerOptions { t: 10 }))
        .await?;

    docker
        .remove_container(
            id,
            Some(RemoveContainerOptions {
                v: false,
                force: false,
                link: false,
            }),
        )
        .await?;

    let mut create_config: Config<String> = container_config.into();
    create_config.host_config = Some(host_config);

    let opts = if name.is_empty() {
        None
    } else {
        Some(CreateContainerOptions {
            name: name.clone(),
            platform: None,
        })
    };

    let created = docker.create_container(opts, create_config).await?;

    let start_target = if name.is_empty() { created.id } else { name };
    docker
        .start_container(&start_target, None::<StartContainerOptions<String>>)
        .await?;

    Ok(())
}

/// Stop → remove → recreate (with namespace isolation fixed) → start all violating containers.
pub async fn apply_namespace_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixOutcome> {
    if !supports_namespace_fix(rule_id) {
        return Ok(blocked(
            rule_id,
            "Namespace fix only supports rules 5.10, 5.16, 5.17, 5.21, 5.31",
        ));
    }

    let containers = docker.list_containers::<String>(None).await?;
    let mut updated: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    let mut compose_services: HashSet<String> = HashSet::new();

    for c in &containers {
        let id = c.id.as_deref().unwrap_or("");
        let inspect = match docker.inspect_container(id, None).await {
            Ok(i) => i,
            Err(e) => {
                failed.push(format!("{}: inspect failed: {e}", short_id(id)));
                continue;
            }
        };

        let hc = inspect.host_config.as_ref();
        let violates = match rule_id {
            "5.10" => hc.and_then(|h| h.network_mode.as_deref()) == Some("host"),
            "5.16" => hc.and_then(|h| h.pid_mode.as_deref()) == Some("host"),
            "5.17" => hc.and_then(|h| h.ipc_mode.as_deref()) == Some("host"),
            "5.21" => hc.and_then(|h| h.uts_mode.as_deref()) == Some("host"),
            "5.31" => hc.and_then(|h| h.userns_mode.as_deref()) == Some("host"),
            _ => false,
        };

        if !violates {
            continue;
        }

        let label = inspect
            .name
            .as_deref()
            .unwrap_or("")
            .trim_start_matches('/')
            .to_string();
        let label = if label.is_empty() {
            short_id(id)
        } else {
            label
        };

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_fix(docker, rule_id, &ctx).await {
                    Ok(()) => updated.push(format!("{}:{} (compose)", ctx.project, ctx.service)),
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match recreate_without_namespace(docker, id, inspect, rule_id).await {
            Ok(()) => updated.push(label),
            Err(e) => failed.push(format!("{label}: {e}")),
        }
    }

    if updated.is_empty() && failed.is_empty() {
        return Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Applied,
            message: "No containers needed namespace isolation fix".to_string(),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        });
    }

    let mut message = format!(
        "Recreated {} container(s) with isolated namespace",
        updated.len()
    );
    if !updated.is_empty() {
        let _ = write!(message, ": {}", updated.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    Ok(FixOutcome {
        rule_id: rule_id.to_string(),
        status: if updated.is_empty() && !failed.is_empty() {
            FixStatus::Blocked
        } else {
            FixStatus::Applied
        },
        message,
        requires_restart: false,
        restart_command: None,
        requires_elevation: false,
    })
}

async fn recreate_without_namespace(
    docker: &Docker,
    id: &str,
    inspect: ContainerInspectResponse,
    rule_id: &str,
) -> eyre::Result<()> {
    let name = inspect
        .name
        .as_deref()
        .unwrap_or("")
        .trim_start_matches('/')
        .to_string();

    let container_config = inspect
        .config
        .ok_or_else(|| eyre::eyre!("missing container config"))?;

    let mut host_config = inspect.host_config.unwrap_or_default();

    // Apply the specific namespace isolation fix
    match rule_id {
        "5.10" => host_config.network_mode = Some("bridge".to_string()),
        "5.16" => host_config.pid_mode = Some(String::new()),
        "5.17" => host_config.ipc_mode = Some("private".to_string()),
        "5.21" => host_config.uts_mode = Some(String::new()),
        "5.31" => host_config.userns_mode = Some(String::new()),
        _ => {}
    }

    // Stop with 10s grace period
    docker
        .stop_container(id, Some(StopContainerOptions { t: 10 }))
        .await?;

    // Remove (keep volumes)
    docker
        .remove_container(
            id,
            Some(RemoveContainerOptions {
                v: false,
                force: false,
                link: false,
            }),
        )
        .await?;

    // Reconstruct Config<String> from the inspect result
    let mut create_config: Config<String> = container_config.into();
    create_config.host_config = Some(host_config);

    let opts = if name.is_empty() {
        None
    } else {
        Some(CreateContainerOptions {
            name: name.clone(),
            platform: None,
        })
    };

    let created = docker.create_container(opts, create_config).await?;

    let start_target = if name.is_empty() { created.id } else { name };
    docker
        .start_container(&start_target, None::<StartContainerOptions<String>>)
        .await?;

    Ok(())
}

#[derive(Clone, Debug)]
struct ComposeContext {
    project: String,
    service: String,
    working_dir: Option<PathBuf>,
    config_files: Option<String>,
}

impl ComposeContext {
    fn key(&self) -> String {
        format!("{}:{}", self.project, self.service)
    }
}

fn compose_context_from_inspect(inspect: &ContainerInspectResponse) -> Option<ComposeContext> {
    let labels = inspect.config.as_ref()?.labels.as_ref()?;
    Some(ComposeContext {
        project: labels.get("com.docker.compose.project")?.clone(),
        service: labels.get("com.docker.compose.service")?.clone(),
        working_dir: labels
            .get("com.docker.compose.project.working_dir")
            .map(PathBuf::from),
        config_files: labels
            .get("com.docker.compose.project.config_files")
            .cloned(),
    })
}

async fn apply_compose_service_fix(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
) -> eyre::Result<()> {
    let compose_paths = resolve_compose_files(ctx).await?;
    let mut update: Option<(PathBuf, Value)> = None;
    let mut skipped = Vec::new();

    for compose_path in &compose_paths {
        let content = tokio::fs::read_to_string(compose_path).await?;
        let mut document: Value = serde_yaml::from_str(&content)?;

        match update_compose_document(&mut document, &ctx.service, rule_id) {
            Ok(true) => {
                update = Some((compose_path.clone(), document));
                break;
            }
            Ok(false) => skipped.push(format!(
                "{}: service setting not present",
                compose_path.display()
            )),
            Err(error) => skipped.push(format!("{}: {error}", compose_path.display())),
        }
    }

    let Some((compose_path, document)) = update else {
        return Err(eyre::eyre!(
            "compose service '{}' does not declare the setting required for rule {} ({})",
            ctx.service,
            rule_id,
            skipped.join("; ")
        ));
    };

    let backup_path = compose_backup_path(&compose_path);
    tokio::fs::copy(&compose_path, &backup_path).await?;
    tokio::fs::write(&compose_path, serde_yaml::to_string(&document)?).await?;

    if let Err(error) = run_compose_up(ctx, &compose_paths).await {
        let _ = tokio::fs::copy(&backup_path, &compose_path).await;
        return Err(eyre::eyre!(
            "{error}; compose file was restored from {}",
            backup_path.display()
        ));
    }

    verify_compose_service(docker, rule_id, ctx).await
}

async fn resolve_compose_files(ctx: &ComposeContext) -> eyre::Result<Vec<PathBuf>> {
    let mut candidates = Vec::new();

    if let Some(config_files) = &ctx.config_files {
        for raw in config_files.split(',') {
            let raw = raw.trim();
            if raw.is_empty() {
                continue;
            }
            let path = PathBuf::from(raw);
            let candidate = if path.is_absolute() {
                path
            } else if let Some(working_dir) = &ctx.working_dir {
                working_dir.join(path)
            } else {
                path
            };
            push_unique_path(&mut candidates, candidate);
        }
    }

    if let Some(working_dir) = &ctx.working_dir {
        for filename in COMPOSE_FILENAMES {
            push_unique_path(&mut candidates, working_dir.join(filename));
        }
    }

    let mut files = Vec::new();
    let mut tried = Vec::new();
    for path in candidates {
        match tokio::fs::metadata(&path).await {
            Ok(metadata) if metadata.is_file() => files.push(path),
            Ok(_) => tried.push(format!("{} is not a file", path.display())),
            Err(error) => tried.push(format!("{}: {error}", path.display())),
        }
    }

    if !files.is_empty() {
        return Ok(files);
    }

    Err(eyre::eyre!(
        "could not locate compose file for {}:{}{}",
        ctx.project,
        ctx.service,
        if tried.is_empty() {
            String::new()
        } else {
            format!(" ({})", tried.join("; "))
        }
    ))
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn compose_backup_path(path: &Path) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let filename = path.file_name().map_or_else(
        || "compose.yaml".to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    path.with_file_name(format!("{filename}.dokuru.bak.{timestamp}"))
}

fn update_compose_document(
    document: &mut Value,
    service: &str,
    rule_id: &str,
) -> eyre::Result<bool> {
    let Value::Mapping(root) = document else {
        return Err(eyre::eyre!("compose document root must be a mapping"));
    };
    let services = mapping_get_mut(root, "services")
        .ok_or_else(|| eyre::eyre!("compose file has no services section"))?;
    let Value::Mapping(services) = services else {
        return Err(eyre::eyre!("compose services section must be a mapping"));
    };
    let service_config = mapping_get_mut(services, service)
        .ok_or_else(|| eyre::eyre!("compose service '{service}' not found"))?;
    let Value::Mapping(service_config) = service_config else {
        return Err(eyre::eyre!("compose service '{service}' must be a mapping"));
    };

    let changed = match rule_id {
        "5.5" => set_service_bool(service_config, "privileged", false),
        "5.10" => remove_service_key(service_config, "network_mode"),
        "5.16" => remove_service_key(service_config, "pid"),
        "5.17" => remove_service_key(service_config, "ipc"),
        "5.21" => remove_service_key(service_config, "uts"),
        "5.31" => {
            remove_service_key(service_config, "userns_mode")
                | remove_service_key(service_config, "userns")
        }
        _ => false,
    };

    Ok(changed)
}

fn mapping_get_mut<'a>(mapping: &'a mut Mapping, key: &str) -> Option<&'a mut Value> {
    mapping.get_mut(Value::String(key.to_string()))
}

fn remove_service_key(mapping: &mut Mapping, key: &str) -> bool {
    mapping.remove(Value::String(key.to_string())).is_some()
}

fn set_service_bool(mapping: &mut Mapping, key: &str, value: bool) -> bool {
    let yaml_key = Value::String(key.to_string());
    if mapping.get(&yaml_key) == Some(&Value::Bool(value)) {
        return false;
    }
    if mapping.contains_key(&yaml_key) {
        mapping.insert(yaml_key, Value::Bool(value));
        return true;
    }
    false
}

async fn run_compose_up(ctx: &ComposeContext, compose_paths: &[PathBuf]) -> eyre::Result<()> {
    let mut command = Command::new("docker");
    command.arg("compose");
    for compose_path in compose_paths {
        command.arg("-f").arg(compose_path);
    }
    command.arg("up").arg("-d").arg(&ctx.service);

    if let Some(working_dir) = &ctx.working_dir {
        command.current_dir(working_dir);
    }

    let output = command.output().await?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(eyre::eyre!(
        "docker compose up failed: {}",
        if stderr.is_empty() { stdout } else { stderr }
    ))
}

async fn verify_compose_service(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
) -> eyre::Result<()> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut found = false;
    let mut still_violating = Vec::new();

    for container in &containers {
        let Some(labels) = container.labels.as_ref() else {
            continue;
        };
        if labels.get("com.docker.compose.project") != Some(&ctx.project)
            || labels.get("com.docker.compose.service") != Some(&ctx.service)
        {
            continue;
        }

        found = true;
        let Some(id) = container.id.as_deref() else {
            continue;
        };
        let inspect = docker.inspect_container(id, None).await?;
        if container_violates_rule(&inspect, rule_id) {
            still_violating.push(container_label(docker, id).await);
        }
    }

    if !found {
        return Err(eyre::eyre!(
            "compose service '{}:{}' was not running after compose up",
            ctx.project,
            ctx.service
        ));
    }

    if !still_violating.is_empty() {
        return Err(eyre::eyre!(
            "compose service still violates rule {}: {}",
            rule_id,
            still_violating.join(", ")
        ));
    }

    Ok(())
}

fn container_violates_rule(inspect: &ContainerInspectResponse, rule_id: &str) -> bool {
    let host_config = inspect.host_config.as_ref();
    match rule_id {
        "5.5" => host_config.and_then(|h| h.privileged).unwrap_or(false),
        "5.10" => host_config.and_then(|h| h.network_mode.as_deref()) == Some("host"),
        "5.16" => host_config.and_then(|h| h.pid_mode.as_deref()) == Some("host"),
        "5.17" => host_config.and_then(|h| h.ipc_mode.as_deref()) == Some("host"),
        "5.21" => host_config.and_then(|h| h.uts_mode.as_deref()) == Some("host"),
        "5.31" => host_config.and_then(|h| h.userns_mode.as_deref()) == Some("host"),
        _ => false,
    }
}

/// Merge a key into /etc/docker/daemon.json, creating the file if needed.
/// value must be a valid JSON value string, e.g. `"\"default\""` or `"true"`.
pub fn merge_daemon_json(key: &str, value: serde_json::Value) -> eyre::Result<()> {
    let path = "/etc/docker/daemon.json";
    let mut obj: serde_json::Map<String, serde_json::Value> = if std::path::Path::new(path).exists()
    {
        let content = std::fs::read_to_string(path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    obj.insert(key.to_string(), value);

    // Ensure directory exists
    std::fs::create_dir_all("/etc/docker")?;
    std::fs::write(path, serde_json::to_string_pretty(&obj)?)?;
    Ok(())
}

/// Append an audit rule line to /etc/audit/rules.d/docker.rules if not already present.
pub fn ensure_audit_rule(rule_line: &str) -> eyre::Result<bool> {
    let path = "/etc/audit/rules.d/docker.rules";
    std::fs::create_dir_all("/etc/audit/rules.d")?;

    let existing = std::fs::read_to_string(path).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == rule_line) {
        return Ok(false); // already present
    }

    let mut content = existing;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(rule_line);
    content.push('\n');
    std::fs::write(path, content)?;
    Ok(true) // newly added
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_compose_document_removes_namespace_setting() {
        let mut doc: Value = serde_yaml::from_str(
            r#"
services:
  web:
    image: nginx
    network_mode: host
"#,
        )
        .unwrap();

        assert!(update_compose_document(&mut doc, "web", "5.10").unwrap());

        let rendered = serde_yaml::to_string(&doc).unwrap();
        assert!(!rendered.contains("network_mode"));
        assert!(rendered.contains("image: nginx"));
    }

    #[test]
    fn update_compose_document_disables_privileged_service() {
        let mut doc: Value = serde_yaml::from_str(
            r#"
services:
  worker:
    image: alpine
    privileged: true
"#,
        )
        .unwrap();

        assert!(update_compose_document(&mut doc, "worker", "5.5").unwrap());

        let rendered = serde_yaml::to_string(&doc).unwrap();
        assert!(rendered.contains("privileged: false"));
    }
}
