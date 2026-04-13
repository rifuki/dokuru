use crate::types::*;
use bollard::Docker;
use std::fs;
use serde_json::Value;

pub struct Fixer {
    docker: Docker,
}

impl Fixer {
    pub fn new(docker: Docker) -> Self {
        Self { docker }
    }

    pub async fn apply_fix(&self, rule_id: &str) -> anyhow::Result<String> {
        let rule = crate::rules::get_rule_by_id(rule_id).ok_or_else(|| anyhow::anyhow!("Rule not found"))?;

        if rule_id == "2.10" {
            // Apply fix for userns-remap in daemon.json
            self.fix_daemon_json("userns-remap", "default").await?;
            return Ok("Added userns-remap to /etc/docker/daemon.json. Please restart the Docker daemon (sudo systemctl restart docker).".to_string());
        }

        if rule_id.starts_with("5.") {
            return Ok(format!("Fixing container rule {} involves recreating the container with proper flags. Instructions:\n{}", rule_id, rule.remediation));
        }

        Ok(format!("Manual fix required: {}", rule.remediation))
    }

    async fn fix_daemon_json(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let path = "/etc/docker/daemon.json";
        
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
}
