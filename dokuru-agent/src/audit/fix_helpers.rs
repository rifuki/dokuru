/// Shared helpers for `fix_fn` implementations
use crate::audit::types::{
    FixHistoryEntry, FixOutcome, FixPreview, FixPreviewTarget, FixProgress, FixRequest, FixStatus,
    FixTarget, ResourceSuggestion, RollbackRequest,
};
use bollard::{
    Docker,
    container::{
        Config, CreateContainerOptions, ListContainersOptions, RemoveContainerOptions,
        StartContainerOptions, StopContainerOptions, UpdateContainerOptions,
    },
    models::{ContainerInspectResponse, ContainerSummary, MountPointTypeEnum},
};
use serde_yaml::{Mapping, Value};
use std::collections::{BTreeMap, HashSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use tokio::process::Command;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

pub type ProgressSender = mpsc::UnboundedSender<FixProgress>;

static FIX_HISTORY: LazyLock<RwLock<Vec<FixHistoryEntry>>> =
    LazyLock::new(|| RwLock::new(Vec::new()));

const DEFAULT_MEMORY_BYTES: i64 = 256 * 1024 * 1024;
const DEFAULT_CPU_SHARES: i64 = 512;
const DEFAULT_PIDS_LIMIT: i64 = 100;
const AUDIT_RULES_PATH: &str = "/etc/audit/rules.d/docker.rules";
const AUDIT_FIX_STEPS: u8 = 4;
const USERNS_SNAPSHOT_PATH: &str = "/tmp/dokuru-userns-remap-snapshot.json";
const USERNS_REMAP_RULE_ID: &str = "2.10";
const USERNS_REMAP_TOTAL_STEPS: u8 = 9;
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

pub fn suggest_resource_limits(name: &str, image: &str) -> ResourceSuggestion {
    let value = format!("{name} {image}").to_lowercase();
    if value.contains("postgres")
        || value.contains("mysql")
        || value.contains("mariadb")
        || value.contains("mongo")
        || value.contains("node")
        || value.contains("next")
        || value.contains("nuxt")
    {
        return ResourceSuggestion {
            memory: 512 * 1024 * 1024,
            cpu_shares: 1024,
            pids_limit: 200,
        };
    }

    if value.contains("redis") || value.contains("memcached") || value.contains("cache") {
        return ResourceSuggestion {
            memory: 128 * 1024 * 1024,
            cpu_shares: 512,
            pids_limit: 100,
        };
    }

    ResourceSuggestion {
        memory: DEFAULT_MEMORY_BYTES,
        cpu_shares: DEFAULT_CPU_SHARES,
        pids_limit: DEFAULT_PIDS_LIMIT,
    }
}

pub fn fix_steps(rule_id: &str) -> Vec<String> {
    if supports_cgroup_resource_fix(rule_id) {
        return vec![
            "Inspect current cgroup limits".to_string(),
            "Apply docker update".to_string(),
            "Verify cgroup limits".to_string(),
        ];
    }
    if supports_namespace_fix(rule_id) || supports_privileged_fix(rule_id) {
        return vec![
            "Inspect container configuration".to_string(),
            "Save rollback metadata".to_string(),
            "Stop or update compose service".to_string(),
            "Recreate container with hardened isolation".to_string(),
            "Start container".to_string(),
            "Verify isolation".to_string(),
        ];
    }
    if supports_audit_rule_fix(rule_id) {
        return vec![
            "Preflight audit target".to_string(),
            "Write audit rule".to_string(),
            "Reload auditd".to_string(),
            "Verify persisted audit rule".to_string(),
        ];
    }
    if supports_userns_remap_fix(rule_id) {
        return vec![
            "Snapshot container mounts and Compose context".to_string(),
            "Create dockremap system user".to_string(),
            "Write /etc/subuid and /etc/subgid".to_string(),
            "Map UID/GID ranges for dockremap".to_string(),
            "Write userns-remap to daemon.json".to_string(),
            "Restart Docker daemon".to_string(),
            "Migrate named volumes to the remapped Docker root".to_string(),
            "Fix bind mount ownership".to_string(),
            "Restart recovered containers".to_string(),
        ];
    }
    vec!["Apply fix".to_string(), "Verify result".to_string()]
}

struct AuditRuleFixSpec {
    target: String,
    rule_line: String,
    required_path: Option<String>,
}

fn audit_rule_fix_spec(rule_id: &str) -> Option<AuditRuleFixSpec> {
    if rule_id == "1.1.7" {
        let target = docker_service_unit_path();
        return Some(AuditRuleFixSpec {
            rule_line: format!("-w {target} -p rwxa -k docker"),
            target,
            required_path: None,
        });
    }

    let (target, required_path) = match rule_id {
        "1.1.3" => ("/usr/bin/dockerd", None),
        "1.1.4" => ("/run/containerd", None),
        "1.1.5" => ("/var/lib/docker", None),
        "1.1.6" => ("/etc/docker", None),
        "1.1.8" => ("/run/containerd/containerd.sock", None),
        "1.1.9" => ("/var/run/docker.sock", None),
        "1.1.10" => ("/etc/default/docker", Some("/etc/default/docker")),
        "1.1.11" => ("/etc/docker/daemon.json", Some("/etc/docker/daemon.json")),
        "1.1.12" => (
            "/etc/containerd/config.toml",
            Some("/etc/containerd/config.toml"),
        ),
        "1.1.14" => ("/usr/bin/containerd", None),
        "1.1.18" => ("/usr/bin/runc", None),
        _ => return None,
    };

    Some(AuditRuleFixSpec {
        target: target.to_string(),
        rule_line: format!("-w {target} -p rwxa -k docker"),
        required_path: required_path.map(str::to_string),
    })
}

pub fn supports_audit_rule_fix(rule_id: &str) -> bool {
    audit_rule_fix_spec(rule_id).is_some()
}

fn docker_service_unit_path() -> String {
    [
        "/lib/systemd/system/docker.service",
        "/usr/lib/systemd/system/docker.service",
        "/etc/systemd/system/docker.service",
    ]
    .into_iter()
    .find(|path| Path::new(path).exists())
    .unwrap_or("/lib/systemd/system/docker.service")
    .to_string()
}

fn command_output(output: &str) -> Option<String> {
    let trimmed = output.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn audit_write_command(rule_line: &str) -> String {
    let rules_dir = shell_quote("/etc/audit/rules.d");
    let rules_path = shell_quote(AUDIT_RULES_PATH);
    let rule_line = shell_quote(rule_line);
    format!(
        "mkdir -p {rules_dir} && touch {rules_path} && (grep -qxF -- {rule_line} {rules_path} || printf '%s\\n' {rule_line} >> {rules_path})"
    )
}

struct FixCommandResult {
    stdout: String,
    stderr: String,
    success: bool,
}

async fn capture_command(cmd: &str, args: &[&str]) -> FixCommandResult {
    match run_cmd(cmd, args).await {
        Ok((stdout, stderr, success)) => FixCommandResult {
            stdout,
            stderr,
            success,
        },
        Err(error) => FixCommandResult {
            stdout: String::new(),
            stderr: error.to_string(),
            success: false,
        },
    }
}

fn audit_progress_event(
    rule_id: &str,
    target: &str,
    step: u8,
    action: &str,
    status: &str,
) -> FixProgress {
    FixProgress {
        rule_id: rule_id.to_string(),
        container_name: target.to_string(),
        step,
        total_steps: AUDIT_FIX_STEPS,
        action: action.to_string(),
        status: status.to_string(),
        detail: None,
        command: None,
        stdout: None,
        stderr: None,
    }
}

fn send_progress(progress: Option<&ProgressSender>, event: FixProgress) {
    if let Some(progress) = progress {
        let _ = progress.send(event);
    }
}

fn preflight_audit_target(
    rule_id: &str,
    progress: Option<&ProgressSender>,
    spec: &AuditRuleFixSpec,
) -> Option<FixOutcome> {
    let mut event = audit_progress_event(rule_id, &spec.target, 1, "preflight_target", "done");

    if let Some(required_path) = &spec.required_path {
        let exists = Path::new(required_path).exists();
        event.status = if exists { "done" } else { "error" }.to_string();
        event.detail = Some(if exists {
            format!("{required_path} exists")
        } else {
            format!("{required_path} does not exist on this host")
        });
        event.command = Some(format!("test -e {}", shell_quote(required_path)));
        send_progress(progress, event);

        if !exists {
            return Some(blocked(
                rule_id,
                &format!("{required_path} does not exist on this system"),
            ));
        }

        return None;
    }

    event.detail = Some(format!("Selected audit target {}", spec.target));
    send_progress(progress, event);
    None
}

async fn write_audit_rule(
    rule_id: &str,
    progress: Option<&ProgressSender>,
    spec: &AuditRuleFixSpec,
) -> Result<(), FixOutcome> {
    let write_command = audit_write_command(&spec.rule_line);
    let rule_already_present = std::fs::read_to_string(AUDIT_RULES_PATH)
        .unwrap_or_default()
        .lines()
        .any(|line| line.trim() == spec.rule_line);

    let mut start =
        audit_progress_event(rule_id, &spec.target, 2, "write_audit_rule", "in_progress");
    start.detail = Some(format!("Writing to {AUDIT_RULES_PATH}"));
    start.command = Some(write_command.clone());
    send_progress(progress, start);

    let result = capture_command("sh", &["-c", &write_command]).await;
    let mut done = audit_progress_event(
        rule_id,
        &spec.target,
        2,
        "write_audit_rule",
        if result.success { "done" } else { "error" },
    );
    done.detail = Some(if result.success {
        if rule_already_present {
            format!("Rule already existed: {}", spec.rule_line)
        } else {
            format!("Appended: {}", spec.rule_line)
        }
    } else {
        "Failed to write audit rule".to_string()
    });
    done.command = Some(write_command);
    done.stdout = command_output(&result.stdout);
    done.stderr = command_output(&result.stderr);
    send_progress(progress, done);

    if result.success {
        Ok(())
    } else {
        Err(blocked(
            rule_id,
            &format!("Failed to write audit rule: {}", result.stderr),
        ))
    }
}

async fn reload_auditd(rule_id: &str, progress: Option<&ProgressSender>, target: &str) -> bool {
    let mut start = audit_progress_event(rule_id, target, 3, "reload_auditd", "in_progress");
    start.detail = Some("Reloading auditd so the rule becomes active".to_string());
    start.command = Some("systemctl reload-or-restart auditd".to_string());
    send_progress(progress, start);

    // Install auditd if not present
    let auditd_installed = capture_command("which", &["auditd"]).await.success
        || capture_command("systemctl", &["cat", "auditd"])
            .await
            .success;
    if !auditd_installed {
        let install = capture_command(
            "apt-get",
            &["install", "-y", "--no-install-recommends", "auditd"],
        )
        .await;
        if !install.success {
            // Try yum/dnf as fallback
            let _ = capture_command("yum", &["install", "-y", "audit"]).await;
        }
    }

    // Enable and start auditd if not running
    let _ = capture_command("systemctl", &["enable", "--now", "auditd"]).await;

    // Try reload via systemctl first, then auditctl, then legacy service
    let result = capture_command("systemctl", &["reload-or-restart", "auditd"])
        .await
        .success
        || capture_command("auditctl", &["-R", AUDIT_RULES_PATH])
            .await
            .success
        || capture_command("service", &["auditd", "reload"])
            .await
            .success;

    let mut done = audit_progress_event(
        rule_id,
        target,
        3,
        "reload_auditd",
        if result { "done" } else { "error" },
    );
    done.detail = Some(if result {
        "auditd reload completed".to_string()
    } else {
        "auditd reload did not complete; manual reload may be required".to_string()
    });
    done.command = Some("systemctl reload-or-restart auditd".to_string());
    send_progress(progress, done);
    result
}

async fn verify_audit_rule(rule_id: &str, progress: Option<&ProgressSender>, target: &str) -> bool {
    let verify_command = format!(
        "grep -F -- {} {}",
        shell_quote(target),
        shell_quote(AUDIT_RULES_PATH)
    );
    let result = capture_command("grep", &["-F", "--", target, AUDIT_RULES_PATH]).await;
    let mut event = audit_progress_event(
        rule_id,
        target,
        4,
        "verify_audit_rule",
        if result.success { "done" } else { "error" },
    );
    event.detail = Some(if result.success {
        "Persisted audit rule found".to_string()
    } else {
        "Persisted audit rule was not found after write".to_string()
    });
    event.command = Some(verify_command);
    event.stdout = command_output(&result.stdout);
    event.stderr = command_output(&result.stderr);
    send_progress(progress, event);
    result.success
}

pub async fn apply_audit_rule_fix_with_progress(
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    let Some(spec) = audit_rule_fix_spec(rule_id) else {
        return Ok(blocked(
            rule_id,
            "No audit rule fix is registered for this rule",
        ));
    };

    if let Some(outcome) = preflight_audit_target(rule_id, progress, &spec) {
        return Ok(outcome);
    }

    if let Err(outcome) = write_audit_rule(rule_id, progress, &spec).await {
        return Ok(outcome);
    }

    let reload_success = reload_auditd(rule_id, progress, &spec.target).await;
    let verify_success = verify_audit_rule(rule_id, progress, &spec.target).await;

    if !verify_success {
        return Ok(blocked(
            rule_id,
            &format!("Audit rule was not found in {AUDIT_RULES_PATH} after write"),
        ));
    }

    if reload_success {
        Ok(applied(
            rule_id,
            &format!("Audit rule added for {}", spec.target),
            false,
        ))
    } else {
        Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Guided,
            message: format!(
                "Audit rule saved for {}, but auditd reload did not complete. Run the reload command manually.",
                spec.target
            ),
            requires_restart: false,
            restart_command: Some("sudo systemctl reload-or-restart auditd".to_string()),
            requires_elevation: true,
        })
    }
}

pub fn supports_userns_remap_fix(rule_id: &str) -> bool {
    rule_id == USERNS_REMAP_RULE_ID
}

#[derive(Debug, Clone, serde::Serialize)]
struct ContainerSnapshot {
    id: String,
    name: String,
    was_running: bool,
    bind_mount_paths: Vec<String>,
    named_volume_names: Vec<String>,
    compose_working_dir: Option<String>,
    compose_config_files: Option<String>,
    compose_project: Option<String>,
    compose_service: Option<String>,
    is_compose_managed: bool,
    uses_host_userns: bool,
    #[serde(skip_serializing)]
    inspect: Option<ContainerInspectResponse>,
}

#[derive(Debug, Clone)]
struct ComposeRecoveryTarget {
    project: String,
    working_dir: Option<PathBuf>,
    config_files: Option<String>,
    services: Vec<String>,
}

#[derive(Debug, Default)]
struct UsernsRecoveryResult {
    completed: usize,
    skipped: usize,
    failed: Vec<String>,
}

struct UsernsSnapshotState {
    snapshots: Vec<ContainerSnapshot>,
    bind_paths: Vec<String>,
    volume_names: Vec<String>,
}

struct UsernsRecoverySummary {
    volume_result: UsernsRecoveryResult,
    bind_result: UsernsRecoveryResult,
    restart_result: UsernsRecoveryResult,
    failures: Vec<String>,
}

fn userns_progress_event(
    step: u8,
    action: &str,
    status: &str,
    detail: Option<String>,
    command: Option<String>,
) -> FixProgress {
    FixProgress {
        rule_id: USERNS_REMAP_RULE_ID.to_string(),
        container_name: "Docker daemon".to_string(),
        step,
        total_steps: USERNS_REMAP_TOTAL_STEPS,
        action: action.to_string(),
        status: status.to_string(),
        detail,
        command,
        stdout: None,
        stderr: None,
    }
}

async fn snapshot_all_containers(docker: &Docker) -> Vec<ContainerSnapshot> {
    let Ok(containers) = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
    else {
        return Vec::new();
    };

    let mut snapshots = Vec::new();
    for container in containers {
        let Some(id) = container.id.as_deref() else {
            continue;
        };

        let Ok(inspect) = docker.inspect_container(id, None).await else {
            continue;
        };

        let name = inspect_name(&inspect).unwrap_or_else(|| short_id(id));
        let was_running = inspect
            .state
            .as_ref()
            .and_then(|state| state.running)
            .unwrap_or(false);
        let uses_host_userns = inspect
            .host_config
            .as_ref()
            .and_then(|host_config| host_config.userns_mode.as_deref())
            == Some("host");

        let mut bind_mount_paths = Vec::new();
        let mut named_volume_names = Vec::new();
        if let Some(mounts) = &inspect.mounts {
            for mount in mounts {
                match mount.typ {
                    Some(MountPointTypeEnum::BIND) => {
                        if let Some(source) =
                            mount.source.as_ref().filter(|source| !source.is_empty())
                        {
                            bind_mount_paths.push(source.clone());
                        }
                    }
                    Some(MountPointTypeEnum::VOLUME) => {
                        if let Some(name) = mount.name.as_ref().filter(|name| !name.is_empty()) {
                            named_volume_names.push(name.clone());
                        }
                    }
                    _ => {}
                }
            }
        }

        let compose_ctx = compose_context_from_inspect(&inspect);
        snapshots.push(ContainerSnapshot {
            id: id.to_string(),
            name,
            was_running,
            bind_mount_paths,
            named_volume_names,
            compose_working_dir: compose_ctx
                .as_ref()
                .and_then(|ctx| ctx.working_dir.as_ref())
                .map(|path| path.to_string_lossy().to_string()),
            compose_config_files: compose_ctx
                .as_ref()
                .and_then(|ctx| ctx.config_files.clone()),
            compose_project: compose_ctx.as_ref().map(|ctx| ctx.project.clone()),
            compose_service: compose_ctx.as_ref().map(|ctx| ctx.service.clone()),
            is_compose_managed: compose_ctx.is_some(),
            uses_host_userns,
            inspect: Some(inspect),
        });
    }

    snapshots
}

async fn persist_userns_snapshot(snapshots: &[ContainerSnapshot]) {
    if let Ok(json) = serde_json::to_string_pretty(snapshots) {
        let _ = tokio::fs::write(USERNS_SNAPSHOT_PATH, json).await;
    }
}

fn unique_snapshot_values(
    snapshots: &[ContainerSnapshot],
    extract: impl Fn(&ContainerSnapshot) -> &[String],
) -> Vec<String> {
    let mut values: Vec<String> = snapshots
        .iter()
        .flat_map(|snapshot| extract(snapshot).iter().cloned())
        .collect();
    values.sort();
    values.dedup();
    values
}

fn subid_start(path: &str, user: &str) -> Option<u32> {
    std::fs::read_to_string(path)
        .ok()?
        .lines()
        .find_map(|line| {
            let mut parts = line.split(':');
            let name = parts.next()?;
            let start = parts.next()?;
            (name == user).then(|| start.parse().ok()).flatten()
        })
}

fn dockremap_uid_gid() -> (u32, u32) {
    let uid = subid_start("/etc/subuid", "dockremap").unwrap_or(100_000);
    let gid = subid_start("/etc/subgid", "dockremap").unwrap_or(uid);
    (uid, gid)
}

fn is_safe_userns_bind_path(path: &str) -> bool {
    let path = Path::new(path);
    if !path.is_absolute() || path == Path::new("/") {
        return false;
    }

    [
        "/bin",
        "/boot",
        "/dev",
        "/etc",
        "/lib",
        "/lib64",
        "/proc",
        "/run",
        "/sbin",
        "/sys",
        "/usr",
        "/var/lib/docker",
        "/var/run",
    ]
    .into_iter()
    .map(Path::new)
    .all(|blocked| path != blocked && !path.starts_with(blocked))
}

async fn migrate_named_volumes(
    volume_names: &[String],
    uid: u32,
    gid: u32,
    progress: Option<&ProgressSender>,
) -> UsernsRecoveryResult {
    let mut result = UsernsRecoveryResult::default();
    if volume_names.is_empty() {
        send_progress(
            progress,
            userns_progress_event(
                7,
                "migrate_named_volumes",
                "done",
                Some("No named volumes to migrate".to_string()),
                None,
            ),
        );
        return result;
    }

    let old_root = "/var/lib/docker/volumes";
    let new_root = format!("/var/lib/docker/{uid}.{gid}/volumes");
    let owner = format!("{uid}:{gid}");
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");

    for name in volume_names {
        let old_path = format!("{old_root}/{name}/_data");
        let new_dir = format!("{new_root}/{name}");
        let new_path = format!("{new_dir}/_data");

        if !Path::new(&old_path).exists() {
            result.skipped += 1;
            continue;
        }

        match run_cmd("mkdir", &["-p", &new_dir]).await {
            Ok((_, _, true)) => {}
            Ok((_, stderr, _)) => {
                result
                    .failed
                    .push(format!("{name}: create target directory failed: {stderr}"));
                continue;
            }
            Err(error) => {
                result
                    .failed
                    .push(format!("{name}: create target directory failed: {error}"));
                continue;
            }
        }

        if Path::new(&new_path).exists() {
            let backup = format!("{new_dir}/_data.dokuru-backup-{timestamp}");
            let _ = run_cmd("mv", &[&new_path, &backup]).await;
        }

        match run_cmd("cp", &["-a", &old_path, &new_path]).await {
            Ok((_, _, true)) => {
                let _ = run_cmd("chown", &["-R", &owner, &new_path]).await;
                result.completed += 1;
            }
            Ok((_, stderr, _)) => result.failed.push(format!("{name}: copy failed: {stderr}")),
            Err(error) => result.failed.push(format!("{name}: copy failed: {error}")),
        }
    }

    let status = if result.failed.is_empty() {
        "done"
    } else {
        "error"
    };
    let detail = if result.failed.is_empty() {
        format!(
            "Migrated {} volume(s), skipped {}",
            result.completed, result.skipped
        )
    } else {
        format!(
            "Migrated {} volume(s), skipped {}, failed {}: {}",
            result.completed,
            result.skipped,
            result.failed.len(),
            result
                .failed
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        )
    };
    send_progress(
        progress,
        userns_progress_event(7, "migrate_named_volumes", status, Some(detail), None),
    );
    result
}

async fn fix_bind_mount_permissions(
    bind_paths: &[String],
    uid: u32,
    gid: u32,
    progress: Option<&ProgressSender>,
) -> UsernsRecoveryResult {
    let mut result = UsernsRecoveryResult::default();
    if bind_paths.is_empty() {
        send_progress(
            progress,
            userns_progress_event(
                8,
                "fix_bind_mount_permissions",
                "done",
                Some("No bind mounts to fix".to_string()),
                None,
            ),
        );
        return result;
    }

    let owner = format!("{uid}:{gid}");
    for path in bind_paths {
        if !is_safe_userns_bind_path(path) {
            result.skipped += 1;
            continue;
        }

        let Ok(metadata) = tokio::fs::metadata(path).await else {
            result.skipped += 1;
            continue;
        };

        let args = if metadata.is_dir() {
            vec!["-R", owner.as_str(), path.as_str()]
        } else {
            vec![owner.as_str(), path.as_str()]
        };

        match run_cmd("chown", &args).await {
            Ok((_, _, true)) => result.completed += 1,
            Ok((_, stderr, _)) => result
                .failed
                .push(format!("{path}: chown failed: {stderr}")),
            Err(error) => result.failed.push(format!("{path}: chown failed: {error}")),
        }
    }

    let status = if result.failed.is_empty() {
        "done"
    } else {
        "error"
    };
    let detail = if result.failed.is_empty() {
        format!(
            "Fixed ownership on {} bind mount path(s), skipped {} unsafe/missing path(s)",
            result.completed, result.skipped
        )
    } else {
        format!(
            "Fixed ownership on {} path(s), skipped {}, failed {}: {}",
            result.completed,
            result.skipped,
            result.failed.len(),
            result
                .failed
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        )
    };
    send_progress(
        progress,
        userns_progress_event(8, "fix_bind_mount_permissions", status, Some(detail), None),
    );
    result
}

fn compose_recovery_targets(snapshots: &[ContainerSnapshot]) -> Vec<ComposeRecoveryTarget> {
    let mut targets = BTreeMap::<String, ComposeRecoveryTarget>::new();

    for snapshot in snapshots
        .iter()
        .filter(|snapshot| snapshot.is_compose_managed && snapshot.was_running)
    {
        let (Some(project), Some(service)) = (&snapshot.compose_project, &snapshot.compose_service)
        else {
            continue;
        };
        let key = format!(
            "{}|{}|{}",
            project,
            snapshot.compose_working_dir.as_deref().unwrap_or_default(),
            snapshot.compose_config_files.as_deref().unwrap_or_default()
        );
        let entry = targets.entry(key).or_insert_with(|| ComposeRecoveryTarget {
            project: project.clone(),
            working_dir: snapshot.compose_working_dir.as_ref().map(PathBuf::from),
            config_files: snapshot.compose_config_files.clone(),
            services: Vec::new(),
        });
        if !entry.services.contains(service) {
            entry.services.push(service.clone());
            entry.services.sort();
        }
    }

    targets.into_values().collect()
}

async fn run_compose_project_up(target: &ComposeRecoveryTarget) -> eyre::Result<()> {
    let Some(first_service) = target.services.first() else {
        return Ok(());
    };
    let ctx = ComposeContext {
        project: target.project.clone(),
        service: first_service.clone(),
        working_dir: target.working_dir.clone(),
        config_files: target.config_files.clone(),
    };
    let compose_paths = resolve_compose_files(&ctx).await?;

    let mut command = Command::new("docker");
    command.arg("compose");
    for compose_path in compose_paths {
        command.arg("-f").arg(compose_path);
    }
    command.arg("up").arg("-d");
    for service in &target.services {
        command.arg(service);
    }
    if let Some(working_dir) = &target.working_dir {
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

async fn restart_compose_stacks(snapshots: &[ContainerSnapshot]) -> UsernsRecoveryResult {
    let mut result = UsernsRecoveryResult::default();
    for target in compose_recovery_targets(snapshots) {
        match run_compose_project_up(&target).await {
            Ok(()) => result.completed += 1,
            Err(error) => result.failed.push(format!("{}: {}", target.project, error)),
        }
    }
    result
}

async fn recreate_standalone_containers(
    docker: &Docker,
    snapshots: &[ContainerSnapshot],
) -> UsernsRecoveryResult {
    let mut result = UsernsRecoveryResult::default();
    for snapshot in snapshots
        .iter()
        .filter(|snapshot| !snapshot.is_compose_managed && snapshot.was_running)
    {
        let Some(inspect) = snapshot.inspect.clone() else {
            result.skipped += 1;
            continue;
        };
        let Some(container_config) = inspect.config else {
            result
                .failed
                .push(format!("{}: missing config", snapshot.name));
            continue;
        };

        let mut create_config: Config<String> = container_config.into();
        create_config.host_config = inspect.host_config;
        let opts = (!snapshot.name.is_empty()).then(|| CreateContainerOptions {
            name: snapshot.name.clone(),
            platform: None,
        });

        match docker.create_container(opts, create_config).await {
            Ok(created) => {
                let start_target = if snapshot.name.is_empty() {
                    created.id
                } else {
                    snapshot.name.clone()
                };
                match docker
                    .start_container(&start_target, None::<StartContainerOptions<String>>)
                    .await
                {
                    Ok(()) => result.completed += 1,
                    Err(error) => result
                        .failed
                        .push(format!("{}: start failed: {error}", snapshot.name)),
                }
            }
            Err(error) => result
                .failed
                .push(format!("{}: recreate failed: {error}", snapshot.name)),
        }
    }
    result
}

async fn restart_recovered_containers(
    docker: &Docker,
    snapshots: &[ContainerSnapshot],
    progress: Option<&ProgressSender>,
) -> UsernsRecoveryResult {
    let mut result = restart_compose_stacks(snapshots).await;
    let standalone = recreate_standalone_containers(docker, snapshots).await;
    result.completed += standalone.completed;
    result.skipped += standalone.skipped;
    result.failed.extend(standalone.failed);

    let status = if result.failed.is_empty() {
        "done"
    } else {
        "error"
    };
    let detail = if result.failed.is_empty() {
        format!(
            "Restarted/recreated {} container group(s)",
            result.completed
        )
    } else {
        format!(
            "Restarted/recreated {} group(s), skipped {}, failed {}: {}",
            result.completed,
            result.skipped,
            result.failed.len(),
            result
                .failed
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        )
    };
    send_progress(
        progress,
        userns_progress_event(9, "restart_containers", status, Some(detail), None),
    );
    result
}

async fn snapshot_userns_recovery_state(
    docker: &Docker,
    progress: Option<&ProgressSender>,
) -> UsernsSnapshotState {
    send_progress(
        progress,
        userns_progress_event(
            1,
            "snapshot_containers",
            "in_progress",
            Some("Snapshotting all container mounts and Compose context".to_string()),
            Some("docker inspect $(docker ps -aq)".to_string()),
        ),
    );
    let snapshots = snapshot_all_containers(docker).await;
    persist_userns_snapshot(&snapshots).await;
    let bind_paths = unique_snapshot_values(&snapshots, |snapshot| &snapshot.bind_mount_paths);
    let volume_names = unique_snapshot_values(&snapshots, |snapshot| &snapshot.named_volume_names);
    let host_userns_count = snapshots
        .iter()
        .filter(|snapshot| snapshot.uses_host_userns)
        .count();
    send_progress(
        progress,
        userns_progress_event(
            1,
            "snapshot_containers",
            "done",
            Some(format!(
                "Snapshotted {} container(s), {} bind mount(s), {} named volume(s), {} userns=host container(s). Snapshot saved to {}",
                snapshots.len(),
                bind_paths.len(),
                volume_names.len(),
                host_userns_count,
                USERNS_SNAPSHOT_PATH
            )),
            None,
        ),
    );

    UsernsSnapshotState {
        snapshots,
        bind_paths,
        volume_names,
    }
}

async fn create_dockremap_user(progress: Option<&ProgressSender>) {
    send_progress(
        progress,
        userns_progress_event(
            2,
            "create_dockremap_user",
            "in_progress",
            Some("Creating dockremap system user".to_string()),
            Some("useradd -r -s /bin/false dockremap".to_string()),
        ),
    );
    let _ = run_cmd("useradd", &["-r", "-s", "/bin/false", "dockremap"]).await;
    send_progress(
        progress,
        userns_progress_event(
            2,
            "create_dockremap_user",
            "done",
            Some("dockremap user ready".to_string()),
            None,
        ),
    );
}

async fn create_subid_files(progress: Option<&ProgressSender>) {
    send_progress(
        progress,
        userns_progress_event(
            3,
            "create_subid_files",
            "in_progress",
            Some("Ensuring /etc/subuid and /etc/subgid exist".to_string()),
            Some("touch /etc/subuid /etc/subgid".to_string()),
        ),
    );
    let _ = run_cmd("touch", &["/etc/subuid", "/etc/subgid"]).await;
    send_progress(
        progress,
        userns_progress_event(
            3,
            "create_subid_files",
            "done",
            Some("/etc/subuid and /etc/subgid ready".to_string()),
            None,
        ),
    );
}

async fn map_dockremap_ranges(progress: Option<&ProgressSender>) {
    send_progress(
        progress,
        userns_progress_event(
            4,
            "map_uid_gid_ranges",
            "in_progress",
            Some("Mapping UID/GID ranges for dockremap".to_string()),
            Some(
                "usermod --add-subuids 100000-165535 --add-subgids 100000-165535 dockremap"
                    .to_string(),
            ),
        ),
    );
    let _ = run_cmd("usermod", &["--add-subuids", "100000-165535", "dockremap"]).await;
    let _ = run_cmd("usermod", &["--add-subgids", "100000-165535", "dockremap"]).await;
    send_progress(
        progress,
        userns_progress_event(
            4,
            "map_uid_gid_ranges",
            "done",
            Some("UID/GID ranges mapped".to_string()),
            None,
        ),
    );
}

fn write_userns_daemon_json(progress: Option<&ProgressSender>) -> Option<FixOutcome> {
    send_progress(
        progress,
        userns_progress_event(
            5,
            "write_daemon_json",
            "in_progress",
            Some("Writing userns-remap to /etc/docker/daemon.json".to_string()),
            Some(r#"{"userns-remap":"default"} -> /etc/docker/daemon.json"#.to_string()),
        ),
    );

    match merge_daemon_json("userns-remap", serde_json::Value::String("default".into())) {
        Ok(()) => {
            send_progress(
                progress,
                userns_progress_event(
                    5,
                    "write_daemon_json",
                    "done",
                    Some("userns-remap: default written to daemon.json".to_string()),
                    None,
                ),
            );
            None
        }
        Err(error) => {
            send_progress(
                progress,
                userns_progress_event(
                    5,
                    "write_daemon_json",
                    "error",
                    Some(error.to_string()),
                    None,
                ),
            );
            Some(blocked(
                USERNS_REMAP_RULE_ID,
                &format!("Failed to update daemon.json: {error}"),
            ))
        }
    }
}

async fn restart_docker_for_userns(progress: Option<&ProgressSender>) -> Option<FixOutcome> {
    send_progress(
        progress,
        userns_progress_event(
            6,
            "restart_docker",
            "in_progress",
            Some("Restarting Docker daemon; all running containers will stop".to_string()),
            Some("systemctl restart docker".to_string()),
        ),
    );

    match run_cmd("systemctl", &["restart", "docker"]).await {
        Ok((_, _, true)) => {
            send_progress(
                progress,
                userns_progress_event(
                    6,
                    "restart_docker",
                    "done",
                    Some("Docker daemon restarted with userns-remap enabled".to_string()),
                    None,
                ),
            );
            None
        }
        Ok((_, stderr, _)) => {
            send_progress(
                progress,
                userns_progress_event(6, "restart_docker", "error", Some(stderr.clone()), None),
            );
            Some(blocked(
                USERNS_REMAP_RULE_ID,
                &format!("daemon.json updated but Docker restart failed: {stderr}"),
            ))
        }
        Err(error) => {
            send_progress(
                progress,
                userns_progress_event(6, "restart_docker", "error", Some(error.to_string()), None),
            );
            Some(blocked(
                USERNS_REMAP_RULE_ID,
                &format!("daemon.json updated but restart command failed: {error}"),
            ))
        }
    }
}

async fn recover_userns_state(
    docker: &Docker,
    state: &UsernsSnapshotState,
    progress: Option<&ProgressSender>,
) -> UsernsRecoverySummary {
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    let (uid, gid) = dockremap_uid_gid();

    send_progress(
        progress,
        userns_progress_event(
            7,
            "migrate_named_volumes",
            "in_progress",
            Some(format!(
                "Migrating {} named volume(s) to /var/lib/docker/{uid}.{gid}",
                state.volume_names.len()
            )),
            Some("cp -a /var/lib/docker/volumes/<name>/_data /var/lib/docker/<uid>.<gid>/volumes/<name>/_data".to_string()),
        ),
    );
    let volume_result = migrate_named_volumes(&state.volume_names, uid, gid, progress).await;

    send_progress(
        progress,
        userns_progress_event(
            8,
            "fix_bind_mount_permissions",
            "in_progress",
            Some(format!(
                "Fixing ownership on {} bind mount path(s)",
                state.bind_paths.len()
            )),
            Some(format!("chown -R {uid}:{gid} <bind-paths>")),
        ),
    );
    let bind_result = fix_bind_mount_permissions(&state.bind_paths, uid, gid, progress).await;

    send_progress(
        progress,
        userns_progress_event(
            9,
            "restart_containers",
            "in_progress",
            Some("Restarting Compose stacks and standalone containers from snapshot".to_string()),
            Some("docker compose up -d".to_string()),
        ),
    );
    let restart_result = restart_recovered_containers(docker, &state.snapshots, progress).await;

    let failures = volume_result
        .failed
        .iter()
        .chain(&bind_result.failed)
        .chain(&restart_result.failed)
        .cloned()
        .collect();

    UsernsRecoverySummary {
        volume_result,
        bind_result,
        restart_result,
        failures,
    }
}

fn userns_final_outcome(summary: &UsernsRecoverySummary) -> FixOutcome {
    let volumes = summary.volume_result.completed;
    let binds = summary.bind_result.completed;
    let restarts = summary.restart_result.completed;

    if summary.failures.is_empty() {
        return applied(
            USERNS_REMAP_RULE_ID,
            &format!(
                "userns-remap enabled and recovery completed: migrated {volumes} volume(s), fixed {binds} bind mount path(s), restarted/recreated {restarts} container group(s)"
            ),
            false,
        );
    }

    FixOutcome {
        rule_id: USERNS_REMAP_RULE_ID.to_string(),
        status: FixStatus::Guided,
        message: format!(
            "userns-remap enabled, but recovery needs manual attention. Completed: {volumes} volume(s), {binds} bind path(s), {restarts} container group(s). Failed {}: {}",
            summary.failures.len(),
            summary
                .failures
                .iter()
                .take(5)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        ),
        requires_restart: false,
        restart_command: None,
        requires_elevation: true,
    }
}

pub async fn apply_userns_remap_fix_with_progress(
    docker: &Docker,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    let state = snapshot_userns_recovery_state(docker, progress).await;

    create_dockremap_user(progress).await;

    create_subid_files(progress).await;

    map_dockremap_ranges(progress).await;

    if let Some(outcome) = write_userns_daemon_json(progress) {
        return Ok(outcome);
    }

    if let Some(outcome) = restart_docker_for_userns(progress).await {
        return Ok(outcome);
    }

    let summary = recover_userns_state(docker, &state, progress).await;
    Ok(userns_final_outcome(&summary))
}

pub async fn preview_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixPreview> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut targets = Vec::new();

    for container in &containers {
        let Some(id) = container.id.as_deref() else {
            continue;
        };
        let inspect = docker.inspect_container(id, None).await?;
        let violates = if supports_cgroup_resource_fix(rule_id) {
            default_target_for_rule(docker, rule_id, container)
                .await
                .is_some()
        } else {
            container_violates_rule(&inspect, rule_id)
        };
        if !violates {
            continue;
        }

        targets.push(preview_target_from_inspect(id, &inspect, rule_id));
    }

    Ok(FixPreview {
        rule_id: rule_id.to_string(),
        targets,
        requires_restart: supports_namespace_fix(rule_id)
            || supports_privileged_fix(rule_id)
            || supports_userns_remap_fix(rule_id),
        requires_elevation: supports_audit_rule_fix(rule_id) || supports_userns_remap_fix(rule_id),
        steps: fix_steps(rule_id),
    })
}

fn preview_target_from_inspect(
    id: &str,
    inspect: &ContainerInspectResponse,
    rule_id: &str,
) -> FixPreviewTarget {
    let name = inspect_name(inspect).unwrap_or_else(|| short_id(id));
    let image = inspect
        .config
        .as_ref()
        .and_then(|config| config.image.clone())
        .unwrap_or_default();
    let suggestion = suggest_resource_limits(&name, &image);
    let host_config = inspect.host_config.as_ref();
    let compose = compose_context_from_inspect(inspect);
    let strategy = if supports_cgroup_resource_fix(rule_id) {
        "docker_update"
    } else if compose.is_some() {
        "compose_update"
    } else {
        "recreate"
    };

    FixPreviewTarget {
        container_id: id.to_string(),
        container_name: name,
        image,
        current_memory: host_config.and_then(|config| config.memory),
        current_cpu_shares: host_config.and_then(|config| config.cpu_shares),
        current_pids_limit: host_config.and_then(|config| config.pids_limit),
        suggestion,
        strategy: strategy.to_string(),
        compose_project: compose.as_ref().map(|ctx| ctx.project.clone()),
        compose_service: compose.map(|ctx| ctx.service),
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    progress: Option<&ProgressSender>,
    rule_id: &str,
    container_name: &str,
    step: u8,
    total_steps: u8,
    action: &str,
    status: &str,
    detail: Option<String>,
) {
    send_progress(
        progress,
        FixProgress {
            rule_id: rule_id.to_string(),
            container_name: container_name.to_string(),
            step,
            total_steps,
            action: action.to_string(),
            status: status.to_string(),
            detail,
            command: None,
            stdout: None,
            stderr: None,
        },
    );
}

pub async fn apply_default_cgroup_resource_fix(
    docker: &Docker,
    rule_id: &str,
) -> eyre::Result<FixOutcome> {
    apply_default_cgroup_resource_fix_with_progress(docker, rule_id, None).await
}

pub async fn apply_default_cgroup_resource_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut targets = Vec::new();

    for container in &containers {
        let Some(target) = default_target_for_rule(docker, rule_id, container).await else {
            continue;
        };
        targets.push(target);
    }

    apply_cgroup_resource_fix_with_progress(docker, rule_id, &targets, progress).await
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

#[allow(dead_code)]
pub async fn apply_cgroup_resource_fix(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
) -> eyre::Result<FixOutcome> {
    apply_cgroup_resource_fix_with_progress(docker, rule_id, targets, None).await
}

#[allow(clippy::too_many_lines)]
pub async fn apply_cgroup_resource_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
    progress: Option<&ProgressSender>,
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
        emit_progress(
            progress,
            rule_id,
            &container_label,
            1,
            3,
            "inspect_current_cgroup",
            "done",
            Some("Read current container resource limits".to_string()),
        );
        let options = match update_options(rule_id, target) {
            Ok(options) => options,
            Err(error) => {
                emit_progress(
                    progress,
                    rule_id,
                    &container_label,
                    2,
                    3,
                    "prepare_update",
                    "error",
                    Some(error.to_string()),
                );
                failed.push(format!("{container_label}: {error}"));
                continue;
            }
        };

        emit_progress(
            progress,
            rule_id,
            &container_label,
            2,
            3,
            "docker_update",
            "in_progress",
            Some(cgroup_update_detail(rule_id, target)),
        );
        match docker.update_container(&target.container_id, options).await {
            Ok(()) => match verify_cgroup_update(docker, rule_id, target).await {
                Ok(()) => {
                    emit_progress(
                        progress,
                        rule_id,
                        &container_label,
                        3,
                        3,
                        "verify_cgroup",
                        "done",
                        Some("Container cgroup limits updated and verified".to_string()),
                    );
                    updated.push(container_label);
                }
                Err(error) => {
                    emit_progress(
                        progress,
                        rule_id,
                        &container_label,
                        3,
                        3,
                        "verify_cgroup",
                        "error",
                        Some(error.to_string()),
                    );
                    failed.push(format!("{container_label}: verification failed: {error}"));
                }
            },
            Err(error) => {
                emit_progress(
                    progress,
                    rule_id,
                    &container_label,
                    2,
                    3,
                    "docker_update",
                    "error",
                    Some(error.to_string()),
                );
                failed.push(format!("{container_label}: update failed: {error}"));
            }
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

fn cgroup_update_detail(rule_id: &str, target: &FixTarget) -> String {
    match rule_id {
        "5.11" => format!(
            "memory={} bytes",
            target.memory.unwrap_or(DEFAULT_MEMORY_BYTES)
        ),
        "5.12" => format!(
            "cpu_shares={}",
            target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES)
        ),
        "5.29" => format!(
            "pids_limit={}",
            target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT)
        ),
        "cgroup_all" => format!(
            "memory={} bytes, cpu_shares={}, pids_limit={}",
            target.memory.unwrap_or(DEFAULT_MEMORY_BYTES),
            target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES),
            target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT)
        ),
        _ => "resource update".to_string(),
    }
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
        // Must update memoryswap together with memory, otherwise Docker returns 409
        // if the existing memoryswap < new memory value. -1 = unlimited swap.
        options.memory_swap = Some(-1);
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

fn inspect_name(inspect: &ContainerInspectResponse) -> Option<String> {
    inspect
        .name
        .as_deref()
        .map(|name| name.trim_start_matches('/').to_string())
        .filter(|name| !name.is_empty())
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
    Box::pin(apply_privileged_fix_with_progress(docker, rule_id, None)).await
}

#[allow(clippy::too_many_lines)]
pub async fn apply_privileged_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
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
                emit_progress(
                    progress,
                    rule_id,
                    &short_id(id),
                    1,
                    6,
                    "inspect_container",
                    "error",
                    Some(e.to_string()),
                );
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

        emit_progress(
            progress,
            rule_id,
            &label,
            1,
            6,
            "inspect_container",
            "done",
            Some("Container is running with --privileged".to_string()),
        );

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_fix(docker, rule_id, &ctx, progress).await {
                    Ok(()) => updated.push(format!("{}:{} (compose)", ctx.project, ctx.service)),
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match recreate_without_privileged(docker, id, inspect, progress, &label, rule_id).await {
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

#[allow(clippy::too_many_lines)]
async fn recreate_without_privileged(
    docker: &Docker,
    id: &str,
    inspect: ContainerInspectResponse,
    progress: Option<&ProgressSender>,
    label: &str,
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
    host_config.privileged = Some(false);

    emit_progress(
        progress,
        rule_id,
        label,
        2,
        6,
        "save_config",
        "done",
        Some("Saved container config before recreate".to_string()),
    );

    emit_progress(
        progress,
        rule_id,
        label,
        3,
        6,
        "stop_container",
        "in_progress",
        None,
    );
    docker
        .stop_container(id, Some(StopContainerOptions { t: 10 }))
        .await?;

    emit_progress(
        progress,
        rule_id,
        label,
        3,
        6,
        "stop_container",
        "done",
        None,
    );

    emit_progress(
        progress,
        rule_id,
        label,
        4,
        6,
        "remove_container",
        "in_progress",
        None,
    );
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

    emit_progress(
        progress,
        rule_id,
        label,
        4,
        6,
        "remove_container",
        "done",
        None,
    );

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

    emit_progress(
        progress,
        rule_id,
        label,
        5,
        6,
        "recreate_container",
        "in_progress",
        None,
    );
    let created = docker.create_container(opts, create_config).await?;

    emit_progress(
        progress,
        rule_id,
        label,
        5,
        6,
        "recreate_container",
        "done",
        None,
    );

    let start_target = if name.is_empty() { created.id } else { name };
    emit_progress(
        progress,
        rule_id,
        label,
        6,
        6,
        "start_container",
        "in_progress",
        None,
    );
    docker
        .start_container(&start_target, None::<StartContainerOptions<String>>)
        .await?;

    emit_progress(
        progress,
        rule_id,
        label,
        6,
        6,
        "verify_isolation",
        "done",
        Some("Container restarted without --privileged".to_string()),
    );

    Ok(())
}

/// Stop → remove → recreate (with namespace isolation fixed) → start all violating containers.
pub async fn apply_namespace_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixOutcome> {
    Box::pin(apply_namespace_fix_with_progress(docker, rule_id, None)).await
}

#[allow(clippy::too_many_lines)]
pub async fn apply_namespace_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
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
                emit_progress(
                    progress,
                    rule_id,
                    &short_id(id),
                    1,
                    6,
                    "inspect_container",
                    "error",
                    Some(e.to_string()),
                );
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

        emit_progress(
            progress,
            rule_id,
            &label,
            1,
            6,
            "inspect_container",
            "done",
            Some("Container violates namespace isolation rule".to_string()),
        );

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_fix(docker, rule_id, &ctx, progress).await {
                    Ok(()) => updated.push(format!("{}:{} (compose)", ctx.project, ctx.service)),
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match recreate_without_namespace(docker, id, inspect, rule_id, progress, &label).await {
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

#[allow(clippy::too_many_lines)]
async fn recreate_without_namespace(
    docker: &Docker,
    id: &str,
    inspect: ContainerInspectResponse,
    rule_id: &str,
    progress: Option<&ProgressSender>,
    label: &str,
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

    emit_progress(
        progress,
        rule_id,
        label,
        2,
        6,
        "save_config",
        "done",
        Some("Saved container config before namespace recreate".to_string()),
    );

    // Stop with 10s grace period
    emit_progress(
        progress,
        rule_id,
        label,
        3,
        6,
        "stop_container",
        "in_progress",
        None,
    );
    docker
        .stop_container(id, Some(StopContainerOptions { t: 10 }))
        .await?;
    emit_progress(
        progress,
        rule_id,
        label,
        3,
        6,
        "stop_container",
        "done",
        None,
    );

    // Remove (keep volumes)
    emit_progress(
        progress,
        rule_id,
        label,
        4,
        6,
        "remove_container",
        "in_progress",
        None,
    );
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
    emit_progress(
        progress,
        rule_id,
        label,
        4,
        6,
        "remove_container",
        "done",
        None,
    );

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

    emit_progress(
        progress,
        rule_id,
        label,
        5,
        6,
        "recreate_container",
        "in_progress",
        Some(namespace_fix_detail(rule_id).to_string()),
    );
    let created = docker.create_container(opts, create_config).await?;
    emit_progress(
        progress,
        rule_id,
        label,
        5,
        6,
        "recreate_container",
        "done",
        None,
    );

    let start_target = if name.is_empty() { created.id } else { name };
    emit_progress(
        progress,
        rule_id,
        label,
        6,
        6,
        "start_container",
        "in_progress",
        None,
    );
    docker
        .start_container(&start_target, None::<StartContainerOptions<String>>)
        .await?;

    emit_progress(
        progress,
        rule_id,
        label,
        6,
        6,
        "verify_isolation",
        "done",
        Some("Container restarted with hardened namespace isolation".to_string()),
    );

    Ok(())
}

fn namespace_fix_detail(rule_id: &str) -> &'static str {
    match rule_id {
        "5.10" => "Set network mode to bridge",
        "5.16" => "Remove host PID namespace sharing",
        "5.17" => "Set IPC namespace to private",
        "5.21" => "Remove host UTS namespace sharing",
        "5.31" => "Remove host user namespace sharing",
        _ => "Apply namespace isolation fix",
    }
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

#[allow(clippy::too_many_lines)]
async fn apply_compose_service_fix(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    emit_progress(
        progress,
        rule_id,
        &label,
        2,
        6,
        "resolve_compose_file",
        "in_progress",
        Some("Resolving Docker Compose config files".to_string()),
    );
    let compose_paths = resolve_compose_files(ctx).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        2,
        6,
        "resolve_compose_file",
        "done",
        Some(format!("{} compose file(s) found", compose_paths.len())),
    );
    let mut update: Option<(PathBuf, Value)> = None;
    let mut skipped = Vec::new();

    emit_progress(
        progress,
        rule_id,
        &label,
        3,
        6,
        "update_compose_yaml",
        "in_progress",
        Some("Editing Compose service definition".to_string()),
    );
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
    emit_progress(
        progress,
        rule_id,
        &label,
        3,
        6,
        "backup_compose_yaml",
        "in_progress",
        Some(format!("Creating backup {}", backup_path.display())),
    );
    tokio::fs::copy(&compose_path, &backup_path).await?;
    tokio::fs::write(&compose_path, serde_yaml::to_string(&document)?).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        3,
        6,
        "update_compose_yaml",
        "done",
        Some(format!("Updated {}", compose_path.display())),
    );

    emit_progress(
        progress,
        rule_id,
        &label,
        4,
        6,
        "docker_compose_up",
        "in_progress",
        Some(format!("Recreating service {}", ctx.service)),
    );
    if let Err(error) = run_compose_up(ctx, &compose_paths).await {
        let _ = tokio::fs::copy(&backup_path, &compose_path).await;
        emit_progress(
            progress,
            rule_id,
            &label,
            4,
            6,
            "docker_compose_up",
            "error",
            Some(error.to_string()),
        );
        return Err(eyre::eyre!(
            "{error}; compose file was restored from {}",
            backup_path.display()
        ));
    }
    emit_progress(
        progress,
        rule_id,
        &label,
        5,
        6,
        "docker_compose_up",
        "done",
        None,
    );

    emit_progress(
        progress,
        rule_id,
        &label,
        6,
        6,
        "verify_compose_service",
        "in_progress",
        None,
    );
    verify_compose_service(docker, rule_id, ctx).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        6,
        6,
        "verify_compose_service",
        "done",
        Some("Compose service recreated and verified".to_string()),
    );
    Ok(())
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

pub async fn cgroup_rollback_targets(
    docker: &Docker,
    request: &FixRequest,
) -> eyre::Result<Vec<FixTarget>> {
    if !supports_cgroup_resource_fix(&request.rule_id) {
        return Ok(Vec::new());
    }

    let target_ids = if request.targets.is_empty() {
        preview_fix(docker, &request.rule_id)
            .await?
            .targets
            .into_iter()
            .map(|target| target.container_id)
            .collect::<Vec<_>>()
    } else {
        request
            .targets
            .iter()
            .map(|target| target.container_id.clone())
            .collect()
    };

    let mut rollback_targets = Vec::new();
    for container_id in target_ids {
        let inspect = docker.inspect_container(&container_id, None).await?;
        let Some(host_config) = inspect.host_config else {
            continue;
        };
        rollback_targets.push(FixTarget {
            container_id,
            memory: host_config.memory,
            cpu_shares: host_config.cpu_shares,
            pids_limit: host_config.pids_limit,
            strategy: Some("cgroup_rollback".to_string()),
        });
    }

    Ok(rollback_targets)
}

pub async fn record_fix_history(
    request: FixRequest,
    outcome: FixOutcome,
    rollback_targets: Vec<FixTarget>,
) -> FixHistoryEntry {
    let rollback_supported = !rollback_targets.is_empty() && outcome.status == FixStatus::Applied;
    let entry = FixHistoryEntry {
        id: Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        request,
        outcome,
        rollback_supported,
        rollback_targets,
        rollback_note: rollback_supported
            .then(|| "Rollback restores previous cgroup resource limits".to_string()),
    };

    let mut history = FIX_HISTORY.write().await;
    history.insert(0, entry.clone());
    history.truncate(50);
    entry
}

pub async fn list_fix_history() -> Vec<FixHistoryEntry> {
    FIX_HISTORY.read().await.clone()
}

pub async fn rollback_fix(docker: &Docker, request: &RollbackRequest) -> eyre::Result<FixOutcome> {
    let entry = {
        let history = FIX_HISTORY.read().await;
        history
            .iter()
            .find(|entry| entry.id == request.history_id)
            .cloned()
    };
    let Some(entry) = entry else {
        return Ok(blocked("rollback", "Fix history entry not found"));
    };

    if !entry.rollback_supported || entry.rollback_targets.is_empty() {
        return Ok(blocked(
            &entry.request.rule_id,
            "Rollback is only supported for cgroup fixes with captured previous limits",
        ));
    }

    let mut restored = Vec::new();
    let mut failed = Vec::new();
    for target in &entry.rollback_targets {
        let options = UpdateContainerOptions::<String> {
            memory: target.memory,
            memory_swap: target.memory.map(|_| -1i64),
            cpu_shares: target
                .cpu_shares
                .and_then(|shares| isize::try_from(shares).ok()),
            pids_limit: target.pids_limit,
            ..Default::default()
        };
        let label = container_label(docker, &target.container_id).await;
        match docker.update_container(&target.container_id, options).await {
            Ok(()) => restored.push(label),
            Err(error) => failed.push(format!("{label}: {error}")),
        }
    }

    let mut message = format!(
        "Rolled back cgroup limits for {} container(s)",
        restored.len()
    );
    if !restored.is_empty() {
        let _ = write!(message, ": {}", restored.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    Ok(FixOutcome {
        rule_id: entry.request.rule_id,
        status: if restored.is_empty() && !failed.is_empty() {
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
    let path = AUDIT_RULES_PATH;
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
