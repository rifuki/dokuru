use bollard::Docker;
use serde_json::Value;
use std::{fs, io::ErrorKind, path::Path};

use super::{FixOutcome, FixStatus};

pub struct Fixer;

impl Fixer {
    pub fn new(_docker: Docker) -> Self {
        Self
    }

    pub async fn apply_fix(&self, rule_id: &str) -> eyre::Result<FixOutcome> {
        let rule =
            super::rules::get_rule_by_id(rule_id).ok_or_else(|| eyre::eyre!("Rule not found"))?;

        match rule_id {
            "2.10" => {
                match self.fix_daemon_json("userns-remap", "default").await {
                    Ok(()) => Ok(FixOutcome {
                        rule_id: rule_id.to_string(),
                        status: FixStatus::Applied,
                        message: "Added 'userns-remap': 'default' to /etc/docker/daemon.json. Restart the Docker daemon and rerun the audit to verify the change.".to_string(),
                        requires_restart: true,
                        restart_command: Some("sudo systemctl restart docker".to_string()),
                        requires_elevation: false,
                    }),
                    Err(error) if is_permission_denied(&error) => Ok(FixOutcome {
                        rule_id: rule_id.to_string(),
                        status: FixStatus::Blocked,
                        message: "Dokuru does not have permission to edit /etc/docker/daemon.json. Run the Dokuru agent as root, or install it as a privileged systemd service before applying daemon-level fixes.".to_string(),
                        requires_restart: true,
                        restart_command: Some("sudo systemctl restart docker".to_string()),
                        requires_elevation: true,
                    }),
                    Err(error) => Err(error),
                }
            }
            "2.11" => {
                let current = Self::load_daemon_json()?
                    .as_ref()
                    .and_then(|config| config.get("cgroup-parent"))
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "not set".to_string());

                Ok(FixOutcome {
                    rule_id: rule_id.to_string(),
                    status: FixStatus::Guided,
                    message: format!(
                        "Guided remediation required. Current 'cgroup-parent' value: {current}. Review whether this override is intentional. If not, remove 'cgroup-parent' from /etc/docker/daemon.json, restart Docker, then rerun the audit."
                    ),
                    requires_restart: true,
                    restart_command: Some("sudo systemctl restart docker".to_string()),
                    requires_elevation: true,
                })
            }
            "5.10" | "5.11" | "5.12" | "5.16" | "5.17" | "5.21" | "5.25" | "5.26" | "5.29" | "5.31" => {
                Ok(FixOutcome {
                    rule_id: rule_id.to_string(),
                    status: FixStatus::Guided,
                    message: self.container_fix_guidance(rule_id, &rule.remediation),
                    requires_restart: false,
                    restart_command: None,
                    requires_elevation: false,
                })
            }
            _ => Ok(FixOutcome {
                rule_id: rule_id.to_string(),
                status: FixStatus::Guided,
                message: format!("Manual fix required: {}", rule.remediation),
                requires_restart: false,
                restart_command: None,
                requires_elevation: false,
            }),
        }
    }

    async fn fix_daemon_json(&self, key: &str, value: &str) -> eyre::Result<()> {
        let path = "/etc/docker/daemon.json";
        if let Some(parent) = Path::new(path).parent() {
            fs::create_dir_all(parent)?;
        }

        let mut config: Value = if std::path::Path::new(path).exists() {
            let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
            serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        if let Some(obj) = config.as_object_mut() {
            obj.insert(key.to_string(), serde_json::json!(value));
        }

        let new_content = serde_json::to_string_pretty(&config)?;

        // This won't work correctly if we don't have root, but this tool runs as root or systemd.
        // If it fails, return error.
        fs::write(path, new_content.as_bytes())?;

        Ok(())
    }

    fn load_daemon_json() -> eyre::Result<Option<Value>> {
        let path = Path::new("/etc/docker/daemon.json");

        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(path)?;
        let config = serde_json::from_str(&content)?;

        Ok(Some(config))
    }

    fn container_fix_guidance(&self, rule_id: &str, remediation: &str) -> String {
        format!(
            "Guided remediation for rule {rule_id}. Dokuru does not rewrite running container runtime flags in-place because that is unsafe and usually requires recreating the workload. Update the Compose file, Docker run command, or deployment manifest so the container starts with the required hardening flags. Suggested action: {remediation} After redeploying the affected containers, rerun the audit to verify compliance."
        )
    }
}

fn is_permission_denied(error: &eyre::Report) -> bool {
    error
        .chain()
        .filter_map(|source| source.downcast_ref::<std::io::Error>())
        .any(|io_error| io_error.kind() == ErrorKind::PermissionDenied)
}
