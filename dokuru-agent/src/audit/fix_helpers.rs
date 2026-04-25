/// Shared helpers for `fix_fn` implementations
use crate::audit::types::{FixOutcome, FixStatus, FixTarget};
use bollard::{Docker, container::UpdateContainerOptions, models::ContainerSummary};
use std::fmt::Write as _;
use tokio::process::Command;

const DEFAULT_MEMORY_BYTES: i64 = 256 * 1024 * 1024;
const DEFAULT_CPU_SHARES: i64 = 512;
const DEFAULT_PIDS_LIMIT: i64 = 100;

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
