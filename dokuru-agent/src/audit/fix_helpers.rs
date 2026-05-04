/// Shared helpers for `fix_fn` implementations
use crate::audit::types::{
    ComposeRollbackTarget, FixHistoryEntry, FixOutcome, FixPreview, FixPreviewTarget, FixProgress,
    FixRequest, FixStatus, FixTarget, ResourceSuggestion, RollbackRequest,
};
use bollard::{
    Docker,
    container::{
        Config, CreateContainerOptions, ListContainersOptions, RemoveContainerOptions,
        StartContainerOptions, StopContainerOptions, UpdateContainerOptions,
    },
    models::{ContainerInspectResponse, ContainerSummary, HealthConfig, MountPointTypeEnum},
};
use serde_yaml::{Mapping as YamlMapping, Value as YamlValue};
use std::collections::{BTreeMap, HashSet};
use std::fmt::Write as _;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::LazyLock;
use tokio::process::Command;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;
use yaml_edit::YamlFile;

pub type ProgressSender = mpsc::UnboundedSender<FixProgress>;

#[derive(Default)]
pub struct RollbackPlan {
    pub cgroup_targets: Vec<FixTarget>,
    pub compose_targets: Vec<ComposeRollbackTarget>,
}

static FIX_HISTORY: LazyLock<RwLock<Vec<FixHistoryEntry>>> =
    LazyLock::new(|| RwLock::new(Vec::new()));

fn dokuru_data_dir() -> PathBuf {
    std::env::var("DOKURU_DATA_DIR").map_or_else(
        |_| {
            if cfg!(debug_assertions) {
                std::env::current_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(".dokuru")
            } else {
                PathBuf::from("/var/lib/dokuru")
            }
        },
        PathBuf::from,
    )
}

fn fix_history_path() -> PathBuf {
    dokuru_data_dir().join("fix-history.json")
}

async fn read_persisted_fix_history() -> Vec<FixHistoryEntry> {
    let path = fix_history_path();
    match tokio::fs::read(&path).await {
        Ok(json) => match serde_json::from_slice::<Vec<FixHistoryEntry>>(&json) {
            Ok(history) => history,
            Err(error) => {
                tracing::warn!(path = %path.display(), %error, "Failed to parse fix history");
                Vec::new()
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => {
            tracing::warn!(path = %path.display(), %error, "Failed to read fix history");
            Vec::new()
        }
    }
}

async fn write_persisted_fix_history(history: &[FixHistoryEntry]) {
    let path = fix_history_path();
    let Some(dir) = path.parent() else {
        return;
    };
    if let Err(error) = tokio::fs::create_dir_all(dir).await {
        tracing::warn!(path = %dir.display(), %error, "Failed to create fix history directory");
        return;
    }
    let json = match serde_json::to_vec_pretty(history) {
        Ok(json) => json,
        Err(error) => {
            tracing::warn!(%error, "Failed to serialize fix history");
            return;
        }
    };
    if let Err(error) = tokio::fs::write(&path, json).await {
        tracing::warn!(path = %path.display(), %error, "Failed to write fix history");
    }
}

async fn fix_history_snapshot() -> Vec<FixHistoryEntry> {
    let history = FIX_HISTORY.read().await.clone();
    if !history.is_empty() {
        return history;
    }

    let persisted = read_persisted_fix_history().await;
    if !persisted.is_empty() {
        *FIX_HISTORY.write().await = persisted.clone();
    }
    persisted
}

const DEFAULT_MEMORY_BYTES: i64 = 256 * 1024 * 1024;
const DEFAULT_CPU_SHARES: i64 = 512;
const DEFAULT_PIDS_LIMIT: i64 = 100;
const DEFAULT_NON_ROOT_USER: &str = "1000:1000";
const DEFAULT_HEALTHCHECK_TEST: &str = "test -e /proc/1/stat || exit 1";
const DEFAULT_HEALTHCHECK_INTERVAL_NANOS: i64 = 30_000_000_000;
const DEFAULT_HEALTHCHECK_TIMEOUT_NANOS: i64 = 10_000_000_000;
const DEFAULT_HEALTHCHECK_START_PERIOD_NANOS: i64 = 10_000_000_000;
const AUDIT_RULES_PATH: &str = "/etc/audit/rules.d/docker.rules";
const AUDIT_FIX_STEPS: u8 = 4;
const DOCKER_ROOT_PARTITION_RULE_ID: &str = "1.1.1";
const DOCKER_ROOT_PARTITION_FIX_STEPS: u8 = 9;
const MIN_DOCKER_ROOT_LV_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const DOCKER_ROOT_LV_HEADROOM_BYTES: u64 = 1024 * 1024 * 1024;
const USERNS_SNAPSHOT_PATH: &str = "/tmp/dokuru-userns-remap-snapshot.json";
const USERNS_REMAP_RULE_ID: &str = "2.10";
const USERNS_REMAP_TOTAL_STEPS: u8 = 9;
const STRATEGY_DOKURU_OVERRIDE: &str = "dokuru_override";
const STRATEGY_COMPOSE_UPDATE: &str = "compose_update";
const STRATEGY_DOCKER_UPDATE: &str = "docker_update";
const STRATEGY_DOCKERFILE_UPDATE: &str = "dockerfile_update";
const DEFAULT_COMPOSE_OVERRIDE_FILENAME: &str = "docker-compose.override.yml";
const COMPOSE_BACKUP_DIR: &str = "compose-backups";
const COMPOSE_FILENAMES: &[&str] = &[
    "compose.yaml",
    "docker-compose.yaml",
    "docker-compose.yml",
    "compose.yml",
];
const RUNTIME_BIND_COMPONENTS: &[&str] = &[
    "cache",
    "data",
    "database",
    "db",
    "log",
    "logs",
    "postgres_data",
    "redis_data",
    "sessions",
    "state",
    "storage",
    "tmp",
    "uploads",
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
    matches!(rule_id, "5.11" | "5.12" | "5.25" | "5.29" | "cgroup_all")
}

fn cgroup_effective_rule_id(rule_id: &str) -> &str {
    if rule_id == "5.25" {
        "cgroup_all"
    } else {
        rule_id
    }
}

pub fn supports_image_config_fix(rule_id: &str) -> bool {
    matches!(rule_id, "4.1" | "4.6")
}

fn is_dokuru_override_strategy(strategy: Option<&str>) -> bool {
    strategy == Some(STRATEGY_DOKURU_OVERRIDE)
}

fn is_compose_source_strategy(strategy: Option<&str>) -> bool {
    strategy == Some(STRATEGY_COMPOSE_UPDATE)
}

fn is_dockerfile_source_strategy(strategy: Option<&str>) -> bool {
    strategy == Some(STRATEGY_DOCKERFILE_UPDATE)
}

fn compose_strategy_label(strategy: Option<&str>) -> &'static str {
    if is_dockerfile_source_strategy(strategy) {
        "dockerfile"
    } else if is_dokuru_override_strategy(strategy) {
        "dokuru override"
    } else {
        "compose"
    }
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
            "Apply selected Docker or Compose update".to_string(),
            "Verify cgroup limits".to_string(),
        ];
    }
    if supports_image_config_fix(rule_id) {
        return match rule_id {
            "4.1" => vec![
                "Inspect containers running as root".to_string(),
                "Save rollback metadata".to_string(),
                "Stop or update compose service".to_string(),
                format!("Recreate container with user {DEFAULT_NON_ROOT_USER}"),
                "Start container".to_string(),
                "Verify non-root user config".to_string(),
            ],
            "4.6" => vec![
                "Inspect containers without healthcheck".to_string(),
                "Save rollback metadata".to_string(),
                "Stop or update compose service".to_string(),
                "Recreate container with default healthcheck".to_string(),
                "Start container".to_string(),
                "Verify healthcheck config".to_string(),
            ],
            _ => vec!["Apply fix".to_string(), "Verify result".to_string()],
        };
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
    if supports_docker_root_partition_fix(rule_id) {
        return vec![
            "Preflight Docker root and host storage".to_string(),
            "Select an unambiguous LVM volume group".to_string(),
            "Create a dedicated Docker logical volume".to_string(),
            "Format and mount the new volume temporarily".to_string(),
            "Copy Docker root data into the new volume".to_string(),
            "Stop Docker services for final sync".to_string(),
            "Switch DockerRootDir to the dedicated mount".to_string(),
            "Persist the mount in /etc/fstab".to_string(),
            "Restart Docker and verify the mount point".to_string(),
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

pub fn supports_docker_root_partition_fix(rule_id: &str) -> bool {
    rule_id == DOCKER_ROOT_PARTITION_RULE_ID
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LvmVolumeGroup {
    name: String,
    free_bytes: u64,
}

fn parse_lvm_bytes(value: &str) -> Option<u64> {
    let digits: String = value
        .trim()
        .trim_start_matches('<')
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    (!digits.is_empty()).then(|| digits.parse().ok()).flatten()
}

fn parse_vgs_output(output: &str) -> Vec<LvmVolumeGroup> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }

            let parts: Vec<&str> = if trimmed.contains(',') {
                trimmed.split(',').collect()
            } else {
                trimmed.split_whitespace().collect()
            };
            let name = parts.first()?.trim();
            let free = parse_lvm_bytes(parts.get(1)?.trim())?;
            Some(LvmVolumeGroup {
                name: (*name).to_string(),
                free_bytes: free,
            })
        })
        .collect()
}

fn select_lvm_volume_group(
    groups: &[LvmVolumeGroup],
    required_bytes: u64,
) -> Result<LvmVolumeGroup, String> {
    let eligible: Vec<LvmVolumeGroup> = groups
        .iter()
        .filter(|group| group.free_bytes >= required_bytes)
        .cloned()
        .collect();

    match eligible.as_slice() {
        [] => Err(format!(
            "No LVM volume group has at least {} free space",
            format_gib(required_bytes)
        )),
        [group] => Ok(group.clone()),
        many => Err(format!(
            "Multiple LVM volume groups have enough space ({}). Select the target VG manually before running this high-risk remediation.",
            many.iter()
                .map(|group| group.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

fn planned_docker_root_lv_size(used_bytes: u64) -> u64 {
    let headroom = std::cmp::max(used_bytes / 5, DOCKER_ROOT_LV_HEADROOM_BYTES);
    std::cmp::max(
        MIN_DOCKER_ROOT_LV_BYTES,
        used_bytes.saturating_add(headroom),
    )
}

const fn bytes_to_mib_ceil(bytes: u64) -> u64 {
    const MIB: u64 = 1024 * 1024;
    bytes.div_ceil(MIB)
}

fn format_gib(bytes: u64) -> String {
    const GIB: u64 = 1024 * 1024 * 1024;
    let whole = bytes / GIB;
    let tenth = (bytes % GIB) * 10 / GIB;
    format!("{whole}.{tenth} GiB")
}

fn parse_du_size(stdout: &str) -> Option<u64> {
    stdout.split_whitespace().next()?.parse().ok()
}

async fn estimate_path_size_bytes(path: &str) -> Result<u64, String> {
    let byte_result = capture_command("du", &["-sb", path]).await;
    if byte_result.success
        && let Some(bytes) = parse_du_size(&byte_result.stdout)
    {
        return Ok(bytes);
    }

    let kb_result = capture_command("du", &["-sk", path]).await;
    if kb_result.success
        && let Some(kib) = parse_du_size(&kb_result.stdout)
    {
        return Ok(kib.saturating_mul(1024));
    }

    Err(command_output(&byte_result.stderr)
        .or_else(|| command_output(&kb_result.stderr))
        .unwrap_or_else(|| format!("Could not estimate size for {path}")))
}

pub fn mount_entry_for_path(mounts: &str, path: &str) -> Option<String> {
    mounts
        .lines()
        .find(|line| line.split_whitespace().nth(1).is_some_and(|mp| mp == path))
        .map(ToString::to_string)
}

fn is_mount_point(path: &str) -> bool {
    std::fs::read_to_string("/proc/mounts")
        .ok()
        .and_then(|mounts| mount_entry_for_path(&mounts, path))
        .is_some()
}

fn fstab_field_unescape(value: &str) -> String {
    value
        .replace("\\040", " ")
        .replace("\\011", "\t")
        .replace("\\012", "\n")
        .replace("\\134", "\\")
}

fn fstab_escape(value: &str) -> String {
    value
        .replace('\\', "\\134")
        .replace(' ', "\\040")
        .replace('\t', "\\011")
        .replace('\n', "\\012")
}

fn fstab_has_mountpoint(content: &str, mount_point: &str) -> bool {
    content.lines().any(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return false;
        }
        trimmed
            .split_whitespace()
            .nth(1)
            .is_some_and(|field| fstab_field_unescape(field) == mount_point)
    })
}

fn docker_root_backup_path(docker_root: &str, timestamp: &str) -> PathBuf {
    let root = Path::new(docker_root);
    let filename = root.file_name().map_or_else(
        || "docker".to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    root.with_file_name(format!("{filename}.dokuru-backup-{timestamp}"))
}

fn append_docker_root_fstab_entry(
    docker_root: &str,
    uuid: &str,
    timestamp: &str,
) -> std::io::Result<PathBuf> {
    let path = Path::new("/etc/fstab");
    let mut content = std::fs::read_to_string(path)?;
    let backup = PathBuf::from(format!("/etc/fstab.dokuru-backup-{timestamp}"));
    std::fs::copy(path, &backup)?;

    if !content.ends_with('\n') {
        content.push('\n');
    }
    let _ = writeln!(
        content,
        "UUID={} {} ext4 defaults 0 2",
        fstab_escape(uuid),
        fstab_escape(docker_root)
    );
    std::fs::write(path, content)?;
    Ok(backup)
}

fn partition_progress_event(
    docker_root: &str,
    step: u8,
    action: &str,
    status: &str,
    detail: Option<String>,
    command: Option<String>,
) -> FixProgress {
    FixProgress {
        rule_id: DOCKER_ROOT_PARTITION_RULE_ID.to_string(),
        container_name: docker_root.to_string(),
        step,
        total_steps: DOCKER_ROOT_PARTITION_FIX_STEPS,
        action: action.to_string(),
        status: status.to_string(),
        detail,
        command,
        stdout: None,
        stderr: None,
    }
}

fn command_display(cmd: &str, args: &[&str]) -> String {
    std::iter::once(shell_quote(cmd))
        .chain(args.iter().map(|arg| shell_quote(arg)))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn run_partition_command(
    docker_root: &str,
    progress: Option<&ProgressSender>,
    step: u8,
    action: &str,
    detail: &str,
    cmd: &str,
    args: &[&str],
) -> Result<FixCommandResult, FixOutcome> {
    let display = command_display(cmd, args);
    send_progress(
        progress,
        partition_progress_event(
            docker_root,
            step,
            action,
            "in_progress",
            Some(detail.to_string()),
            Some(display.clone()),
        ),
    );

    let result = capture_command(cmd, args).await;
    let mut event = partition_progress_event(
        docker_root,
        step,
        action,
        if result.success { "done" } else { "error" },
        Some(if result.success {
            detail.to_string()
        } else {
            format!("{detail} failed")
        }),
        Some(display),
    );
    event.stdout = command_output(&result.stdout);
    event.stderr = command_output(&result.stderr);
    send_progress(progress, event);

    if result.success {
        Ok(result)
    } else {
        Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("{detail} failed: {}", result.stderr.trim()),
        ))
    }
}

async fn run_partition_shell(
    docker_root: &str,
    progress: Option<&ProgressSender>,
    step: u8,
    action: &str,
    detail: &str,
    script: &str,
) -> Result<FixCommandResult, FixOutcome> {
    run_partition_command(
        docker_root,
        progress,
        step,
        action,
        detail,
        "sh",
        &["-c", script],
    )
    .await
}

async fn restore_docker_root_after_failed_switch(
    docker_root: &str,
    backup_path: &Path,
    progress: Option<&ProgressSender>,
    reason: &str,
) -> FixOutcome {
    let _ = std::fs::remove_dir(docker_root);
    let _ = std::fs::rename(backup_path, docker_root);
    let _ = run_partition_shell(
        docker_root,
        progress,
        9,
        "restore_original_root",
        "Restoring Docker service against the original root directory",
        "systemctl start containerd || true; systemctl start docker",
    )
    .await;

    blocked(DOCKER_ROOT_PARTITION_RULE_ID, reason)
}

async fn restart_docker_after_partition_block(
    docker_root: &str,
    progress: Option<&ProgressSender>,
    reason: &str,
) -> FixOutcome {
    let _ = run_partition_shell(
        docker_root,
        progress,
        9,
        "restart_original_docker",
        "Restarting Docker against the original root after a failed migration step",
        "systemctl start containerd || true; systemctl start docker",
    )
    .await;

    blocked(DOCKER_ROOT_PARTITION_RULE_ID, reason)
}

async fn guided_after_fstab_failure(
    docker_root: &str,
    progress: Option<&ProgressSender>,
    message: String,
) -> FixOutcome {
    let _ = run_partition_shell(
        docker_root,
        progress,
        9,
        "restart_docker",
        "Starting Docker after the mount succeeded but fstab persistence failed",
        "systemctl start containerd || true; systemctl start docker",
    )
    .await;

    FixOutcome {
        rule_id: DOCKER_ROOT_PARTITION_RULE_ID.to_string(),
        status: FixStatus::Guided,
        message,
        requires_restart: false,
        restart_command: None,
        requires_elevation: true,
    }
}

struct DockerRootPartitionPlan {
    docker_root: String,
    vg: LvmVolumeGroup,
    lv_size_mib: u64,
    timestamp: String,
    lv_name: String,
    lv_path: String,
    temp_mount: String,
    backup_path: PathBuf,
}

async fn validate_docker_root_preconditions(
    docker_root: &str,
    progress: Option<&ProgressSender>,
) -> Result<(), FixOutcome> {
    let root_path = Path::new(docker_root);
    if !root_path.is_absolute() || docker_root == "/" {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("Refusing to manage unsafe DockerRootDir path: {docker_root}"),
        ));
    }
    if is_mount_point(docker_root) {
        send_progress(
            progress,
            partition_progress_event(
                docker_root,
                1,
                "preflight",
                "done",
                Some("DockerRootDir is already a mount point".to_string()),
                None,
            ),
        );
        return Err(applied(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("DockerRootDir is already mounted separately at {docker_root}"),
            false,
        ));
    }
    if !root_path.exists() {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("DockerRootDir does not exist: {docker_root}"),
        ));
    }

    let euid_command = capture_command("id", &["-u"]).await;
    if !euid_command.success || euid_command.stdout.trim() != "0" {
        send_progress(
            progress,
            partition_progress_event(
                docker_root,
                1,
                "preflight",
                "error",
                Some(
                    "Run dokuru-agent as root to create LVM storage and update /etc/fstab"
                        .to_string(),
                ),
                Some("id -u".to_string()),
            ),
        );
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            "Root privileges are required to create and mount a Docker data logical volume",
        ));
    }

    let required_commands = [
        "vgs",
        "lvcreate",
        "mkfs.ext4",
        "rsync",
        "mount",
        "umount",
        "blkid",
        "du",
        "systemctl",
    ];
    let mut missing = Vec::new();
    for command in required_commands {
        if !capture_command("which", &[command]).await.success {
            missing.push(command);
        }
    }
    if !missing.is_empty() {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("Missing required host command(s): {}", missing.join(", ")),
        ));
    }

    let fstab = std::fs::read_to_string("/etc/fstab").map_err(|error| {
        blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("Cannot read /etc/fstab before remediation: {error}"),
        )
    })?;
    if fstab_has_mountpoint(&fstab, docker_root) {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!(
                "/etc/fstab already has an entry for {docker_root}, but it is not mounted. Fix or mount the existing entry first."
            ),
        ));
    }

    Ok(())
}

async fn select_docker_root_lvm_plan(
    docker_root: &str,
    progress: Option<&ProgressSender>,
) -> Result<(LvmVolumeGroup, u64), FixOutcome> {
    let used_bytes = estimate_path_size_bytes(docker_root)
        .await
        .map_err(|error| blocked(DOCKER_ROOT_PARTITION_RULE_ID, &error))?;
    let lv_size_bytes = planned_docker_root_lv_size(used_bytes);
    send_progress(
        progress,
        partition_progress_event(
            docker_root,
            1,
            "preflight",
            "done",
            Some(format!(
                "DockerRootDir uses {}; planned LV size {}",
                format_gib(used_bytes),
                format_gib(lv_size_bytes)
            )),
            Some(format!("du -sb {}", shell_quote(docker_root))),
        ),
    );

    let vgs_result = run_partition_command(
        docker_root,
        progress,
        2,
        "select_lvm_vg",
        "Listing LVM volume groups with free space",
        "vgs",
        &[
            "--noheadings",
            "--units",
            "b",
            "--nosuffix",
            "--separator",
            ",",
            "-o",
            "vg_name,vg_free",
        ],
    )
    .await?;
    let groups = parse_vgs_output(&vgs_result.stdout);
    let vg = select_lvm_volume_group(&groups, lv_size_bytes).map_err(|message| {
        send_progress(
            progress,
            partition_progress_event(
                docker_root,
                2,
                "select_lvm_vg",
                "error",
                Some(message.clone()),
                None,
            ),
        );
        blocked(DOCKER_ROOT_PARTITION_RULE_ID, &message)
    })?;
    send_progress(
        progress,
        partition_progress_event(
            docker_root,
            2,
            "select_lvm_vg",
            "done",
            Some(format!(
                "Selected VG {} with {} free",
                vg.name,
                format_gib(vg.free_bytes)
            )),
            None,
        ),
    );

    Ok((vg, bytes_to_mib_ceil(lv_size_bytes)))
}

async fn prepare_docker_root_partition_plan(
    docker: &Docker,
    progress: Option<&ProgressSender>,
) -> Result<DockerRootPartitionPlan, FixOutcome> {
    let info = docker.info().await.map_err(|error| {
        blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!("Could not read Docker info: {error}"),
        )
    })?;
    let docker_root = info
        .docker_root_dir
        .filter(|path| !path.trim().is_empty())
        .unwrap_or_else(|| "/var/lib/docker".to_string());

    send_progress(
        progress,
        partition_progress_event(
            &docker_root,
            1,
            "preflight",
            "in_progress",
            Some("Checking DockerRootDir, privileges, commands, and existing mounts".to_string()),
            Some("docker info -f '{{ .DockerRootDir }}'".to_string()),
        ),
    );
    validate_docker_root_preconditions(&docker_root, progress).await?;
    let (vg, lv_size_mib) = select_docker_root_lvm_plan(&docker_root, progress).await?;
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();
    let lv_name = format!("dokuru_docker_data_{timestamp}");
    let lv_path = format!("/dev/{}/{}", vg.name, lv_name);
    let temp_mount = format!("/mnt/dokuru-docker-root-{timestamp}");
    let backup_path = docker_root_backup_path(&docker_root, &timestamp);

    Ok(DockerRootPartitionPlan {
        docker_root,
        vg,
        lv_size_mib,
        timestamp,
        lv_name,
        lv_path,
        temp_mount,
        backup_path,
    })
}

async fn create_and_seed_docker_root_volume(
    plan: &DockerRootPartitionPlan,
    progress: Option<&ProgressSender>,
) -> Result<(), FixOutcome> {
    let lv_size_arg = format!("{}M", plan.lv_size_mib);
    run_partition_command(
        &plan.docker_root,
        progress,
        3,
        "create_lvm_volume",
        "Creating dedicated Docker logical volume",
        "lvcreate",
        &["-y", "-L", &lv_size_arg, "-n", &plan.lv_name, &plan.vg.name],
    )
    .await?;
    run_partition_command(
        &plan.docker_root,
        progress,
        4,
        "format_volume",
        "Formatting the new logical volume as ext4",
        "mkfs.ext4",
        &["-F", &plan.lv_path],
    )
    .await?;

    std::fs::create_dir_all(&plan.temp_mount).map_err(|error| {
        blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!(
                "Failed to create temporary mount directory {}: {error}",
                plan.temp_mount
            ),
        )
    })?;
    run_partition_command(
        &plan.docker_root,
        progress,
        4,
        "mount_temporary_volume",
        "Mounting the new volume for data copy",
        "mount",
        &[&plan.lv_path, &plan.temp_mount],
    )
    .await?;

    let docker_root_slash = format!("{}/", plan.docker_root);
    let temp_mount_slash = format!("{}/", plan.temp_mount);
    if let Err(outcome) = run_partition_command(
        &plan.docker_root,
        progress,
        5,
        "copy_existing_data",
        "Copying current Docker data to the new volume",
        "rsync",
        &[
            "-aHAX",
            "--numeric-ids",
            &docker_root_slash,
            &temp_mount_slash,
        ],
    )
    .await
    {
        let _ = run_partition_command(
            &plan.docker_root,
            progress,
            5,
            "cleanup_temporary_mount",
            "Unmounting temporary volume after initial copy failed",
            "umount",
            &[&plan.temp_mount],
        )
        .await;
        return Err(outcome);
    }
    Ok(())
}

async fn switch_docker_root_mount(
    plan: &DockerRootPartitionPlan,
    progress: Option<&ProgressSender>,
) -> Result<(), FixOutcome> {
    if let Err(error) = std::fs::rename(&plan.docker_root, &plan.backup_path) {
        return Err(restart_docker_after_partition_block(
            &plan.docker_root,
            progress,
            &format!("Failed to move original DockerRootDir to backup: {error}"),
        )
        .await);
    }
    if let Err(error) = std::fs::create_dir_all(&plan.docker_root) {
        return Err(restore_docker_root_after_failed_switch(
            &plan.docker_root,
            &plan.backup_path,
            progress,
            &format!("Failed to recreate DockerRootDir mountpoint: {error}"),
        )
        .await);
    }

    if let Err(outcome) = run_partition_command(
        &plan.docker_root,
        progress,
        7,
        "unmount_temporary_volume",
        "Unmounting temporary Docker data volume",
        "umount",
        &[&plan.temp_mount],
    )
    .await
    {
        return Err(restore_docker_root_after_failed_switch(
            &plan.docker_root,
            &plan.backup_path,
            progress,
            &outcome.message,
        )
        .await);
    }

    if let Err(outcome) = run_partition_command(
        &plan.docker_root,
        progress,
        7,
        "mount_docker_root",
        "Mounting dedicated volume at DockerRootDir",
        "mount",
        &[&plan.lv_path, &plan.docker_root],
    )
    .await
    {
        return Err(restore_docker_root_after_failed_switch(
            &plan.docker_root,
            &plan.backup_path,
            progress,
            &outcome.message,
        )
        .await);
    }
    Ok(())
}

async fn stop_sync_and_switch_docker_root(
    plan: &DockerRootPartitionPlan,
    progress: Option<&ProgressSender>,
) -> Result<(), FixOutcome> {
    let docker_root_slash = format!("{}/", plan.docker_root);
    let temp_mount_slash = format!("{}/", plan.temp_mount);
    run_partition_shell(
        &plan.docker_root,
        progress,
        6,
        "stop_docker",
        "Stopping Docker and containerd for the final consistent sync",
        "systemctl stop docker || true; systemctl stop docker.socket || true; systemctl stop containerd || true; ! systemctl is-active --quiet docker",
    )
    .await?;
    if let Err(outcome) = run_partition_command(
        &plan.docker_root,
        progress,
        7,
        "final_sync",
        "Final sync after Docker is stopped",
        "rsync",
        &[
            "-aHAX",
            "--numeric-ids",
            "--delete",
            &docker_root_slash,
            &temp_mount_slash,
        ],
    )
    .await
    {
        let _ = run_partition_command(
            &plan.docker_root,
            progress,
            7,
            "cleanup_temporary_mount",
            "Unmounting temporary volume after final sync failed",
            "umount",
            &[&plan.temp_mount],
        )
        .await;
        return Err(restart_docker_after_partition_block(
            &plan.docker_root,
            progress,
            &outcome.message,
        )
        .await);
    }

    switch_docker_root_mount(plan, progress).await
}

async fn persist_restart_and_verify_docker_root(
    plan: &DockerRootPartitionPlan,
    progress: Option<&ProgressSender>,
) -> Result<FixOutcome, FixOutcome> {
    let filesystem_uuid = run_partition_command(
        &plan.docker_root,
        progress,
        8,
        "read_volume_uuid",
        "Reading filesystem UUID for persistent mount",
        "blkid",
        &["-s", "UUID", "-o", "value", &plan.lv_path],
    )
    .await?;
    let uuid = filesystem_uuid.stdout.trim();
    if uuid.is_empty() {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            "Mounted the Docker root volume, but blkid did not return a filesystem UUID",
        ));
    }

    let fstab_backup = match append_docker_root_fstab_entry(
        &plan.docker_root,
        uuid,
        &plan.timestamp,
    ) {
        Ok(path) => path,
        Err(error) => {
            return Err(
                guided_after_fstab_failure(
                    &plan.docker_root,
                    progress,
                    format!(
                        "DockerRootDir is mounted separately, but /etc/fstab persistence failed: {error}"
                    ),
                )
                .await,
            );
        }
    };
    let docker_root = &plan.docker_root;
    send_progress(
        progress,
        partition_progress_event(
            docker_root,
            8,
            "persist_fstab",
            "done",
            Some(format!(
                "Added persistent mount entry; backup saved at {}",
                fstab_backup.display()
            )),
            Some(format!("append UUID={uuid} {docker_root} to /etc/fstab")),
        ),
    );

    run_partition_shell(
        &plan.docker_root,
        progress,
        9,
        "restart_docker",
        "Starting containerd and Docker after storage migration",
        "systemctl start containerd || true; systemctl start docker; systemctl is-active --quiet docker",
    )
    .await?;

    let mounts = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
    let Some(mount_entry) = mount_entry_for_path(&mounts, &plan.docker_root) else {
        return Err(blocked(
            DOCKER_ROOT_PARTITION_RULE_ID,
            &format!(
                "Docker restarted, but {} is still not listed as a mount point",
                plan.docker_root
            ),
        ));
    };
    send_progress(
        progress,
        partition_progress_event(
            &plan.docker_root,
            9,
            "verify_mount",
            "done",
            Some(mount_entry),
            Some(format!(
                "grep {} /proc/mounts",
                shell_quote(&plan.docker_root)
            )),
        ),
    );

    Ok(applied(
        DOCKER_ROOT_PARTITION_RULE_ID,
        &format!(
            "DockerRootDir migrated to dedicated LVM volume {}; original data retained at {}",
            plan.lv_path,
            plan.backup_path.display()
        ),
        false,
    ))
}

pub async fn apply_docker_root_partition_fix_with_progress(
    docker: &Docker,
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    let plan = match prepare_docker_root_partition_plan(docker, progress).await {
        Ok(plan) => plan,
        Err(outcome) => return Ok(outcome),
    };
    if let Err(outcome) = create_and_seed_docker_root_volume(&plan, progress).await {
        return Ok(outcome);
    }
    if let Err(outcome) = stop_sync_and_switch_docker_root(&plan, progress).await {
        return Ok(outcome);
    }
    match persist_restart_and_verify_docker_root(&plan, progress).await {
        Ok(outcome) | Err(outcome) => Ok(outcome),
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

    if let Some(error) = ensure_setfacl_available().await {
        result.failed.push(format!(
            "setfacl is required to preserve host ownership while granting remapped UID access: {error}"
        ));
        send_progress(
            progress,
            userns_progress_event(
                8,
                "fix_bind_mount_permissions",
                "error",
                Some(result.failed.join("; ")),
                Some("install acl package or run setfacl manually".to_string()),
            ),
        );
        return result;
    }

    for path in bind_paths {
        if !is_safe_userns_bind_path(path) {
            result.skipped += 1;
            continue;
        }

        let Ok(metadata) = tokio::fs::metadata(path).await else {
            result.skipped += 1;
            continue;
        };

        match recover_bind_mount_access(path, &metadata, uid, gid).await {
            Ok((_, _, true)) => result.completed += 1,
            Ok((_, stderr, _)) => result
                .failed
                .push(format!("{path}: recovery failed: {stderr}")),
            Err(error) => result
                .failed
                .push(format!("{path}: recovery failed: {error}")),
        }
    }

    let status = if result.failed.is_empty() {
        "done"
    } else {
        "error"
    };
    let detail = if result.failed.is_empty() {
        format!(
            "Granted remapped UID access on {} bind mount path(s), skipped {} unsafe/missing path(s)",
            result.completed, result.skipped
        )
    } else {
        format!(
            "Granted remapped UID access on {} path(s), skipped {}, failed {}: {}",
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

async fn recover_bind_mount_access(
    path: &str,
    metadata: &std::fs::Metadata,
    uid: u32,
    gid: u32,
) -> std::io::Result<(String, String, bool)> {
    if should_chown_runtime_bind_path(path) {
        return chown_runtime_bind_path_preserving_host_access(path, metadata, uid, gid).await;
    }

    grant_acl_user_access(path, metadata, uid).await
}

async fn grant_acl_user_access(
    path: &str,
    metadata: &std::fs::Metadata,
    uid: u32,
) -> std::io::Result<(String, String, bool)> {
    let user_acl = format!("u:{uid}:rwX");
    if metadata.is_dir() {
        let default_acl = format!("d:u:{uid}:rwX");
        return run_cmd(
            "setfacl",
            &["-R", "-m", &user_acl, "-m", &default_acl, path],
        )
        .await;
    }

    run_cmd("setfacl", &["-m", &user_acl, path]).await
}

async fn chown_runtime_bind_path_preserving_host_access(
    path: &str,
    metadata: &std::fs::Metadata,
    uid: u32,
    gid: u32,
) -> std::io::Result<(String, String, bool)> {
    let host_uid = metadata.uid();
    let owner = format!("{uid}:{gid}");
    let chown_result = if metadata.is_dir() {
        run_cmd("chown", &["-R", &owner, path]).await?
    } else {
        run_cmd("chown", &[&owner, path]).await?
    };

    if !chown_result.2 {
        return Ok(chown_result);
    }

    // Keep the original host owner able to edit/delete tracked files so Git operations still work.
    match grant_acl_user_access(path, metadata, host_uid).await {
        Ok((_, _, true)) => Ok(chown_result),
        Ok((stdout, stderr, false)) => Ok((
            stdout,
            format!("runtime chown succeeded, but preserving host owner ACL failed: {stderr}"),
            false,
        )),
        Err(error) => Ok((
            chown_result.0,
            format!("runtime chown succeeded, but preserving host owner ACL failed: {error}"),
            false,
        )),
    }
}

fn should_chown_runtime_bind_path(path: &str) -> bool {
    Path::new(path).components().any(|component| {
        let name = component.as_os_str().to_string_lossy().to_lowercase();
        RUNTIME_BIND_COMPONENTS.contains(&name.as_str())
            || name.ends_with("_data")
            || name.ends_with("-data")
    })
}

async fn ensure_setfacl_available() -> Option<String> {
    if command_available("setfacl").await {
        return None;
    }

    let installers: [(&str, &[&str]); 4] = [
        ("apt-get", &["install", "-y", "acl"]),
        ("dnf", &["install", "-y", "acl"]),
        ("yum", &["install", "-y", "acl"]),
        ("apk", &["add", "acl"]),
    ];
    let mut errors = Vec::new();

    for (cmd, args) in installers {
        match run_cmd(cmd, args).await {
            Ok((_, _, true)) if command_available("setfacl").await => return None,
            Ok((_, stderr, _)) => errors.push(format!("{cmd}: {}", stderr.trim())),
            Err(error) => errors.push(format!("{cmd}: {error}")),
        }
    }

    Some(errors.join("; "))
}

async fn command_available(command: &str) -> bool {
    run_cmd("which", &[command])
        .await
        .is_ok_and(|(_, _, success)| success)
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
            let socket_detail = normalize_docker_socket_permissions().await;
            send_progress(
                progress,
                userns_progress_event(
                    6,
                    "restart_docker",
                    "done",
                    Some(socket_detail.map_or_else(
                        || "Docker daemon restarted with userns-remap enabled; docker socket permissions are root:docker 660".to_string(),
                        |detail| format!(
                            "Docker daemon restarted with userns-remap enabled; docker socket permission normalization skipped/failed: {detail}"
                        ),
                    )),
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

async fn normalize_docker_socket_permissions() -> Option<String> {
    const DOCKER_SOCKET: &str = "/var/run/docker.sock";

    if !Path::new(DOCKER_SOCKET).exists() {
        return Some("/var/run/docker.sock does not exist".to_string());
    }

    match run_cmd("getent", &["group", "docker"]).await {
        Ok((_, _, true)) => {}
        Ok((_, stderr, _)) => {
            return Some(format!("docker group not found: {stderr}"));
        }
        Err(error) => {
            return Some(format!("failed to check docker group: {error}"));
        }
    }

    let mut failures = Vec::new();
    match run_cmd("chgrp", &["docker", DOCKER_SOCKET]).await {
        Ok((_, _, true)) => {}
        Ok((_, stderr, _)) => failures.push(format!("chgrp failed: {stderr}")),
        Err(error) => failures.push(format!("chgrp failed: {error}")),
    }

    match run_cmd("chmod", &["660", DOCKER_SOCKET]).await {
        Ok((_, _, true)) => {}
        Ok((_, stderr, _)) => failures.push(format!("chmod failed: {stderr}")),
        Err(error) => failures.push(format!("chmod failed: {error}")),
    }

    (!failures.is_empty()).then(|| failures.join("; "))
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
                "Recovering {} bind mount path(s): ACL for normal paths, runtime data dirs chowned to remap UID with host-owner ACL preserved",
                state.bind_paths.len()
            )),
            Some(format!(
                "setfacl -R -m u:{uid}:rwX -m d:u:{uid}:rwX <bind-paths>; chown -R {uid}:{gid} <runtime-data-bind-paths>"
            )),
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

        let mut target = preview_target_from_inspect(id, &inspect, rule_id);
        if supports_image_config_fix(rule_id)
            && let Some(ctx) = compose_context_from_inspect(&inspect)
            && let Some(source) = detect_dockerfile_source(&ctx).await
        {
            target.dockerfile_path = Some(source.path.to_string_lossy().to_string());
            target.dockerfile_context = Some(source.context.to_string_lossy().to_string());
        }
        targets.push(target);
    }

    Ok(FixPreview {
        rule_id: rule_id.to_string(),
        targets,
        requires_restart: supports_namespace_fix(rule_id)
            || supports_privileged_fix(rule_id)
            || supports_image_config_fix(rule_id)
            || supports_userns_remap_fix(rule_id)
            || supports_docker_root_partition_fix(rule_id),
        requires_elevation: supports_audit_rule_fix(rule_id)
            || supports_userns_remap_fix(rule_id)
            || supports_docker_root_partition_fix(rule_id),
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
    let suggestion =
        supports_cgroup_resource_fix(rule_id).then(|| suggest_resource_limits(&name, &image));
    let host_config = inspect.host_config.as_ref();
    let compose = compose_context_from_inspect(inspect);
    let strategy = if supports_cgroup_resource_fix(rule_id) && compose.is_some() {
        STRATEGY_DOKURU_OVERRIDE
    } else if supports_cgroup_resource_fix(rule_id) {
        STRATEGY_DOCKER_UPDATE
    } else if compose.is_some() {
        STRATEGY_DOKURU_OVERRIDE
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
        compose_service: compose.as_ref().map(|ctx| ctx.service.clone()),
        dockerfile_path: None,
        dockerfile_context: None,
    }
}

#[derive(Clone, Copy)]
struct ProgressStep {
    step: u8,
    total_steps: u8,
}

impl ProgressStep {
    const fn new(step: u8, total_steps: u8) -> Self {
        Self { step, total_steps }
    }
}

fn emit_progress(
    progress: Option<&ProgressSender>,
    rule_id: &str,
    container_name: &str,
    step: ProgressStep,
    action: &str,
    status: &str,
    detail: Option<String>,
) {
    send_progress(
        progress,
        FixProgress {
            rule_id: rule_id.to_string(),
            container_name: container_name.to_string(),
            step: step.step,
            total_steps: step.total_steps,
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
    let effective_rule_id = cgroup_effective_rule_id(rule_id);
    let id = container.id.as_deref()?;
    let inspect = docker.inspect_container(id, None).await.ok()?;
    let host_config = inspect.host_config.as_ref()?;

    let memory = host_config.memory.unwrap_or(0);
    let cpu_shares = host_config.cpu_shares.unwrap_or(0);
    let pids_limit = host_config.pids_limit.unwrap_or(0);

    let needs_update = match effective_rule_id {
        "5.11" => memory == 0,
        "5.12" => cpu_shares == 0,
        "5.29" => pids_limit <= 0,
        "cgroup_all" => memory == 0 || cpu_shares == 0 || pids_limit <= 0,
        _ => false,
    };

    if !needs_update {
        return None;
    }
    let strategy = if compose_context_from_inspect(&inspect).is_some() {
        STRATEGY_DOKURU_OVERRIDE
    } else {
        STRATEGY_DOCKER_UPDATE
    };

    Some(FixTarget {
        container_id: id.to_string(),
        memory: (matches!(effective_rule_id, "5.11" | "cgroup_all") && memory == 0)
            .then_some(DEFAULT_MEMORY_BYTES),
        cpu_shares: (matches!(effective_rule_id, "5.12" | "cgroup_all") && cpu_shares == 0)
            .then_some(DEFAULT_CPU_SHARES),
        pids_limit: (matches!(effective_rule_id, "5.29" | "cgroup_all") && pids_limit <= 0)
            .then_some(DEFAULT_PIDS_LIMIT),
        strategy: Some(strategy.to_string()),
    })
}

fn fix_outcome(
    rule_id: &str,
    updated: &[String],
    failed: &[String],
    empty_message: &str,
    mut message: String,
) -> FixOutcome {
    if updated.is_empty() && failed.is_empty() {
        return FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Applied,
            message: empty_message.to_string(),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        };
    }

    if !updated.is_empty() {
        let _ = write!(message, ": {}", updated.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    FixOutcome {
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
    }
}

fn image_config_fix_outcome(
    rule_id: &str,
    updated: &[String],
    failed: &[String],
    dockerfile_updates: usize,
) -> FixOutcome {
    if dockerfile_updates == 0 {
        return fix_outcome(
            rule_id,
            updated,
            failed,
            image_config_noop_message(rule_id),
            image_config_success_message(rule_id, updated.len()),
        );
    }

    let mut message = format!(
        "Updated Dockerfile source for {dockerfile_updates} target(s); rebuild and redeploy the image to complete rule {rule_id}"
    );
    if !updated.is_empty() {
        let _ = write!(message, ": {}", updated.join(", "));
    }
    if !failed.is_empty() {
        let _ = write!(message, ". Failed {}: {}", failed.len(), failed.join("; "));
    }

    FixOutcome {
        rule_id: rule_id.to_string(),
        status: if updated.is_empty() && !failed.is_empty() {
            FixStatus::Blocked
        } else {
            FixStatus::Guided
        },
        message,
        requires_restart: false,
        restart_command: None,
        requires_elevation: false,
    }
}

pub async fn apply_image_config_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixOutcome> {
    Box::pin(apply_image_config_fix_with_progress(
        docker,
        rule_id,
        &[],
        None,
    ))
    .await
}

pub async fn apply_image_config_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    if !supports_image_config_fix(rule_id) {
        return Ok(blocked(
            rule_id,
            "Image config fix only supports rules 4.1 and 4.6",
        ));
    }

    let targets = if targets.is_empty() {
        default_image_config_targets(docker, rule_id).await?
    } else {
        targets.to_vec()
    };

    if targets.is_empty() {
        return Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Applied,
            message: image_config_noop_message(rule_id).to_string(),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        });
    }

    let mut updated = Vec::new();
    let mut failed = Vec::new();
    let mut dockerfile_updates = 0usize;
    let mut compose_services = HashSet::<String>::new();

    for target in &targets {
        let dockerfile_strategy = is_dockerfile_source_strategy(target.strategy.as_deref());
        match Box::pin(apply_image_config_target(
            docker,
            rule_id,
            target,
            progress,
            &mut compose_services,
        ))
        .await
        {
            Ok(Some(label)) => {
                if dockerfile_strategy {
                    dockerfile_updates += 1;
                }
                updated.push(label);
            }
            Ok(None) => {}
            Err(error) => failed.push(error),
        }
    }

    Ok(image_config_fix_outcome(
        rule_id,
        &updated,
        &failed,
        dockerfile_updates,
    ))
}

async fn default_image_config_targets(
    docker: &Docker,
    rule_id: &str,
) -> eyre::Result<Vec<FixTarget>> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut targets = Vec::new();

    for container in &containers {
        let Some(id) = container.id.as_deref() else {
            continue;
        };
        let inspect = docker.inspect_container(id, None).await?;
        if !container_violates_rule(&inspect, rule_id) {
            continue;
        }
        let strategy = if compose_context_from_inspect(&inspect).is_some() {
            STRATEGY_DOKURU_OVERRIDE
        } else {
            "recreate"
        };
        targets.push(FixTarget {
            container_id: id.to_string(),
            memory: None,
            cpu_shares: None,
            pids_limit: None,
            strategy: Some(strategy.to_string()),
        });
    }

    Ok(targets)
}

async fn apply_image_config_target(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    progress: Option<&ProgressSender>,
    compose_services: &mut HashSet<String>,
) -> Result<Option<String>, String> {
    let container_label = container_label(docker, &target.container_id).await;
    let inspect = match docker.inspect_container(&target.container_id, None).await {
        Ok(inspect) => inspect,
        Err(error) => return Err(format!("{container_label}: inspect failed: {error}")),
    };

    if !container_violates_rule(&inspect, rule_id) {
        return Ok(None);
    }

    emit_progress(
        progress,
        rule_id,
        &container_label,
        ProgressStep::new(1, 6),
        "inspect_container",
        "done",
        Some(image_config_violation_detail(rule_id).to_string()),
    );

    if is_dockerfile_source_strategy(target.strategy.as_deref()) {
        let Some(ctx) = compose_context_from_inspect(&inspect) else {
            return Err(format!(
                "{container_label}: Dockerfile strategy requested but container has no Compose metadata"
            ));
        };
        let dedupe_key = format!("dockerfile:{}", ctx.key());
        if !compose_services.insert(dedupe_key) {
            return Ok(None);
        }
        return apply_dockerfile_source_fix(rule_id, &ctx, progress)
            .await
            .map(|source| {
                Some(format!(
                    "{}:{} (dockerfile {})",
                    ctx.project,
                    ctx.service,
                    source.path.display()
                ))
            })
            .map_err(|error| format!("{container_label}: Dockerfile fix failed: {error}"));
    }

    if rule_id == "4.1" {
        prepare_non_root_mount_permissions(rule_id, &container_label, &inspect, progress)
            .await
            .map_err(|error| {
                format!("{container_label}: mount ownership migration failed: {error}")
            })?;
    }

    if is_dokuru_override_strategy(target.strategy.as_deref())
        || is_compose_source_strategy(target.strategy.as_deref())
    {
        let Some(ctx) = compose_context_from_inspect(&inspect) else {
            return Err(format!(
                "{container_label}: compose strategy requested but container has no Compose metadata"
            ));
        };
        if !compose_services.insert(ctx.key()) {
            return Ok(None);
        }
        let result = if is_dokuru_override_strategy(target.strategy.as_deref()) {
            apply_compose_service_override_fix(docker, rule_id, &ctx, None, progress).await
        } else {
            apply_compose_service_fix(docker, rule_id, &ctx, progress).await
        };

        return result
            .map(|()| {
                Some(format!(
                    "{}:{} ({})",
                    ctx.project,
                    ctx.service,
                    compose_strategy_label(target.strategy.as_deref())
                ))
            })
            .map_err(|error| format!("{container_label}: compose fix failed: {error}"));
    }

    Box::pin(recreate_with_image_config(
        docker,
        &target.container_id,
        inspect,
        rule_id,
        progress,
        &container_label,
    ))
    .await
    .map(|()| Some(container_label))
    .map_err(|error| format!("{}: {error}", target.container_id))
}

struct DockerfileUpdateResult {
    path: PathBuf,
}

async fn apply_dockerfile_source_fix(
    rule_id: &str,
    ctx: &ComposeContext,
    progress: Option<&ProgressSender>,
) -> eyre::Result<DockerfileUpdateResult> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(2, 6),
        "resolve_dockerfile",
        "in_progress",
        Some("Resolving Dockerfile from Compose build config".to_string()),
    );
    let source = resolve_dockerfile_source(ctx).await?.ok_or_else(|| {
        eyre::eyre!(
            "could not detect a Dockerfile for compose service {}:{}",
            ctx.project,
            ctx.service
        )
    })?;
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(2, 6),
        "resolve_dockerfile",
        "done",
        Some(format!(
            "Using {} from {}",
            source.path.display(),
            source.compose_path.display()
        )),
    );

    let content = tokio::fs::read_to_string(&source.path).await?;
    let Some(updated_content) = update_dockerfile_content(&content, rule_id)? else {
        emit_progress(
            progress,
            rule_id,
            &label,
            ProgressStep::new(3, 6),
            "update_dockerfile",
            "done",
            Some("Dockerfile already contains the requested source setting".to_string()),
        );
        emit_dockerfile_rebuild_required(rule_id, &label, &source, progress);
        return Ok(DockerfileUpdateResult { path: source.path });
    };

    let backup_path = compose_artifact_path(&source.path, "dockerfile");
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(3, 6),
        "backup_dockerfile",
        "in_progress",
        Some(format!("Creating backup {}", backup_path.display())),
    );
    copy_compose_backup(&source.path, &backup_path).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(3, 6),
        "backup_dockerfile",
        "done",
        Some(format!("Backed up Dockerfile to {}", backup_path.display())),
    );

    tokio::fs::write(&source.path, updated_content).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(4, 6),
        "update_dockerfile",
        "done",
        Some(format!("Updated {}", source.path.display())),
    );
    emit_dockerfile_rebuild_required(rule_id, &label, &source, progress);

    Ok(DockerfileUpdateResult { path: source.path })
}

fn emit_dockerfile_rebuild_required(
    rule_id: &str,
    label: &str,
    source: &DockerfileSource,
    progress: Option<&ProgressSender>,
) {
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(5, 6),
        "manual_rebuild_required",
        "done",
        Some(format!(
            "Rebuild image from {} and redeploy the service",
            source.context.display()
        )),
    );
}

fn update_dockerfile_content(content: &str, rule_id: &str) -> eyre::Result<Option<String>> {
    match rule_id {
        "4.1" => Ok(update_dockerfile_user(content)),
        "4.6" => Ok(update_dockerfile_healthcheck(content)),
        _ => Err(eyre::eyre!("unsupported Dockerfile source rule {rule_id}")),
    }
}

fn update_dockerfile_user(content: &str) -> Option<String> {
    let mut lines = split_yaml_lines(content);
    let user_line = lines.iter().enumerate().rev().find_map(|(index, line)| {
        dockerfile_instruction(line)
            .filter(|(instruction, _)| instruction.eq_ignore_ascii_case("USER"))
            .map(|(_, rest)| (index, rest.to_string()))
    });

    if let Some((index, current_user)) = user_line {
        if current_user == DEFAULT_NON_ROOT_USER {
            return None;
        }
        lines[index] = format!("USER {DEFAULT_NON_ROOT_USER}");
        return Some(render_yaml_lines(&lines, content.ends_with('\n')));
    }

    Some(append_dockerfile_instruction(
        content,
        &format!("USER {DEFAULT_NON_ROOT_USER}"),
    ))
}

fn update_dockerfile_healthcheck(content: &str) -> Option<String> {
    let mut lines = split_yaml_lines(content);
    let healthcheck_line = lines.iter().enumerate().find_map(|(index, line)| {
        dockerfile_instruction(line)
            .filter(|(instruction, _)| instruction.eq_ignore_ascii_case("HEALTHCHECK"))
            .map(|(_, rest)| (index, rest.to_string()))
    });
    let healthcheck = format!(
        "HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD {DEFAULT_HEALTHCHECK_TEST}"
    );

    if let Some((index, current_healthcheck)) = healthcheck_line {
        if current_healthcheck.eq_ignore_ascii_case("none") {
            lines[index] = healthcheck;
            return Some(render_yaml_lines(&lines, content.ends_with('\n')));
        }
        return None;
    }

    Some(append_dockerfile_instruction(content, &healthcheck))
}

fn dockerfile_instruction(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let instruction = parts.next()?;
    let rest = parts.next().unwrap_or_default().trim();
    Some((instruction, rest))
}

fn append_dockerfile_instruction(content: &str, instruction: &str) -> String {
    let mut updated = content.to_string();
    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    updated.push_str(instruction);
    updated.push('\n');
    updated
}

#[derive(Clone, Copy)]
enum NonRootMountKind {
    Bind,
    Volume,
}

struct NonRootMountAction {
    path: String,
    kind: NonRootMountKind,
}

async fn prepare_non_root_mount_permissions(
    rule_id: &str,
    label: &str,
    inspect: &ContainerInspectResponse,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let (uid, gid) = parse_uid_gid(DEFAULT_NON_ROOT_USER)
        .ok_or_else(|| eyre::eyre!("invalid non-root user {DEFAULT_NON_ROOT_USER}"))?;
    let actions = non_root_mount_actions(inspect);

    emit_non_root_mount_progress(
        rule_id,
        label,
        progress,
        "in_progress",
        format!("Preparing writable mounts for UID/GID {DEFAULT_NON_ROOT_USER}"),
    );

    if actions.is_empty() {
        emit_non_root_mount_progress(
            rule_id,
            label,
            progress,
            "done",
            "No writable Docker volume or safe bind mount to migrate".to_string(),
        );
        return Ok(());
    }

    ensure_non_root_mount_tools(rule_id, label, progress, &actions).await?;
    let result = migrate_non_root_mount_actions(&actions, uid, gid).await;
    finish_non_root_mount_migration(rule_id, label, progress, &result)
}

fn emit_non_root_mount_progress(
    rule_id: &str,
    label: &str,
    progress: Option<&ProgressSender>,
    status: &str,
    detail: String,
) {
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(2, 6),
        "migrate_non_root_mounts",
        status,
        Some(detail),
    );
}

async fn ensure_non_root_mount_tools(
    rule_id: &str,
    label: &str,
    progress: Option<&ProgressSender>,
    actions: &[NonRootMountAction],
) -> eyre::Result<()> {
    if actions
        .iter()
        .any(|action| matches!(action.kind, NonRootMountKind::Bind))
        && let Some(error) = ensure_setfacl_available().await
    {
        emit_non_root_mount_progress(
            rule_id,
            label,
            progress,
            "error",
            format!("setfacl is required for safe bind mount migration: {error}"),
        );
        return Err(eyre::eyre!(
            "setfacl is required for safe bind mount migration: {error}"
        ));
    }

    Ok(())
}

async fn migrate_non_root_mount_actions(
    actions: &[NonRootMountAction],
    uid: u32,
    gid: u32,
) -> UsernsRecoveryResult {
    let owner = format!("{uid}:{gid}");
    let mut summary = UsernsRecoveryResult::default();

    for action in actions {
        let Ok(metadata) = tokio::fs::metadata(&action.path).await else {
            summary.skipped += 1;
            continue;
        };

        let action_result = match action.kind {
            NonRootMountKind::Volume => chown_path(&action.path, &metadata, &owner).await,
            NonRootMountKind::Bind => {
                recover_bind_mount_access(&action.path, &metadata, uid, gid).await
            }
        };

        match action_result {
            Ok((_, _, true)) => summary.completed += 1,
            Ok((_, stderr, false)) => {
                summary
                    .failed
                    .push(format!("{}: {}", action.path, stderr.trim()));
            }
            Err(error) => summary.failed.push(format!("{}: {error}", action.path)),
        }
    }

    summary
}

fn finish_non_root_mount_migration(
    rule_id: &str,
    label: &str,
    progress: Option<&ProgressSender>,
    summary: &UsernsRecoveryResult,
) -> eyre::Result<()> {
    if !summary.failed.is_empty() {
        let detail = format!(
            "Migrated {} mount(s), skipped {}, failed {}: {}",
            summary.completed,
            summary.skipped,
            summary.failed.len(),
            summary
                .failed
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        );
        emit_non_root_mount_progress(rule_id, label, progress, "error", detail.clone());
        return Err(eyre::eyre!(detail));
    }

    emit_non_root_mount_progress(
        rule_id,
        label,
        progress,
        "done",
        format!(
            "Prepared {} mount(s) for UID/GID {DEFAULT_NON_ROOT_USER}; skipped {} unsafe/missing path(s)",
            summary.completed, summary.skipped
        ),
    );
    Ok(())
}

fn parse_uid_gid(value: &str) -> Option<(u32, u32)> {
    let (uid, gid) = value.split_once(':')?;
    Some((uid.parse().ok()?, gid.parse().ok()?))
}

fn non_root_mount_actions(inspect: &ContainerInspectResponse) -> Vec<NonRootMountAction> {
    let mut actions = Vec::new();
    let Some(mounts) = &inspect.mounts else {
        return actions;
    };

    for mount in mounts {
        if mount.rw == Some(false) {
            continue;
        }
        let Some(source) = mount.source.as_deref().filter(|source| !source.is_empty()) else {
            continue;
        };
        if !Path::new(source).is_absolute() {
            continue;
        }

        match mount.typ {
            Some(MountPointTypeEnum::VOLUME) => actions.push(NonRootMountAction {
                path: source.to_string(),
                kind: NonRootMountKind::Volume,
            }),
            Some(MountPointTypeEnum::BIND) if is_safe_userns_bind_path(source) => {
                actions.push(NonRootMountAction {
                    path: source.to_string(),
                    kind: NonRootMountKind::Bind,
                });
            }
            _ => {}
        }
    }

    actions
}

async fn chown_path(
    path: &str,
    metadata: &std::fs::Metadata,
    owner: &str,
) -> std::io::Result<(String, String, bool)> {
    if metadata.is_dir() {
        run_cmd("chown", &["-R", owner, path]).await
    } else {
        run_cmd("chown", &[owner, path]).await
    }
}

async fn recreate_with_image_config(
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
    let host_config = inspect.host_config.unwrap_or_default();
    let mut create_config: Config<String> = container_config.into();

    match rule_id {
        "4.1" => create_config.user = Some(DEFAULT_NON_ROOT_USER.to_string()),
        "4.6" => create_config.healthcheck = Some(default_healthcheck_config()),
        _ => return Err(eyre::eyre!("unsupported image config rule {rule_id}")),
    }
    create_config.host_config = Some(host_config);

    recreate_container(
        docker,
        rule_id,
        progress,
        RecreateContainerRequest {
            id: id.to_string(),
            name,
            label: label.to_string(),
            create_config,
            save_detail: "Saved container config before image config recreate".to_string(),
            recreate_detail: Some(image_config_recreate_detail(rule_id).to_string()),
            done_detail: image_config_done_detail(rule_id).to_string(),
        },
    )
    .await
}

fn default_healthcheck_config() -> HealthConfig {
    HealthConfig {
        test: Some(vec![
            "CMD-SHELL".to_string(),
            DEFAULT_HEALTHCHECK_TEST.to_string(),
        ]),
        interval: Some(DEFAULT_HEALTHCHECK_INTERVAL_NANOS),
        timeout: Some(DEFAULT_HEALTHCHECK_TIMEOUT_NANOS),
        retries: Some(3),
        start_period: Some(DEFAULT_HEALTHCHECK_START_PERIOD_NANOS),
        ..Default::default()
    }
}

fn image_config_violation_detail(rule_id: &str) -> &'static str {
    match rule_id {
        "4.1" => "Container is running as root or without explicit user",
        "4.6" => "Container has no healthcheck configured",
        _ => "Container needs image config remediation",
    }
}

fn image_config_recreate_detail(rule_id: &str) -> &'static str {
    match rule_id {
        "4.1" => "Set container user to 1000:1000",
        "4.6" => "Add default container healthcheck",
        _ => "Apply image config remediation",
    }
}

fn image_config_done_detail(rule_id: &str) -> &'static str {
    match rule_id {
        "4.1" => "Container restarted with non-root user config",
        "4.6" => "Container restarted with healthcheck config",
        _ => "Container restarted with updated image config",
    }
}

fn image_config_noop_message(rule_id: &str) -> &'static str {
    match rule_id {
        "4.1" => "No containers were running as root",
        "4.6" => "No containers were missing healthchecks",
        _ => "No containers needed image config updates",
    }
}

fn image_config_success_message(rule_id: &str, updated: usize) -> String {
    match rule_id {
        "4.1" => format!("Updated non-root user config for {updated} container(s)"),
        "4.6" => format!("Added healthcheck config for {updated} container(s)"),
        _ => format!("Updated image config for {updated} container(s)"),
    }
}

pub async fn apply_cgroup_resource_fix_with_progress(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
    progress: Option<&ProgressSender>,
) -> eyre::Result<FixOutcome> {
    if !supports_cgroup_resource_fix(rule_id) {
        return Ok(blocked(
            rule_id,
            "Parameterized fix currently supports only cgroup rules 5.11, 5.12, 5.25, 5.29, or cgroup_all",
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

    let (updated, failed) = apply_cgroup_targets(docker, rule_id, targets, progress).await;

    Ok(fix_outcome(
        rule_id,
        &updated,
        &failed,
        "No containers needed cgroup resource updates",
        format!("Updated cgroup limits for {} container(s)", updated.len()),
    ))
}

async fn apply_cgroup_targets(
    docker: &Docker,
    rule_id: &str,
    targets: &[FixTarget],
    progress: Option<&ProgressSender>,
) -> (Vec<String>, Vec<String>) {
    let mut updated = Vec::new();
    let mut failed = Vec::new();
    let mut compose_services = HashSet::<String>::new();

    for target in targets {
        match apply_cgroup_target(docker, rule_id, target, progress, &mut compose_services).await {
            Ok(Some(label)) => updated.push(label),
            Ok(None) => {}
            Err(error) => failed.push(error),
        }
    }

    (updated, failed)
}

async fn apply_cgroup_target(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    progress: Option<&ProgressSender>,
    compose_services: &mut HashSet<String>,
) -> Result<Option<String>, String> {
    let container_label = container_label(docker, &target.container_id).await;
    if is_dokuru_override_strategy(target.strategy.as_deref())
        || is_compose_source_strategy(target.strategy.as_deref())
    {
        let inspect = match docker.inspect_container(&target.container_id, None).await {
            Ok(inspect) => inspect,
            Err(error) => return Err(format!("{container_label}: inspect failed: {error}")),
        };
        let Some(ctx) = compose_context_from_inspect(&inspect) else {
            return Err(format!(
                "{container_label}: compose strategy requested but container has no Compose metadata"
            ));
        };
        if !compose_services.insert(ctx.key()) {
            return Ok(None);
        }

        let result = if is_dokuru_override_strategy(target.strategy.as_deref()) {
            apply_compose_cgroup_override_fix(docker, rule_id, target, &ctx, progress).await
        } else {
            apply_compose_cgroup_resource_fix(docker, rule_id, target, &ctx, progress).await
        };

        return result
            .map(Some)
            .map_err(|error| format!("{container_label}: compose update failed: {error}"));
    }

    apply_standalone_cgroup_target(docker, rule_id, target, progress, &container_label)
        .await
        .map(Some)
}

async fn apply_standalone_cgroup_target(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    progress: Option<&ProgressSender>,
    container_label: &str,
) -> Result<String, String> {
    emit_progress(
        progress,
        rule_id,
        container_label,
        ProgressStep::new(1, 3),
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
                container_label,
                ProgressStep::new(2, 3),
                "prepare_update",
                "error",
                Some(error.to_string()),
            );
            return Err(format!("{container_label}: {error}"));
        }
    };

    let update_command = docker_update_command(rule_id, target, container_label);
    send_progress(
        progress,
        FixProgress {
            rule_id: rule_id.to_string(),
            container_name: container_label.to_string(),
            step: 2,
            total_steps: 3,
            action: "docker_update".to_string(),
            status: "in_progress".to_string(),
            detail: Some(cgroup_update_detail(rule_id, target)),
            command: Some(update_command.clone()),
            stdout: None,
            stderr: None,
        },
    );
    match docker.update_container(&target.container_id, options).await {
        Ok(()) => {
            send_progress(
                progress,
                FixProgress {
                    rule_id: rule_id.to_string(),
                    container_name: container_label.to_string(),
                    step: 2,
                    total_steps: 3,
                    action: "docker_update".to_string(),
                    status: "done".to_string(),
                    detail: Some(cgroup_update_detail(rule_id, target)),
                    command: Some(update_command),
                    stdout: Some(target.container_id.clone()),
                    stderr: None,
                },
            );
            match verify_cgroup_update(docker, rule_id, target).await {
                Ok(()) => {
                    emit_progress(
                        progress,
                        rule_id,
                        container_label,
                        ProgressStep::new(3, 3),
                        "verify_cgroup",
                        "done",
                        Some("Container cgroup limits updated and verified".to_string()),
                    );
                    Ok(container_label.to_string())
                }
                Err(error) => {
                    emit_progress(
                        progress,
                        rule_id,
                        container_label,
                        ProgressStep::new(3, 3),
                        "verify_cgroup",
                        "error",
                        Some(error.to_string()),
                    );
                    Err(format!("{container_label}: verification failed: {error}"))
                }
            }
        }
        Err(error) => {
            emit_progress(
                progress,
                rule_id,
                container_label,
                ProgressStep::new(2, 3),
                "docker_update",
                "error",
                Some(error.to_string()),
            );
            Err(format!("{container_label}: update failed: {error}"))
        }
    }
}

async fn apply_compose_cgroup_resource_fix(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    ctx: &ComposeContext,
    progress: Option<&ProgressSender>,
) -> eyre::Result<String> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(1, 3),
        "inspect_current_cgroup",
        "done",
        Some("Detected Compose-managed container resource limits".to_string()),
    );

    let update = prepare_compose_cgroup_update(ctx, rule_id, target).await?;
    let backup_path =
        write_compose_cgroup_update(rule_id, target, &label, &update, progress).await?;
    run_compose_cgroup_update(ctx, &label, &update, &backup_path, rule_id, progress).await?;

    verify_compose_cgroup_service(docker, rule_id, target, ctx).await?;
    emit_progress(
        progress,
        rule_id,
        &format!("{}:{}", ctx.project, ctx.service),
        ProgressStep::new(3, 3),
        "verify_cgroup",
        "done",
        Some("Compose service cgroup limits updated and verified".to_string()),
    );

    Ok(format!("{}:{} (compose)", ctx.project, ctx.service))
}

struct ComposeCgroupUpdate {
    compose_paths: Vec<PathBuf>,
    compose_path: PathBuf,
    content: String,
}

async fn prepare_compose_cgroup_update(
    ctx: &ComposeContext,
    rule_id: &str,
    target: &FixTarget,
) -> eyre::Result<ComposeCgroupUpdate> {
    let compose_paths = resolve_compose_files(ctx).await?;
    let mut skipped = Vec::new();

    for compose_path in compose_paths.clone() {
        let content = tokio::fs::read_to_string(&compose_path).await?;
        match update_compose_content(&content, &ctx.service, rule_id, Some(target)) {
            Ok(Some(updated_content)) => {
                return Ok(ComposeCgroupUpdate {
                    compose_paths,
                    compose_path,
                    content: updated_content,
                });
            }
            Ok(None) => skipped.push(format!(
                "{}: resource values already match",
                compose_path.display()
            )),
            Err(error) => skipped.push(format!("{}: {error}", compose_path.display())),
        }
    }

    Err(eyre::eyre!(
        "compose service '{}' could not be updated for rule {} ({})",
        ctx.service,
        rule_id,
        skipped.join("; ")
    ))
}

async fn write_compose_cgroup_update(
    rule_id: &str,
    target: &FixTarget,
    label: &str,
    update: &ComposeCgroupUpdate,
    progress: Option<&ProgressSender>,
) -> eyre::Result<PathBuf> {
    let backup_path = compose_backup_path(&update.compose_path);
    copy_compose_backup(&update.compose_path, &backup_path).await?;
    tokio::fs::write(&update.compose_path, &update.content).await?;
    send_progress(
        progress,
        FixProgress {
            rule_id: rule_id.to_string(),
            container_name: label.to_string(),
            step: 2,
            total_steps: 3,
            action: "update_compose_yaml".to_string(),
            status: "done".to_string(),
            detail: Some(format!(
                "Persisted {} in {}",
                cgroup_update_detail(rule_id, target),
                update.compose_path.display()
            )),
            command: Some(format!("write {}", update.compose_path.display())),
            stdout: None,
            stderr: None,
        },
    );
    Ok(backup_path)
}

async fn run_compose_cgroup_update(
    ctx: &ComposeContext,
    label: &str,
    update: &ComposeCgroupUpdate,
    backup_path: &Path,
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let command = compose_up_command_text(ctx, &update.compose_paths);
    emit_compose_up_progress(
        rule_id,
        label,
        progress,
        ComposeUpProgress {
            status: "in_progress",
            detail: Some("Recreating Compose service with persisted cgroup limits".to_string()),
            command: Some(command.clone()),
            stdout: None,
            stderr: None,
        },
    );

    match run_compose_up_capture(ctx, &update.compose_paths).await {
        Ok((stdout, stderr)) => {
            emit_compose_up_progress(
                rule_id,
                label,
                progress,
                ComposeUpProgress {
                    status: "done",
                    detail: Some("Compose service recreated".to_string()),
                    command: Some(command),
                    stdout: Some(stdout),
                    stderr: Some(stderr),
                },
            );
            Ok(())
        }
        Err(error) => {
            let _ = tokio::fs::copy(backup_path, &update.compose_path).await;
            emit_compose_up_progress(
                rule_id,
                label,
                progress,
                ComposeUpProgress {
                    status: "error",
                    detail: Some(error.to_string()),
                    command: Some(command),
                    stdout: None,
                    stderr: Some(format!("{error}")),
                },
            );
            Err(eyre::eyre!(
                "{error}; compose file was restored from {}",
                backup_path.display()
            ))
        }
    }
}

async fn apply_compose_cgroup_override_fix(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    ctx: &ComposeContext,
    progress: Option<&ProgressSender>,
) -> eyre::Result<String> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(1, 3),
        "inspect_current_cgroup",
        "done",
        Some("Detected Compose-managed container resource limits".to_string()),
    );

    let update = prepare_dokuru_compose_override(ctx, rule_id, Some(target)).await?;
    let restore = write_dokuru_compose_override(
        rule_id,
        &label,
        &update,
        ProgressStep::new(2, 3),
        progress,
        Some(cgroup_update_detail(rule_id, target)),
    )
    .await?;
    run_compose_cgroup_override_update(ctx, &label, &update, restore, rule_id, progress).await?;

    verify_compose_cgroup_service(docker, rule_id, target, ctx).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(3, 3),
        "verify_cgroup",
        "done",
        Some("Compose service cgroup limits updated with Dokuru override and verified".to_string()),
    );

    Ok(format!("{}:{} (dokuru override)", ctx.project, ctx.service))
}

async fn run_compose_cgroup_override_update(
    ctx: &ComposeContext,
    label: &str,
    update: &DokuruComposeOverride,
    restore: DokuruOverrideRestore,
    rule_id: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let command = compose_up_command_text(ctx, &update.compose_paths);
    emit_compose_up_progress(
        rule_id,
        label,
        progress,
        ComposeUpProgress {
            status: "in_progress",
            detail: Some("Recreating Compose service with Dokuru override".to_string()),
            command: Some(command.clone()),
            stdout: None,
            stderr: None,
        },
    );

    match run_compose_up_capture(ctx, &update.compose_paths).await {
        Ok((stdout, stderr)) => {
            emit_compose_up_progress(
                rule_id,
                label,
                progress,
                ComposeUpProgress {
                    status: "done",
                    detail: Some("Compose service recreated with Dokuru override".to_string()),
                    command: Some(command),
                    stdout: Some(stdout),
                    stderr: Some(stderr),
                },
            );
            Ok(())
        }
        Err(error) => {
            restore_dokuru_compose_override(&update.override_path, &restore).await;
            emit_compose_up_progress(
                rule_id,
                label,
                progress,
                ComposeUpProgress {
                    status: "error",
                    detail: Some(error.to_string()),
                    command: Some(command),
                    stdout: None,
                    stderr: Some(format!("{error}")),
                },
            );
            Err(eyre::eyre!(
                "{error}; Dokuru override was restored at {}",
                update.override_path.display()
            ))
        }
    }
}

struct ComposeUpProgress {
    status: &'static str,
    detail: Option<String>,
    command: Option<String>,
    stdout: Option<String>,
    stderr: Option<String>,
}

fn emit_compose_up_progress(
    rule_id: &str,
    label: &str,
    progress: Option<&ProgressSender>,
    event: ComposeUpProgress,
) {
    send_progress(
        progress,
        FixProgress {
            rule_id: rule_id.to_string(),
            container_name: label.to_string(),
            step: 2,
            total_steps: 3,
            action: "docker_compose_up".to_string(),
            status: event.status.to_string(),
            detail: event.detail,
            command: event.command,
            stdout: event.stdout.filter(|value| !value.trim().is_empty()),
            stderr: event.stderr.filter(|value| !value.trim().is_empty()),
        },
    );
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
        "5.25" | "cgroup_all" => format!(
            "memory={} bytes, cpu_shares={}, pids_limit={}",
            target.memory.unwrap_or(DEFAULT_MEMORY_BYTES),
            target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES),
            target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT)
        ),
        _ => "resource update".to_string(),
    }
}

fn docker_update_command(rule_id: &str, target: &FixTarget, container: &str) -> String {
    match rule_id {
        "5.11" => format!(
            "docker update --memory={} --memory-swap=-1 {container}",
            compose_memory_value(target.memory.unwrap_or(DEFAULT_MEMORY_BYTES))
        ),
        "5.12" => format!(
            "docker update --cpu-shares={} {container}",
            target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES)
        ),
        "5.29" => format!(
            "docker update --pids-limit={} {container}",
            target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT)
        ),
        "5.25" | "cgroup_all" => format!(
            "docker update --memory={} --memory-swap=-1 --cpu-shares={} --pids-limit={} {container}",
            compose_memory_value(target.memory.unwrap_or(DEFAULT_MEMORY_BYTES)),
            target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES),
            target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT)
        ),
        _ => format!("docker update {container}"),
    }
}

fn compose_memory_value(bytes: i64) -> String {
    let mib = 1024 * 1024;
    if bytes > 0 && bytes % mib == 0 {
        format!("{}m", bytes / mib)
    } else {
        bytes.to_string()
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

    if matches!(rule_id, "5.11" | "5.25" | "cgroup_all") {
        let memory = target.memory.unwrap_or(DEFAULT_MEMORY_BYTES);
        if memory <= 0 {
            return Err(eyre::eyre!("memory must be greater than zero"));
        }
        options.memory = Some(memory);
        // Must update memoryswap together with memory, otherwise Docker returns 409
        // if the existing memoryswap < new memory value. -1 = unlimited swap.
        options.memory_swap = Some(-1);
    }

    if matches!(rule_id, "5.12" | "5.25" | "cgroup_all") {
        let cpu_shares = target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES);
        if cpu_shares <= 0 {
            return Err(eyre::eyre!("cpu_shares must be greater than zero"));
        }
        let cpu_shares =
            isize::try_from(cpu_shares).map_err(|_| eyre::eyre!("cpu_shares is too large"))?;
        options.cpu_shares = Some(cpu_shares);
    }

    if matches!(rule_id, "5.29" | "5.25" | "cgroup_all") {
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

    verify_cgroup_host_config(rule_id, target, &host_config)
}

fn verify_cgroup_host_config(
    rule_id: &str,
    target: &FixTarget,
    host_config: &bollard::models::HostConfig,
) -> eyre::Result<()> {
    if matches!(rule_id, "5.11" | "5.25" | "cgroup_all") {
        let expected = target.memory.unwrap_or(DEFAULT_MEMORY_BYTES);
        if host_config.memory.unwrap_or(0) != expected {
            return Err(eyre::eyre!("memory limit did not update to {expected}"));
        }
    }

    if matches!(rule_id, "5.12" | "5.25" | "cgroup_all") {
        let expected = target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES);
        if host_config.cpu_shares.unwrap_or(0) != expected {
            return Err(eyre::eyre!("CPU shares did not update to {expected}"));
        }
    }

    if matches!(rule_id, "5.29" | "5.25" | "cgroup_all") {
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
                    ProgressStep::new(1, 6),
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
            ProgressStep::new(1, 6),
            "inspect_container",
            "done",
            Some("Container is running with --privileged".to_string()),
        );

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_override_fix(docker, rule_id, &ctx, None, progress)
                    .await
                {
                    Ok(()) => {
                        updated.push(format!("{}:{} (dokuru override)", ctx.project, ctx.service));
                    }
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match Box::pin(recreate_without_privileged(
            docker, id, inspect, progress, &label, rule_id,
        ))
        .await
        {
            Ok(()) => updated.push(label),
            Err(e) => failed.push(format!("{label}: {e}")),
        }
    }

    Ok(fix_outcome(
        rule_id,
        &updated,
        &failed,
        "No containers were running in privileged mode",
        format!(
            "Recreated {} container(s) without --privileged",
            updated.len()
        ),
    ))
}

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

    let mut create_config: Config<String> = container_config.into();
    create_config.host_config = Some(host_config);
    recreate_container(
        docker,
        rule_id,
        progress,
        RecreateContainerRequest {
            id: id.to_string(),
            name,
            label: label.to_string(),
            create_config,
            save_detail: "Saved container config before recreate".to_string(),
            recreate_detail: None,
            done_detail: "Container restarted without --privileged".to_string(),
        },
    )
    .await
}

struct RecreateContainerRequest {
    id: String,
    name: String,
    label: String,
    create_config: Config<String>,
    save_detail: String,
    recreate_detail: Option<String>,
    done_detail: String,
}

struct CreatedRecreateTarget {
    start_target: String,
    label: String,
    done_detail: String,
}

async fn recreate_container(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
    request: RecreateContainerRequest,
) -> eyre::Result<()> {
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(2, 6),
        "save_config",
        "done",
        Some(request.save_detail.clone()),
    );
    stop_container_for_recreate(docker, rule_id, progress, &request).await?;
    remove_container_for_recreate(docker, rule_id, progress, &request).await?;
    let created = create_container_for_recreate(docker, rule_id, progress, request).await?;
    emit_progress(
        progress,
        rule_id,
        &created.label,
        ProgressStep::new(6, 6),
        "start_container",
        "in_progress",
        None,
    );
    docker
        .start_container(&created.start_target, None::<StartContainerOptions<String>>)
        .await?;
    emit_progress(
        progress,
        rule_id,
        &created.label,
        ProgressStep::new(6, 6),
        "verify_isolation",
        "done",
        Some(created.done_detail),
    );
    Ok(())
}

async fn stop_container_for_recreate(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
    request: &RecreateContainerRequest,
) -> eyre::Result<()> {
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(3, 6),
        "stop_container",
        "in_progress",
        None,
    );
    docker
        .stop_container(&request.id, Some(StopContainerOptions { t: 10 }))
        .await?;
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(3, 6),
        "stop_container",
        "done",
        None,
    );
    Ok(())
}

async fn remove_container_for_recreate(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
    request: &RecreateContainerRequest,
) -> eyre::Result<()> {
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(4, 6),
        "remove_container",
        "in_progress",
        None,
    );
    docker
        .remove_container(
            &request.id,
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
        &request.label,
        ProgressStep::new(4, 6),
        "remove_container",
        "done",
        None,
    );
    Ok(())
}

async fn create_container_for_recreate(
    docker: &Docker,
    rule_id: &str,
    progress: Option<&ProgressSender>,
    request: RecreateContainerRequest,
) -> eyre::Result<CreatedRecreateTarget> {
    let opts = (!request.name.is_empty()).then(|| CreateContainerOptions {
        name: request.name.clone(),
        platform: None,
    });
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(5, 6),
        "recreate_container",
        "in_progress",
        request.recreate_detail,
    );
    let created = docker.create_container(opts, request.create_config).await?;
    emit_progress(
        progress,
        rule_id,
        &request.label,
        ProgressStep::new(5, 6),
        "recreate_container",
        "done",
        None,
    );
    let start_target = if request.name.is_empty() {
        created.id
    } else {
        request.name
    };
    Ok(CreatedRecreateTarget {
        start_target,
        label: request.label,
        done_detail: request.done_detail,
    })
}

/// Stop → remove → recreate (with namespace isolation fixed) → start all violating containers.
pub async fn apply_namespace_fix(docker: &Docker, rule_id: &str) -> eyre::Result<FixOutcome> {
    Box::pin(apply_namespace_fix_with_progress(docker, rule_id, None)).await
}

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
                    ProgressStep::new(1, 6),
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
            ProgressStep::new(1, 6),
            "inspect_container",
            "done",
            Some("Container violates namespace isolation rule".to_string()),
        );

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            let key = ctx.key();
            if compose_services.insert(key) {
                match apply_compose_service_override_fix(docker, rule_id, &ctx, None, progress)
                    .await
                {
                    Ok(()) => {
                        updated.push(format!("{}:{} (dokuru override)", ctx.project, ctx.service));
                    }
                    Err(e) => failed.push(format!("{label}: compose fix failed: {e}")),
                }
            }
            continue;
        }

        match Box::pin(recreate_without_namespace(
            docker, id, inspect, rule_id, progress, &label,
        ))
        .await
        {
            Ok(()) => updated.push(label),
            Err(e) => failed.push(format!("{label}: {e}")),
        }
    }

    Ok(fix_outcome(
        rule_id,
        &updated,
        &failed,
        "No containers needed namespace isolation fix",
        format!(
            "Recreated {} container(s) with isolated namespace",
            updated.len()
        ),
    ))
}

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

    let mut create_config: Config<String> = container_config.into();
    create_config.host_config = Some(host_config);
    recreate_container(
        docker,
        rule_id,
        progress,
        RecreateContainerRequest {
            id: id.to_string(),
            name,
            label: label.to_string(),
            create_config,
            save_detail: "Saved container config before namespace recreate".to_string(),
            recreate_detail: Some(namespace_fix_detail(rule_id).to_string()),
            done_detail: "Container restarted with hardened namespace isolation".to_string(),
        },
    )
    .await
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

#[derive(Clone, Debug, PartialEq, Eq)]
struct DockerfileSource {
    path: PathBuf,
    context: PathBuf,
    compose_path: PathBuf,
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

async fn detect_dockerfile_source(ctx: &ComposeContext) -> Option<DockerfileSource> {
    match resolve_dockerfile_source(ctx).await {
        Ok(source) => source,
        Err(error) => {
            tracing::debug!(%error, service = %ctx.service, project = %ctx.project, "Dockerfile detection failed");
            None
        }
    }
}

async fn resolve_dockerfile_source(ctx: &ComposeContext) -> eyre::Result<Option<DockerfileSource>> {
    let compose_paths = resolve_compose_files(ctx).await?;
    let mut skipped = Vec::new();

    for compose_path in compose_paths {
        let content = tokio::fs::read_to_string(&compose_path).await?;
        let Some(source) =
            dockerfile_source_from_compose_content(&content, &ctx.service, &compose_path)?
        else {
            skipped.push(format!("{}: no build Dockerfile", compose_path.display()));
            continue;
        };

        match tokio::fs::metadata(&source.path).await {
            Ok(metadata) if metadata.is_file() => return Ok(Some(source)),
            Ok(_) => skipped.push(format!("{} is not a file", source.path.display())),
            Err(error) => skipped.push(format!("{}: {error}", source.path.display())),
        }
    }

    if skipped.is_empty() {
        return Ok(None);
    }
    tracing::debug!(service = %ctx.service, skipped = %skipped.join("; "), "No Dockerfile source found");
    Ok(None)
}

fn dockerfile_source_from_compose_content(
    compose_content: &str,
    service: &str,
    compose_path: &Path,
) -> eyre::Result<Option<DockerfileSource>> {
    let yaml: YamlValue = serde_yaml::from_str(compose_content)
        .map_err(|error| eyre::eyre!("compose YAML parse failed: {error}"))?;
    let Some(root) = yaml.as_mapping() else {
        return Ok(None);
    };
    let Some(services) = yaml_mapping_get(root, "services").and_then(YamlValue::as_mapping) else {
        return Ok(None);
    };
    let Some(service) = yaml_mapping_get(services, service).and_then(YamlValue::as_mapping) else {
        return Ok(None);
    };
    let Some(build) = yaml_mapping_get(service, "build") else {
        return Ok(None);
    };

    let (build_context_raw, dockerfile_raw) = match build {
        YamlValue::String(build_context) => (build_context.as_str(), "Dockerfile"),
        YamlValue::Mapping(build) => {
            if yaml_mapping_get(build, "dockerfile_inline").is_some() {
                return Ok(None);
            }
            let build_context = yaml_mapping_get(build, "context")
                .and_then(YamlValue::as_str)
                .unwrap_or(".");
            let dockerfile = yaml_mapping_get(build, "dockerfile")
                .and_then(YamlValue::as_str)
                .unwrap_or("Dockerfile");
            (build_context, dockerfile)
        }
        _ => return Ok(None),
    };

    let compose_dir = compose_path.parent().unwrap_or_else(|| Path::new("."));
    let Some(build_context) = resolve_compose_relative_path(compose_dir, build_context_raw) else {
        return Ok(None);
    };
    let Some(path) = resolve_dockerfile_path(&build_context, dockerfile_raw) else {
        return Ok(None);
    };

    Ok(Some(DockerfileSource {
        path,
        context: build_context,
        compose_path: compose_path.to_path_buf(),
    }))
}

fn yaml_mapping_get<'a>(mapping: &'a YamlMapping, key: &str) -> Option<&'a YamlValue> {
    let key = YamlValue::String(key.to_string());
    mapping.get(&key)
}

fn resolve_compose_relative_path(base: &Path, raw: &str) -> Option<PathBuf> {
    let raw = raw.trim();
    if raw.is_empty() || raw.contains("://") || raw.starts_with("git@") {
        return None;
    }
    let path = PathBuf::from(raw);
    Some(if path.is_absolute() {
        path
    } else {
        base.join(path)
    })
}

fn resolve_dockerfile_path(context: &Path, raw: &str) -> Option<PathBuf> {
    let raw = raw.trim();
    if raw.is_empty() || raw.contains("://") {
        return None;
    }
    let path = PathBuf::from(raw);
    Some(if path.is_absolute() {
        path
    } else {
        context.join(path)
    })
}

async fn apply_compose_service_fix(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    let edit = prepare_compose_service_edit(rule_id, ctx, &label, progress).await?;
    let backup_path = write_compose_service_edit(rule_id, &label, &edit, progress).await?;
    run_compose_service_edit(docker, rule_id, ctx, &label, &edit, &backup_path, progress).await
}

async fn apply_compose_service_override_fix(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
    target: Option<&FixTarget>,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    let label = format!("{}:{}", ctx.project, ctx.service);
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(2, 6),
        "resolve_compose_file",
        "in_progress",
        Some("Resolving Docker Compose config files".to_string()),
    );
    let update = prepare_dokuru_compose_override(ctx, rule_id, target).await?;
    emit_progress(
        progress,
        rule_id,
        &label,
        ProgressStep::new(2, 6),
        "resolve_compose_file",
        "done",
        Some(format!(
            "{} compose file(s) found",
            update.compose_paths.len() - 1
        )),
    );
    let restore = write_dokuru_compose_override(
        rule_id,
        &label,
        &update,
        ProgressStep::new(3, 6),
        progress,
        Some("service override".to_string()),
    )
    .await?;

    run_compose_service_override(docker, rule_id, ctx, &label, &update, restore, progress).await
}

struct ComposeServiceEdit {
    compose_paths: Vec<PathBuf>,
    compose_path: PathBuf,
    content: String,
}

async fn prepare_compose_service_edit(
    rule_id: &str,
    ctx: &ComposeContext,
    label: &str,
    progress: Option<&ProgressSender>,
) -> eyre::Result<ComposeServiceEdit> {
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(2, 6),
        "resolve_compose_file",
        "in_progress",
        Some("Resolving Docker Compose config files".to_string()),
    );
    let compose_paths = resolve_compose_files(ctx).await?;
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(2, 6),
        "resolve_compose_file",
        "done",
        Some(format!("{} compose file(s) found", compose_paths.len())),
    );
    let mut update: Option<(PathBuf, String)> = None;
    let mut skipped = Vec::new();

    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(3, 6),
        "update_compose_yaml",
        "in_progress",
        Some("Editing Compose service definition".to_string()),
    );
    for compose_path in &compose_paths {
        let content = tokio::fs::read_to_string(compose_path).await?;

        match update_compose_content(&content, &ctx.service, rule_id, None) {
            Ok(Some(updated_content)) => {
                update = Some((compose_path.clone(), updated_content));
                break;
            }
            Ok(None) => skipped.push(format!(
                "{}: service setting not present",
                compose_path.display()
            )),
            Err(error) => skipped.push(format!("{}: {error}", compose_path.display())),
        }
    }

    let Some((compose_path, content)) = update else {
        return Err(eyre::eyre!(
            "compose service '{}' does not declare the setting required for rule {} ({})",
            ctx.service,
            rule_id,
            skipped.join("; ")
        ));
    };

    Ok(ComposeServiceEdit {
        compose_paths,
        compose_path,
        content,
    })
}

async fn write_compose_service_edit(
    rule_id: &str,
    label: &str,
    edit: &ComposeServiceEdit,
    progress: Option<&ProgressSender>,
) -> eyre::Result<PathBuf> {
    let backup_path = compose_backup_path(&edit.compose_path);
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(3, 6),
        "backup_compose_yaml",
        "in_progress",
        Some(format!("Creating backup {}", backup_path.display())),
    );
    copy_compose_backup(&edit.compose_path, &backup_path).await?;
    tokio::fs::write(&edit.compose_path, &edit.content).await?;
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(3, 6),
        "update_compose_yaml",
        "done",
        Some(format!("Updated {}", edit.compose_path.display())),
    );
    Ok(backup_path)
}

async fn run_compose_service_edit(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
    label: &str,
    edit: &ComposeServiceEdit,
    backup_path: &Path,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(4, 6),
        "docker_compose_up",
        "in_progress",
        Some(format!("Recreating service {}", ctx.service)),
    );
    if let Err(error) = run_compose_up(ctx, &edit.compose_paths).await {
        let _ = tokio::fs::copy(backup_path, &edit.compose_path).await;
        emit_progress(
            progress,
            rule_id,
            label,
            ProgressStep::new(4, 6),
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
        label,
        ProgressStep::new(5, 6),
        "docker_compose_up",
        "done",
        None,
    );

    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(6, 6),
        "verify_compose_service",
        "in_progress",
        None,
    );
    verify_compose_service(docker, rule_id, ctx).await?;
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(6, 6),
        "verify_compose_service",
        "done",
        Some("Compose service recreated and verified".to_string()),
    );
    Ok(())
}

async fn run_compose_service_override(
    docker: &Docker,
    rule_id: &str,
    ctx: &ComposeContext,
    label: &str,
    update: &DokuruComposeOverride,
    restore: DokuruOverrideRestore,
    progress: Option<&ProgressSender>,
) -> eyre::Result<()> {
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(4, 6),
        "docker_compose_up",
        "in_progress",
        Some(format!(
            "Recreating service {} with Dokuru override",
            ctx.service
        )),
    );
    if let Err(error) = run_compose_up(ctx, &update.compose_paths).await {
        restore_dokuru_compose_override(&update.override_path, &restore).await;
        emit_progress(
            progress,
            rule_id,
            label,
            ProgressStep::new(4, 6),
            "docker_compose_up",
            "error",
            Some(error.to_string()),
        );
        return Err(eyre::eyre!(
            "{error}; Dokuru override was restored at {}",
            update.override_path.display()
        ));
    }
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(5, 6),
        "docker_compose_up",
        "done",
        None,
    );

    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(6, 6),
        "verify_compose_service",
        "in_progress",
        None,
    );
    verify_compose_service(docker, rule_id, ctx).await?;
    emit_progress(
        progress,
        rule_id,
        label,
        ProgressStep::new(6, 6),
        "verify_compose_service",
        "done",
        Some("Compose service recreated with Dokuru override and verified".to_string()),
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

fn safe_compose_artifact_name(path: &Path) -> String {
    let filename = path.file_name().map_or_else(
        || "compose.yaml".to_string(),
        |name| name.to_string_lossy().into_owned(),
    );

    filename
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn compose_artifact_path(path: &Path, kind: &str) -> PathBuf {
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let filename = safe_compose_artifact_name(path);
    dokuru_data_dir().join(COMPOSE_BACKUP_DIR).join(format!(
        "{filename}.{kind}.{timestamp}.{}.bak",
        Uuid::new_v4()
    ))
}

fn compose_backup_path(path: &Path) -> PathBuf {
    compose_artifact_path(path, "edit")
}

async fn copy_compose_backup(source: &Path, backup_path: &Path) -> eyre::Result<()> {
    if let Some(parent) = backup_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::copy(source, backup_path).await?;
    Ok(())
}

struct DokuruComposeOverride {
    compose_paths: Vec<PathBuf>,
    override_path: PathBuf,
    content: String,
}

struct DokuruOverrideRestore {
    backup_path: Option<PathBuf>,
    delete_on_restore: bool,
}

async fn prepare_dokuru_compose_override(
    ctx: &ComposeContext,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<DokuruComposeOverride> {
    let mut compose_paths = resolve_compose_files(ctx).await?;
    let override_path = dokuru_compose_override_path(ctx, &compose_paths)?;
    let existing = match tokio::fs::read_to_string(&override_path).await {
        Ok(content) => Some(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    let content =
        upsert_dokuru_override_content(existing.as_deref(), &ctx.service, rule_id, target)?;
    push_unique_path(&mut compose_paths, override_path.clone());

    Ok(DokuruComposeOverride {
        compose_paths,
        override_path,
        content,
    })
}

fn dokuru_compose_override_path(
    ctx: &ComposeContext,
    compose_paths: &[PathBuf],
) -> eyre::Result<PathBuf> {
    let filename = compose_override_filename(compose_paths.first().map(PathBuf::as_path));
    if let Some(working_dir) = &ctx.working_dir {
        return Ok(working_dir.join(filename));
    }

    if let Some(parent) = compose_paths.first().and_then(|path| path.parent()) {
        return Ok(parent.join(filename));
    }

    Err(eyre::eyre!(
        "could not determine Dokuru override path for {}:{}",
        ctx.project,
        ctx.service
    ))
}

fn compose_override_filename(compose_path: Option<&Path>) -> String {
    let Some(compose_path) = compose_path else {
        return DEFAULT_COMPOSE_OVERRIDE_FILENAME.to_string();
    };

    let extension = compose_path
        .extension()
        .and_then(|extension| extension.to_str())
        .filter(|extension| *extension == "yaml")
        .unwrap_or("yml");
    let filename = compose_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let prefix = if filename.starts_with("compose.") {
        "compose"
    } else {
        "docker-compose"
    };

    format!("{prefix}.override.{extension}")
}

async fn write_dokuru_compose_override(
    rule_id: &str,
    label: &str,
    update: &DokuruComposeOverride,
    step: ProgressStep,
    progress: Option<&ProgressSender>,
    detail: Option<String>,
) -> eyre::Result<DokuruOverrideRestore> {
    let existing = match tokio::fs::read_to_string(&update.override_path).await {
        Ok(content) => Some(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };

    let restore = if existing.as_deref() == Some(update.content.as_str()) {
        DokuruOverrideRestore {
            backup_path: None,
            delete_on_restore: false,
        }
    } else if existing.is_some() {
        let backup_path = compose_backup_path(&update.override_path);
        copy_compose_backup(&update.override_path, &backup_path).await?;
        DokuruOverrideRestore {
            backup_path: Some(backup_path),
            delete_on_restore: false,
        }
    } else {
        DokuruOverrideRestore {
            backup_path: None,
            delete_on_restore: true,
        }
    };

    if existing.as_deref() != Some(update.content.as_str()) {
        if let Some(parent) = update.override_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&update.override_path, &update.content).await?;
    }

    emit_progress(
        progress,
        rule_id,
        label,
        step,
        "write_dokuru_override",
        "done",
        Some(format!(
            "Wrote Dokuru Compose override {}{}",
            update.override_path.display(),
            detail.map_or_else(String::new, |detail| format!(" ({detail})"))
        )),
    );

    Ok(restore)
}

async fn restore_dokuru_compose_override(path: &Path, restore: &DokuruOverrideRestore) {
    if let Some(backup_path) = &restore.backup_path {
        let _ = tokio::fs::copy(backup_path, path).await;
    } else if restore.delete_on_restore {
        let _ = tokio::fs::remove_file(path).await;
    }
}

fn upsert_dokuru_override_content(
    existing: Option<&str>,
    service: &str,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<String> {
    let mut lines = existing
        .filter(|content| !content.trim().is_empty())
        .map_or_else(
            || {
                vec![
                    "# Managed by Dokuru. Keep this file after the base compose files.".to_string(),
                ]
            },
            split_yaml_lines,
        );

    let services_section_line = find_mapping_key(&lines, 0..lines.len(), 0, "services")
        .unwrap_or_else(|| {
            if !lines.last().is_none_or(|line| line.trim().is_empty()) {
                lines.push(String::new());
            }
            lines.push("services:".to_string());
            lines.len() - 1
        });

    let services_section_indent = leading_spaces(&lines[services_section_line]);
    let mut services_end = block_end(&lines, services_section_line + 1, services_section_indent);
    let service_name_indent = first_child_indent(
        &lines,
        services_section_line + 1,
        services_end,
        services_section_indent,
    )
    .unwrap_or(services_section_indent + 2);

    let mut block = if let Some(service_line) = find_mapping_key(
        &lines,
        services_section_line + 1..services_end,
        service_name_indent,
        service,
    ) {
        ComposeServiceBlock {
            service_line,
            end: block_end(&lines, service_line + 1, service_name_indent),
            body_indent: first_child_indent(
                &lines,
                service_line + 1,
                block_end(&lines, service_line + 1, service_name_indent),
                service_name_indent,
            )
            .unwrap_or(service_name_indent + 2),
        }
    } else {
        lines.insert(
            services_end,
            format!(
                "{}{}:",
                " ".repeat(service_name_indent),
                yaml_key_text(service)
            ),
        );
        services_end += 1;
        ComposeServiceBlock {
            service_line: services_end - 1,
            end: services_end,
            body_indent: service_name_indent + 2,
        }
    };

    apply_dokuru_override_service_lines(&mut lines, &mut block, rule_id, target)?;
    Ok(render_yaml_lines(&lines, true))
}

fn apply_dokuru_override_service_lines(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<bool> {
    let changed = match rule_id {
        "4.1" => set_service_value_text(
            lines,
            block,
            "user",
            &yaml_quoted_scalar(DEFAULT_NON_ROOT_USER),
        ),
        "4.6" => set_healthcheck_text(lines, block),
        "5.5" => set_service_value_text(lines, block, "privileged", "false"),
        "5.10" => set_service_value_text(lines, block, "network_mode", "bridge"),
        "5.16" => set_service_value_text(lines, block, "pid", "!reset null"),
        "5.17" => set_service_value_text(lines, block, "ipc", "private"),
        "5.21" => set_service_value_text(lines, block, "uts", "!reset null"),
        "5.31" => {
            set_service_value_text(lines, block, "userns_mode", "!reset null")
                | set_service_value_text(lines, block, "userns", "!reset null")
        }
        "5.11" => set_service_value_text(
            lines,
            block,
            "mem_limit",
            &compose_memory_value(
                target
                    .and_then(|target| target.memory)
                    .unwrap_or(DEFAULT_MEMORY_BYTES),
            ),
        ),
        "5.12" => set_service_value_text(
            lines,
            block,
            "cpu_shares",
            &target
                .and_then(|target| target.cpu_shares)
                .unwrap_or(DEFAULT_CPU_SHARES)
                .to_string(),
        ),
        "5.29" => set_service_value_text(
            lines,
            block,
            "pids_limit",
            &target
                .and_then(|target| target.pids_limit)
                .unwrap_or(DEFAULT_PIDS_LIMIT)
                .to_string(),
        ),
        "5.25" | "cgroup_all" => {
            let target =
                target.ok_or_else(|| eyre::eyre!("cgroup override needs target values"))?;
            set_cgroup_all_service_values(lines, block, target)
        }
        _ => return Err(eyre::eyre!("unsupported Dokuru override rule {rule_id}")),
    };

    Ok(changed)
}

fn yaml_key_text(value: &str) -> String {
    if !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.'))
    {
        value.to_string()
    } else {
        yaml_quoted_scalar(value)
    }
}

fn yaml_quoted_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[derive(Clone, Copy)]
struct ComposeServiceBlock {
    service_line: usize,
    end: usize,
    body_indent: usize,
}

fn update_compose_content(
    content: &str,
    service: &str,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<Option<String>> {
    validate_compose_service_with_lossless_parser(content, service)?;
    let mut lines = split_yaml_lines(content);
    let mut block = find_compose_service_block(&lines, service)?;
    let changed = update_compose_service_lines(&mut lines, &mut block, rule_id, target)?;

    Ok(changed.then(|| render_yaml_lines(&lines, content.ends_with('\n'))))
}

fn validate_compose_service_with_lossless_parser(content: &str, service: &str) -> eyre::Result<()> {
    let yaml = YamlFile::from_str(content)
        .map_err(|error| eyre::eyre!("compose YAML parse failed: {error}"))?;
    let doc = yaml
        .document()
        .ok_or_else(|| eyre::eyre!("compose file has no YAML document"))?;
    let root = doc
        .as_mapping()
        .ok_or_else(|| eyre::eyre!("compose document root must be a mapping"))?;
    let services = root
        .get_mapping("services")
        .ok_or_else(|| eyre::eyre!("compose file has no services section"))?;
    services
        .get_mapping(service)
        .ok_or_else(|| eyre::eyre!("compose service '{service}' not found or is not a mapping"))?;

    Ok(())
}

fn update_compose_service_lines(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<bool> {
    let changed = match rule_id {
        "4.1" => set_service_value_text(
            lines,
            block,
            "user",
            &format!("\"{DEFAULT_NON_ROOT_USER}\""),
        ),
        "4.6" => set_healthcheck_text(lines, block),
        "5.5" => set_existing_service_value(lines, block, "privileged", "false"),
        "5.10" => remove_service_keys_text(lines, block, &["network_mode"]),
        "5.16" => remove_service_keys_text(lines, block, &["pid"]),
        "5.17" => remove_service_keys_text(lines, block, &["ipc"]),
        "5.21" => remove_service_keys_text(lines, block, &["uts"]),
        "5.31" => remove_service_keys_text(lines, block, &["userns_mode", "userns"]),
        "5.11" => set_service_value_text(
            lines,
            block,
            "mem_limit",
            &compose_memory_value(
                target
                    .and_then(|target| target.memory)
                    .unwrap_or(DEFAULT_MEMORY_BYTES),
            ),
        ),
        "5.12" => set_service_value_text(
            lines,
            block,
            "cpu_shares",
            &target
                .and_then(|target| target.cpu_shares)
                .unwrap_or(DEFAULT_CPU_SHARES)
                .to_string(),
        ),
        "5.29" => set_service_value_text(
            lines,
            block,
            "pids_limit",
            &target
                .and_then(|target| target.pids_limit)
                .unwrap_or(DEFAULT_PIDS_LIMIT)
                .to_string(),
        ),
        "5.25" | "cgroup_all" => {
            let target =
                target.ok_or_else(|| eyre::eyre!("cgroup compose update needs target values"))?;
            set_cgroup_all_service_values(lines, block, target)
        }
        _ => false,
    };

    Ok(changed)
}

fn set_cgroup_all_service_values(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    target: &FixTarget,
) -> bool {
    let memory = compose_memory_value(target.memory.unwrap_or(DEFAULT_MEMORY_BYTES));
    let cpu_shares = target.cpu_shares.unwrap_or(DEFAULT_CPU_SHARES).to_string();
    let pids_limit = target.pids_limit.unwrap_or(DEFAULT_PIDS_LIMIT).to_string();

    set_service_value_text(lines, block, "mem_limit", &memory)
        | set_service_value_text(lines, block, "cpu_shares", &cpu_shares)
        | set_service_value_text(lines, block, "pids_limit", &pids_limit)
}

fn set_healthcheck_text(lines: &mut Vec<String>, block: &mut ComposeServiceBlock) -> bool {
    if service_key_range(lines, block, "healthcheck").is_some() {
        return false;
    }

    let indent = " ".repeat(block.body_indent);
    let child_indent = " ".repeat(block.body_indent + 2);
    let new_lines = [
        format!("{indent}healthcheck:"),
        format!("{child_indent}test: [\"CMD-SHELL\", \"{DEFAULT_HEALTHCHECK_TEST}\"]"),
        format!("{child_indent}interval: 30s"),
        format!("{child_indent}timeout: 10s"),
        format!("{child_indent}retries: 3"),
        format!("{child_indent}start_period: 10s"),
    ];
    let insert_at = service_insert_index(lines, block);
    lines.splice(insert_at..insert_at, new_lines);
    block.end += 6;
    true
}

fn split_yaml_lines(content: &str) -> Vec<String> {
    content.lines().map(ToOwned::to_owned).collect()
}

fn render_yaml_lines(lines: &[String], trailing_newline: bool) -> String {
    let mut content = lines.join("\n");
    if trailing_newline {
        content.push('\n');
    }
    content
}

fn find_compose_service_block(
    lines: &[String],
    service: &str,
) -> eyre::Result<ComposeServiceBlock> {
    let services_section_line = find_mapping_key(lines, 0..lines.len(), 0, "services")
        .ok_or_else(|| eyre::eyre!("compose file has no services section"))?;
    let services_section_indent = leading_spaces(&lines[services_section_line]);
    let services_end = block_end(lines, services_section_line + 1, services_section_indent);
    let service_name_indent = first_child_indent(
        lines,
        services_section_line + 1,
        services_end,
        services_section_indent,
    )
    .ok_or_else(|| eyre::eyre!("compose services section is empty"))?;
    let target_service_line = find_mapping_key(
        lines,
        services_section_line + 1..services_end,
        service_name_indent,
        service,
    )
    .ok_or_else(|| eyre::eyre!("compose service '{service}' not found"))?;
    let end = block_end(lines, target_service_line + 1, service_name_indent);
    let body_indent = first_child_indent(lines, target_service_line + 1, end, service_name_indent)
        .unwrap_or(service_name_indent + 2);

    Ok(ComposeServiceBlock {
        service_line: target_service_line,
        end,
        body_indent,
    })
}

fn find_mapping_key(
    lines: &[String],
    mut range: std::ops::Range<usize>,
    indent: usize,
    key: &str,
) -> Option<usize> {
    range.find(|&idx| mapping_key_matches_at(&lines[idx], indent, key))
}

fn block_end(lines: &[String], start: usize, parent_indent: usize) -> usize {
    lines
        .iter()
        .enumerate()
        .skip(start)
        .find_map(|(idx, line)| {
            let trimmed = line.trim();
            (!trimmed.is_empty()
                && !trimmed.starts_with('#')
                && leading_spaces(line) <= parent_indent)
                .then_some(idx)
        })
        .unwrap_or(lines.len())
}

fn first_child_indent(
    lines: &[String],
    start: usize,
    end: usize,
    parent_indent: usize,
) -> Option<usize> {
    lines[start..end]
        .iter()
        .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with('#'))
        .map(|line| leading_spaces(line))
        .find(|&indent| indent > parent_indent)
}

fn mapping_key_matches_at(line: &str, indent: usize, key: &str) -> bool {
    leading_spaces(line) == indent && mapping_key_matches(line.trim(), key)
}

fn mapping_key_matches(trimmed: &str, key: &str) -> bool {
    let Some((raw_key, _)) = trimmed.split_once(':') else {
        return false;
    };
    unquote_yaml_key(raw_key.trim()) == key
}

fn unquote_yaml_key(raw_key: &str) -> &str {
    raw_key
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            raw_key
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(raw_key)
}

fn leading_spaces(line: &str) -> usize {
    line.as_bytes()
        .iter()
        .take_while(|&&byte| byte == b' ')
        .count()
}

fn service_key_range(
    lines: &[String],
    block: &ComposeServiceBlock,
    key: &str,
) -> Option<std::ops::Range<usize>> {
    let start = (block.service_line + 1..block.end)
        .find(|&idx| mapping_key_matches_at(&lines[idx], block.body_indent, key))?;
    Some(start..block_end(lines, start + 1, block.body_indent))
}

fn remove_service_keys_text(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    keys: &[&str],
) -> bool {
    let mut ranges = keys
        .iter()
        .filter_map(|key| service_key_range(lines, block, key))
        .collect::<Vec<_>>();
    let removed = ranges.iter().map(std::ops::Range::len).sum::<usize>();
    ranges.sort_by_key(|range| range.start);
    for range in ranges.into_iter().rev() {
        lines.drain(range);
    }
    block.end = block.end.saturating_sub(removed);
    removed > 0
}

fn set_existing_service_value(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    key: &str,
    value: &str,
) -> bool {
    service_key_range(lines, block, key)
        .is_some_and(|range| replace_service_value_range(lines, block, range, key, value))
}

fn set_service_value_text(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    key: &str,
    value: &str,
) -> bool {
    if let Some(range) = service_key_range(lines, block, key) {
        return replace_service_value_range(lines, block, range, key, value);
    }

    let line = service_value_line(block.body_indent, key, value);
    let insert_at = service_insert_index(lines, block);
    lines.insert(insert_at, line);
    block.end += 1;
    true
}

fn replace_service_value_range(
    lines: &mut Vec<String>,
    block: &mut ComposeServiceBlock,
    range: std::ops::Range<usize>,
    key: &str,
    value: &str,
) -> bool {
    if range.len() == 1 && service_line_has_value(&lines[range.start], key, value) {
        return false;
    }

    let old_len = range.len();
    lines.splice(range, [service_value_line(block.body_indent, key, value)]);
    block.end = block.end + 1 - old_len;
    true
}

fn service_line_has_value(line: &str, key: &str, value: &str) -> bool {
    let trimmed = line.trim();
    let Some((raw_key, raw_value)) = trimmed.split_once(':') else {
        return false;
    };
    unquote_yaml_key(raw_key.trim()) == key && raw_value.trim() == value
}

fn service_value_line(indent: usize, key: &str, value: &str) -> String {
    format!("{}{}: {}", " ".repeat(indent), key, value)
}

fn service_insert_index(lines: &[String], block: &ComposeServiceBlock) -> usize {
    let mut insert_at = block.end;
    while insert_at > block.service_line + 1 && lines[insert_at - 1].trim().is_empty() {
        insert_at -= 1;
    }
    insert_at
}

fn compose_up_command_text(ctx: &ComposeContext, compose_paths: &[PathBuf]) -> String {
    let mut parts = vec!["docker".to_string(), "compose".to_string()];
    for compose_path in compose_paths {
        parts.push("-f".to_string());
        parts.push(compose_path.display().to_string());
    }
    parts.push("up".to_string());
    parts.push("-d".to_string());
    parts.push(ctx.service.clone());
    parts.join(" ")
}

async fn run_compose_up_capture(
    ctx: &ComposeContext,
    compose_paths: &[PathBuf],
) -> eyre::Result<(String, String)> {
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
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        return Ok((stdout, stderr));
    }

    Err(eyre::eyre!(
        "docker compose up failed: {}",
        if stderr.is_empty() { stdout } else { stderr }
    ))
}

async fn run_compose_up(ctx: &ComposeContext, compose_paths: &[PathBuf]) -> eyre::Result<()> {
    run_compose_up_capture(ctx, compose_paths).await.map(|_| ())
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

async fn verify_compose_cgroup_service(
    docker: &Docker,
    rule_id: &str,
    target: &FixTarget,
    ctx: &ComposeContext,
) -> eyre::Result<()> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut found = false;
    let mut failures = Vec::new();

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
        let host_config = inspect
            .host_config
            .ok_or_else(|| eyre::eyre!("missing host_config"))?;

        if let Err(error) = verify_cgroup_host_config(rule_id, target, &host_config) {
            failures.push(format!("{}: {error}", container_label(docker, id).await));
        }
    }

    if !found {
        return Err(eyre::eyre!(
            "compose service '{}:{}' was not running after compose up",
            ctx.project,
            ctx.service
        ));
    }

    if !failures.is_empty() {
        return Err(eyre::eyre!(
            "compose service cgroup verification failed: {}",
            failures.join(", ")
        ));
    }

    Ok(())
}

fn container_violates_rule(inspect: &ContainerInspectResponse, rule_id: &str) -> bool {
    let host_config = inspect.host_config.as_ref();
    match rule_id {
        "4.1" => inspect
            .config
            .as_ref()
            .and_then(|config| config.user.as_deref())
            .is_none_or(|user| user.is_empty() || user == "root" || user == "0"),
        "4.6" => inspect
            .config
            .as_ref()
            .and_then(|config| config.healthcheck.as_ref())
            .is_none(),
        "5.5" => host_config.and_then(|h| h.privileged).unwrap_or(false),
        "5.10" => host_config.and_then(|h| h.network_mode.as_deref()) == Some("host"),
        "5.16" => host_config.and_then(|h| h.pid_mode.as_deref()) == Some("host"),
        "5.17" => host_config.and_then(|h| h.ipc_mode.as_deref()) == Some("host"),
        "5.21" => host_config.and_then(|h| h.uts_mode.as_deref()) == Some("host"),
        "5.31" => host_config.and_then(|h| h.userns_mode.as_deref()) == Some("host"),
        _ => false,
    }
}

pub async fn rollback_plan_for_request(
    docker: &Docker,
    request: &FixRequest,
) -> eyre::Result<RollbackPlan> {
    if !supports_cgroup_resource_fix(&request.rule_id) {
        if supports_namespace_fix(&request.rule_id)
            || supports_privileged_fix(&request.rule_id)
            || supports_image_config_fix(&request.rule_id)
        {
            return Ok(RollbackPlan {
                cgroup_targets: Vec::new(),
                compose_targets: compose_rollback_targets_for_rule(docker, &request.rule_id)
                    .await?,
            });
        }

        return Ok(RollbackPlan::default());
    }

    cgroup_rollback_plan(docker, request).await
}

async fn cgroup_rollback_plan(docker: &Docker, request: &FixRequest) -> eyre::Result<RollbackPlan> {
    let targets = if request.targets.is_empty() {
        let containers = docker.list_containers::<String>(None).await?;
        let mut targets = Vec::new();
        for container in &containers {
            if let Some(target) = default_target_for_rule(docker, &request.rule_id, container).await
            {
                targets.push(target);
            }
        }
        targets
    } else {
        request.targets.clone()
    };

    let mut cgroup_targets = Vec::new();
    let mut compose_targets = Vec::new();
    let mut compose_services = HashSet::<String>::new();

    for target in targets {
        let inspect = docker.inspect_container(&target.container_id, None).await?;
        let Some(host_config) = inspect.host_config.as_ref() else {
            continue;
        };

        if let Some(ctx) = compose_context_from_inspect(&inspect) {
            if compose_services.insert(ctx.key()) {
                if is_dokuru_override_strategy(target.strategy.as_deref()) {
                    compose_targets.push(compose_rollback_target_for_override(&ctx).await?);
                } else if is_dockerfile_source_strategy(target.strategy.as_deref()) {
                    // Dockerfile source fixes write their own backup path in progress output.
                } else if let Ok(compose_path) =
                    find_compose_update_path(&ctx, &request.rule_id, Some(&target)).await
                {
                    compose_targets
                        .push(compose_rollback_target_with_backup(&ctx, compose_path).await?);
                }
            }
            continue;
        }

        cgroup_targets.push(FixTarget {
            container_id: target.container_id,
            memory: host_config.memory,
            cpu_shares: host_config.cpu_shares,
            pids_limit: host_config.pids_limit,
            strategy: Some("cgroup_rollback".to_string()),
        });
    }

    Ok(RollbackPlan {
        cgroup_targets,
        compose_targets,
    })
}

async fn compose_rollback_targets_for_rule(
    docker: &Docker,
    rule_id: &str,
) -> eyre::Result<Vec<ComposeRollbackTarget>> {
    let containers = docker.list_containers::<String>(None).await?;
    let mut targets = Vec::new();
    let mut compose_services = HashSet::<String>::new();

    for container in &containers {
        let Some(id) = container.id.as_deref() else {
            continue;
        };
        let inspect = docker.inspect_container(id, None).await?;
        if !container_violates_rule(&inspect, rule_id) {
            continue;
        }
        let Some(ctx) = compose_context_from_inspect(&inspect) else {
            continue;
        };
        if !compose_services.insert(ctx.key()) {
            continue;
        }
        targets.push(compose_rollback_target_for_override(&ctx).await?);
    }

    Ok(targets)
}

async fn find_compose_update_path(
    ctx: &ComposeContext,
    rule_id: &str,
    target: Option<&FixTarget>,
) -> eyre::Result<PathBuf> {
    let compose_paths = resolve_compose_files(ctx).await?;
    let mut skipped = Vec::new();

    for compose_path in compose_paths {
        let content = tokio::fs::read_to_string(&compose_path).await?;
        match update_compose_content(&content, &ctx.service, rule_id, target) {
            Ok(Some(_)) => return Ok(compose_path),
            Ok(None) => skipped.push(format!(
                "{}: no rollback-relevant change",
                compose_path.display()
            )),
            Err(error) => skipped.push(format!("{}: {error}", compose_path.display())),
        }
    }

    Err(eyre::eyre!(
        "compose service '{}' could not be mapped to a rollback compose file for rule {} ({})",
        ctx.service,
        rule_id,
        skipped.join("; ")
    ))
}

async fn compose_rollback_target_with_backup(
    ctx: &ComposeContext,
    compose_path: PathBuf,
) -> eyre::Result<ComposeRollbackTarget> {
    let backup_path = compose_rollback_backup_path(&compose_path);
    copy_compose_backup(&compose_path, &backup_path).await?;

    Ok(ComposeRollbackTarget {
        project: ctx.project.clone(),
        service: ctx.service.clone(),
        compose_path: compose_path.to_string_lossy().to_string(),
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        delete_on_rollback: false,
        working_dir: ctx
            .working_dir
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        config_files: ctx.config_files.clone(),
    })
}

async fn compose_rollback_target_for_override(
    ctx: &ComposeContext,
) -> eyre::Result<ComposeRollbackTarget> {
    let compose_paths = resolve_compose_files(ctx).await?;
    let override_path = dokuru_compose_override_path(ctx, &compose_paths)?;
    let backup_path = match tokio::fs::metadata(&override_path).await {
        Ok(metadata) if metadata.is_file() => {
            let backup_path = compose_rollback_backup_path(&override_path);
            copy_compose_backup(&override_path, &backup_path).await?;
            Some(backup_path.to_string_lossy().to_string())
        }
        Ok(_) => {
            return Err(eyre::eyre!(
                "Dokuru override path exists but is not a file: {}",
                override_path.display()
            ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };

    Ok(ComposeRollbackTarget {
        project: ctx.project.clone(),
        service: ctx.service.clone(),
        compose_path: override_path.to_string_lossy().to_string(),
        delete_on_rollback: backup_path.is_none(),
        backup_path,
        working_dir: ctx
            .working_dir
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        config_files: ctx.config_files.clone(),
    })
}

fn compose_rollback_backup_path(path: &Path) -> PathBuf {
    compose_artifact_path(path, "rollback")
}

pub async fn record_fix_history(
    request: FixRequest,
    outcome: FixOutcome,
    rollback_plan: RollbackPlan,
    progress_events: Vec<FixProgress>,
) -> FixHistoryEntry {
    let RollbackPlan {
        cgroup_targets: rollback_targets,
        compose_targets,
    } = rollback_plan;
    let compose_rollback_targets = compose_targets;
    let has_compose_rollback = compose_rollback_targets
        .iter()
        .any(|target| target.backup_path.is_some() || target.delete_on_rollback);
    let rollback_supported = outcome.status == FixStatus::Applied
        && (!rollback_targets.is_empty() || has_compose_rollback);
    let rollback_note = rollback_supported.then(|| {
        if has_compose_rollback {
            "Rollback restores backed up Compose YAML or removes Dokuru override files, then recreates services".to_string()
        } else {
            "Rollback restores previous cgroup resource limits".to_string()
        }
    });
    let entry = FixHistoryEntry {
        id: Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        request,
        outcome,
        rollback_supported,
        rollback_targets,
        compose_rollback_targets,
        progress_events,
        rollback_note,
    };

    if FIX_HISTORY.read().await.is_empty() {
        let persisted = read_persisted_fix_history().await;
        if !persisted.is_empty() {
            let mut history = FIX_HISTORY.write().await;
            if history.is_empty() {
                *history = persisted;
            }
        }
    }

    let history = {
        let mut history = FIX_HISTORY.write().await;
        history.insert(0, entry.clone());
        history.truncate(50);
        history.clone()
    };
    write_persisted_fix_history(&history).await;
    entry
}

pub async fn list_fix_history() -> Vec<FixHistoryEntry> {
    fix_history_snapshot().await
}

pub async fn rollback_fix(docker: &Docker, request: &RollbackRequest) -> eyre::Result<FixOutcome> {
    let entry = {
        let history = fix_history_snapshot().await;
        history
            .iter()
            .find(|entry| entry.id == request.history_id)
            .cloned()
    };
    let Some(entry) = entry else {
        return Ok(blocked("rollback", "Fix history entry not found"));
    };

    if !entry.rollback_supported
        || (entry.rollback_targets.is_empty() && entry.compose_rollback_targets.is_empty())
    {
        return Ok(blocked(
            &entry.request.rule_id,
            "Rollback is only supported when previous cgroup limits or Compose backups were captured",
        ));
    }

    let mut restored = Vec::new();
    let mut failed = Vec::new();

    rollback_compose_targets(&entry.compose_rollback_targets, &mut restored, &mut failed).await;

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

    let mut message = format!("Rolled back {} target(s)", restored.len());
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

async fn rollback_compose_targets(
    targets: &[ComposeRollbackTarget],
    restored: &mut Vec<String>,
    failed: &mut Vec<String>,
) {
    let mut seen = HashSet::<String>::new();

    for target in targets {
        let key = format!(
            "{}:{}:{}",
            target.project, target.service, target.compose_path
        );
        if !seen.insert(key) {
            continue;
        }

        let label = format!("{}:{} (compose)", target.project, target.service);
        let compose_path = PathBuf::from(&target.compose_path);
        if let Some(backup_path) = target.backup_path.as_ref().map(PathBuf::from) {
            if tokio::fs::metadata(&backup_path).await.is_err() {
                failed.push(format!(
                    "{label}: backup file missing: {}",
                    backup_path.display()
                ));
                continue;
            }

            if let Err(error) = tokio::fs::copy(&backup_path, &compose_path).await {
                failed.push(format!(
                    "{label}: failed to restore {} from {}: {error}",
                    compose_path.display(),
                    backup_path.display()
                ));
                continue;
            }
        } else if target.delete_on_rollback {
            if let Err(error) = tokio::fs::remove_file(&compose_path).await
                && error.kind() != std::io::ErrorKind::NotFound
            {
                failed.push(format!(
                    "{label}: failed to remove {}: {error}",
                    compose_path.display()
                ));
                continue;
            }
        } else {
            failed.push(format!("{label}: compose rollback action was not captured"));
            continue;
        }

        let ctx = ComposeContext {
            project: target.project.clone(),
            service: target.service.clone(),
            working_dir: target.working_dir.as_ref().map(PathBuf::from),
            config_files: target.config_files.clone(),
        };
        let compose_paths = resolve_compose_files(&ctx)
            .await
            .unwrap_or_else(|_| vec![compose_path.clone()]);

        match run_compose_up_capture(&ctx, &compose_paths).await {
            Ok(_) => restored.push(label),
            Err(error) => failed.push(format!(
                "{label}: restored {} but docker compose up failed: {error}",
                compose_path.display()
            )),
        }
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
    fn parse_vgs_output_accepts_comma_and_decimal_bytes() {
        let groups = parse_vgs_output("  vg0,<21474836480.00\nvg1,1073741824\n");

        assert_eq!(
            groups,
            vec![
                LvmVolumeGroup {
                    name: "vg0".to_string(),
                    free_bytes: 21_474_836_480,
                },
                LvmVolumeGroup {
                    name: "vg1".to_string(),
                    free_bytes: 1_073_741_824,
                },
            ]
        );
    }

    #[test]
    fn select_lvm_volume_group_rejects_ambiguous_targets() {
        let groups = vec![
            LvmVolumeGroup {
                name: "fast".to_string(),
                free_bytes: 20 * 1024 * 1024 * 1024,
            },
            LvmVolumeGroup {
                name: "bulk".to_string(),
                free_bytes: 30 * 1024 * 1024 * 1024,
            },
        ];

        let error = select_lvm_volume_group(&groups, 10 * 1024 * 1024 * 1024).unwrap_err();

        assert!(error.contains("Multiple LVM volume groups"));
    }

    #[test]
    fn planned_docker_root_lv_size_uses_minimum_and_headroom() {
        assert_eq!(planned_docker_root_lv_size(0), MIN_DOCKER_ROOT_LV_BYTES);
        assert_eq!(
            planned_docker_root_lv_size(50 * 1024 * 1024 * 1024),
            60 * 1024 * 1024 * 1024
        );
    }

    #[test]
    fn mount_entry_for_path_requires_exact_mount_point() {
        let mounts = "/dev/root / ext4 rw 0 0\n/dev/vg/docker /var/lib/docker ext4 rw 0 0\n";

        assert_eq!(
            mount_entry_for_path(mounts, "/var/lib/docker"),
            Some("/dev/vg/docker /var/lib/docker ext4 rw 0 0".to_string())
        );
        assert_eq!(mount_entry_for_path(mounts, "/var/lib"), None);
    }

    #[test]
    fn fstab_has_mountpoint_handles_escaped_spaces() {
        let fstab = "# comment\nUUID=abc /var/lib/docker ext4 defaults 0 2\nUUID=def /mnt/docker\\040data ext4 defaults 0 2\n";

        assert!(fstab_has_mountpoint(fstab, "/var/lib/docker"));
        assert!(fstab_has_mountpoint(fstab, "/mnt/docker data"));
        assert!(!fstab_has_mountpoint(fstab, "/var/lib/containerd"));
    }

    #[test]
    fn update_compose_content_removes_namespace_setting_without_reformatting() {
        let input = r#"services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"

  web:
    image: nginx
    pid: host
    ports:
      - "8080:80"

volumes:
  caddy-data:
"#;
        let expected = r#"services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"

  web:
    image: nginx
    ports:
      - "8080:80"

volumes:
  caddy-data:
"#;

        let updated = update_compose_content(input, "web", "5.16", None)
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_disables_privileged_service() {
        let input = r#"services:
  worker:
    image: alpine
    privileged: true
"#;
        let expected = r#"services:
  worker:
    image: alpine
    privileged: false
"#;

        let updated = update_compose_content(input, "worker", "5.5", None)
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_sets_non_root_user() {
        let input = r#"services:
  web:
    image: nginx
    user: root
    ports:
      - "8080:80"
"#;
        let expected = r#"services:
  web:
    image: nginx
    user: "1000:1000"
    ports:
      - "8080:80"
"#;

        let updated = update_compose_content(input, "web", "4.1", None)
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_adds_healthcheck_block() {
        let input = r#"services:
  api:
    image: node:20-alpine
    environment:
      NODE_ENV: production
"#;
        let expected = r#"services:
  api:
    image: node:20-alpine
    environment:
      NODE_ENV: production
    healthcheck:
      test: ["CMD-SHELL", "test -e /proc/1/stat || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
"#;

        let updated = update_compose_content(input, "api", "4.6", None)
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn dockerfile_source_detects_compose_build_mapping() {
        let input = r#"services:
  api:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
"#;

        let source = dockerfile_source_from_compose_content(
            input,
            "api",
            Path::new("/srv/project/compose.yml"),
        )
        .unwrap()
        .unwrap();

        assert_eq!(source.context, PathBuf::from("/srv/project/app"));
        assert_eq!(
            source.path,
            PathBuf::from("/srv/project/app/Dockerfile.prod")
        );
    }

    #[test]
    fn dockerfile_source_detects_compose_build_string() {
        let input = r#"services:
  web:
    build: ./web
"#;

        let source = dockerfile_source_from_compose_content(
            input,
            "web",
            Path::new("/srv/project/docker-compose.yml"),
        )
        .unwrap()
        .unwrap();

        assert_eq!(source.context, PathBuf::from("/srv/project/web"));
        assert_eq!(source.path, PathBuf::from("/srv/project/web/Dockerfile"));
    }

    #[test]
    fn dockerfile_update_sets_non_root_user() {
        let input = "FROM alpine\nRUN adduser -D app\nUSER root\n";
        let expected = "FROM alpine\nRUN adduser -D app\nUSER 1000:1000\n";

        let updated = update_dockerfile_content(input, "4.1").unwrap().unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn dockerfile_update_adds_healthcheck() {
        let input = "FROM alpine\nCMD [\"sleep\", \"infinity\"]\n";
        let expected = "FROM alpine\nCMD [\"sleep\", \"infinity\"]\nHEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD test -e /proc/1/stat || exit 1\n";

        let updated = update_dockerfile_content(input, "4.6").unwrap().unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_sets_cgroup_limits_without_reformatting() {
        let input = r#"services:
  web:
    image: nginx
    environment:
      NODE_ENV: production

  api:
    image: node:20-alpine
"#;
        let expected = r#"services:
  web:
    image: nginx
    environment:
      NODE_ENV: production
    mem_limit: 512m
    cpu_shares: 1024
    pids_limit: 200

  api:
    image: node:20-alpine
"#;
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: Some(1024),
            pids_limit: Some(200),
            strategy: Some("compose_update".to_string()),
        };

        let updated = update_compose_content(input, "web", "cgroup_all", Some(&target))
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_returns_none_when_values_match() {
        let input = r#"services:
  web:
    image: nginx
    mem_limit: 512m
"#;
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: None,
            pids_limit: None,
            strategy: Some("compose_update".to_string()),
        };

        let updated = update_compose_content(input, "web", "5.11", Some(&target)).unwrap();

        assert!(updated.is_none());
    }

    #[test]
    fn update_compose_content_covers_all_namespace_rules() {
        let cases = [
            ("5.10", "network_mode"),
            ("5.16", "pid"),
            ("5.17", "ipc"),
            ("5.21", "uts"),
        ];

        for (rule_id, key) in cases {
            let input = format!(
                "services:\n  web:\n    image: nginx\n    {key}: host\n    ports:\n      - \"8080:80\"\n"
            );
            let expected = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n";

            let updated = update_compose_content(&input, "web", rule_id, None)
                .unwrap()
                .unwrap();

            assert_eq!(updated, expected, "rule {rule_id} should remove {key}");
        }
    }

    #[test]
    fn update_compose_content_removes_both_userns_keys_for_rule_531() {
        let input = r#"services:
  web:
    image: nginx
    userns_mode: host
    userns: host
    ports:
      - "8080:80"
"#;
        let expected = r#"services:
  web:
    image: nginx
    ports:
      - "8080:80"
"#;

        let updated = update_compose_content(input, "web", "5.31", None)
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn update_compose_content_covers_each_cgroup_rule() {
        let cases = [
            ("5.11", "mem_limit", "512m"),
            ("5.12", "cpu_shares", "1024"),
            ("5.29", "pids_limit", "200"),
        ];
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: Some(1024),
            pids_limit: Some(200),
            strategy: Some("compose_update".to_string()),
        };

        for (rule_id, key, value) in cases {
            let input = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n";
            let expected = format!(
                "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n    {key}: {value}\n"
            );

            let updated = update_compose_content(input, "web", rule_id, Some(&target))
                .unwrap()
                .unwrap();

            assert_eq!(updated, expected, "rule {rule_id} should set {key}");
        }
    }

    #[test]
    fn update_compose_content_replaces_existing_cgroup_value_only() {
        let input = r#"services:
  web:
    image: nginx
    mem_limit: 128m
    cpu_shares: 256
    pids_limit: 50
    command:
      - sh
      - -c
      - echo ok
"#;
        let expected = r#"services:
  web:
    image: nginx
    mem_limit: 512m
    cpu_shares: 1024
    pids_limit: 200
    command:
      - sh
      - -c
      - echo ok
"#;
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: Some(1024),
            pids_limit: Some(200),
            strategy: Some("compose_update".to_string()),
        };

        let updated = update_compose_content(input, "web", "cgroup_all", Some(&target))
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn dokuru_override_mode_renders_separate_override_yaml() {
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: Some(1024),
            pids_limit: Some(200),
            strategy: Some(STRATEGY_DOKURU_OVERRIDE.to_string()),
        };
        let expected = r#"# Managed by Dokuru. Keep this file after the base compose files.

services:
  web:
    mem_limit: 512m
    cpu_shares: 1024
    pids_limit: 200
"#;

        let rendered =
            upsert_dokuru_override_content(None, "web", "cgroup_all", Some(&target)).unwrap();

        assert_eq!(rendered, expected);
    }

    #[test]
    fn dokuru_override_mode_can_reset_namespace_values() {
        let cases = [("5.16", "pid"), ("5.21", "uts")];

        for (rule_id, key) in cases {
            let expected = format!(
                "# Managed by Dokuru. Keep this file after the base compose files.\n\nservices:\n  web:\n    {key}: !reset null\n"
            );

            let rendered = upsert_dokuru_override_content(None, "web", rule_id, None).unwrap();

            assert_eq!(rendered, expected, "rule {rule_id} should reset {key}");
        }
    }

    #[test]
    fn compose_override_filename_matches_base_compose_name() {
        assert_eq!(
            compose_override_filename(Some(Path::new("/srv/app/docker-compose.yaml"))),
            "docker-compose.override.yaml"
        );
        assert_eq!(
            compose_override_filename(Some(Path::new("/srv/app/compose.yml"))),
            "compose.override.yml"
        );
    }

    #[test]
    fn patch_source_mode_edits_compose_yaml() {
        let input = "services:\n  web:\n    image: nginx\n";
        let expected = "services:\n  web:\n    image: nginx\n    mem_limit: 512m\n";
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: None,
            pids_limit: None,
            strategy: Some(STRATEGY_COMPOSE_UPDATE.to_string()),
        };

        let updated = update_compose_content(input, "web", "5.11", Some(&target))
            .unwrap()
            .unwrap();

        assert_eq!(updated, expected);
    }

    #[test]
    fn live_only_mode_builds_docker_update_command() {
        let target = FixTarget {
            container_id: "abc".to_string(),
            memory: Some(512 * 1024 * 1024),
            cpu_shares: Some(1024),
            pids_limit: Some(200),
            strategy: Some(STRATEGY_DOCKER_UPDATE.to_string()),
        };

        let command = docker_update_command("5.25", &target, "web-1");

        assert_eq!(
            command,
            "docker update --memory=512m --memory-swap=-1 --cpu-shares=1024 --pids-limit=200 web-1"
        );
    }

    #[tokio::test]
    async fn resolve_compose_files_supports_standard_docker_compose_names() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "dokuru-compose-names-{}-{nanos}",
            std::process::id()
        ));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let yaml_path = dir.join("docker-compose.yaml");
        let yml_path = dir.join("docker-compose.yml");
        tokio::fs::write(&yaml_path, "services:\n  web:\n    image: nginx\n")
            .await
            .unwrap();
        tokio::fs::write(&yml_path, "services:\n  worker:\n    image: busybox\n")
            .await
            .unwrap();

        let ctx = ComposeContext {
            project: "dokuru-lab".to_string(),
            service: "web".to_string(),
            working_dir: Some(dir.clone()),
            config_files: None,
        };

        let files = resolve_compose_files(&ctx).await.unwrap();

        assert!(files.contains(&yaml_path));
        assert!(files.contains(&yml_path));

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[test]
    fn update_compose_content_rejects_invalid_yaml_before_patching() {
        let input = "services:\n  web:\n    image: [nginx\n";

        let error = update_compose_content(input, "web", "5.16", None).unwrap_err();

        assert!(error.to_string().contains("compose YAML parse failed"));
    }

    #[test]
    fn update_compose_content_rejects_non_mapping_service() {
        let input = "services:\n  web: nginx\n";

        let error = update_compose_content(input, "web", "5.16", None).unwrap_err();

        assert!(error.to_string().contains("not found or is not a mapping"));
    }
}
