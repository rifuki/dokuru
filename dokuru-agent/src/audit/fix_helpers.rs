/// Shared helpers for `fix_fn` implementations
use crate::audit::types::{FixOutcome, FixStatus};
use tokio::process::Command;

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

/// Merge a key into /etc/docker/daemon.json, creating the file if needed.
/// value must be a valid JSON value string, e.g. `"\"default\""` or `"true"`.
pub fn merge_daemon_json(key: &str, value: serde_json::Value) -> eyre::Result<()> {
    let path = "/etc/docker/daemon.json";
    let mut obj: serde_json::Map<String, serde_json::Value> =
        if std::path::Path::new(path).exists() {
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
