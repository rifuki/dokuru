use bollard::Docker;
use chrono::Utc;
use serde_json::Value;
use std::{fs, path::Path};

use crate::rules::{get_all_rules, get_rule_by_id};
use crate::types::*;

pub struct Checker {
    docker: Docker,
}

impl Checker {
    pub fn new(docker: Docker) -> Self {
        Self { docker }
    }

    pub async fn run_audit(&self) -> eyre::Result<AuditReport> {
        let rules = get_all_rules();
        let mut results = Vec::new();

        let info = self.docker.info().await?;
        let version = self.docker.version().await?;
        let containers = self.docker.list_containers::<String>(None).await?;
        let total_containers = containers.len();

        for rule in rules {
            let result = self.check_rule(&rule, &containers).await?;
            results.push(result);
        }

        let passed = results
            .iter()
            .filter(|r| r.status == CheckStatus::Pass)
            .count();
        let failed = results
            .iter()
            .filter(|r| r.status == CheckStatus::Fail)
            .count();

        let score = if results.is_empty() {
            0
        } else {
            ((passed as f64 / results.len() as f64) * 100.0) as u8
        };

        Ok(AuditReport {
            timestamp: Utc::now().to_rfc3339(),
            hostname: info.name.unwrap_or_else(|| "unknown".to_string()),
            docker_version: version.version.unwrap_or_else(|| "unknown".to_string()),
            total_containers,
            results,
            score,
            passed,
            failed,
        })
    }

    pub async fn check_single_rule(&self, rule_id: &str) -> eyre::Result<CheckResult> {
        let rule = get_rule_by_id(rule_id).ok_or_else(|| eyre::eyre!("Rule not found"))?;
        let containers = self.docker.list_containers::<String>(None).await?;
        self.check_rule(&rule, &containers).await
    }

    async fn check_rule(
        &self,
        rule: &CisRule,
        containers: &[bollard::models::ContainerSummary],
    ) -> eyre::Result<CheckResult> {
        match rule.id.as_str() {
            "2.10" => self.check_2_10(rule).await,
            "2.11" => self.check_2_11(rule).await,
            "5.10" => {
                self.check_container_rule(rule, containers, |config| {
                    config.network_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.16" => {
                self.check_container_rule(rule, containers, |config| {
                    config.pid_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.17" => {
                self.check_container_rule(rule, containers, |config| {
                    config.ipc_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.21" => {
                self.check_container_rule(rule, containers, |config| {
                    config.uts_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.31" => {
                self.check_container_rule(rule, containers, |config| {
                    config.userns_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.11" => {
                self.check_container_rule(rule, containers, |config| config.memory.unwrap_or(0) > 0)
                    .await
            }
            "5.12" => {
                self.check_container_rule(rule, containers, |config| {
                    let shares = config.cpu_shares.unwrap_or(0);
                    shares != 0 && shares != 1024
                })
                .await
            }
            "5.25" => {
                self.check_container_rule(rule, containers, |config| {
                    !config.privileged.unwrap_or(false)
                })
                .await
            }
            "5.26" => {
                self.check_container_rule(rule, containers, |config| {
                    config.security_opt.as_ref().is_some_and(|opts| {
                        opts.iter().any(|opt| {
                            opt == "no-new-privileges" || opt == "no-new-privileges=true"
                        })
                    })
                })
                .await
            }
            "5.29" => {
                self.check_container_rule(rule, containers, |config| {
                    config.pids_limit.unwrap_or(0) > 0
                })
                .await
            }
            _ => Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: "Unimplemented rule check".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            }),
        }
    }

    async fn check_2_10(&self, rule: &CisRule) -> eyre::Result<CheckResult> {
        let info = self.docker.info().await?;
        let security_options = info.security_options.unwrap_or_default();
        let passed = security_options
            .iter()
            .any(|opt| opt.contains("name=userns"));

        let audit_command = "docker info --format '{{json .SecurityOptions}}'".to_string();
        let raw_output = serde_json::to_string_pretty(&security_options).unwrap_or_default();

        if passed {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Pass,
                message: "userns-remap is configured properly".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Auto,
                audit_command: Some(audit_command),
                raw_output: Some(raw_output),
            })
        } else {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Fail,
                message: "userns-remap is NOT configured".to_string(),
                affected: vec!["daemon.json".to_string()],
                remediation_kind: RemediationKind::Auto,
                audit_command: Some(audit_command),
                raw_output: Some(raw_output),
            })
        }
    }

    async fn check_2_11(&self, rule: &CisRule) -> eyre::Result<CheckResult> {
        let daemon_config = Self::load_daemon_json()?;
        let cgroup_parent = daemon_config
            .as_ref()
            .and_then(|config| config.get("cgroup-parent"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());

        let audit_command = "cat /etc/docker/daemon.json | jq '.\"cgroup-parent\"'".to_string();
        let raw_output = daemon_config
            .as_ref()
            .and_then(|config| serde_json::to_string_pretty(config).ok())
            .unwrap_or_else(|| "{}".to_string());

        let (status, message, affected) = match cgroup_parent {
            Some(value) => (
                CheckStatus::Fail,
                format!(
                    "Custom cgroup-parent is configured ('{value}'). Review whether this override is intentional and safe."
                ),
                vec!["daemon.json".to_string()],
            ),
            None => (
                CheckStatus::Pass,
                "Default cgroup-parent is in use (no custom cgroup-parent configured).".to_string(),
                vec![],
            ),
        };

        Ok(CheckResult {
            rule: rule.clone(),
            status,
            message,
            affected,
            remediation_kind: RemediationKind::Guided,
            audit_command: Some(audit_command),
            raw_output: Some(raw_output),
        })
    }

    async fn check_container_rule<F>(
        &self,
        rule: &CisRule,
        containers: &[bollard::models::ContainerSummary],
        check_fn: F,
    ) -> eyre::Result<CheckResult>
    where
        F: Fn(&bollard::models::HostConfig) -> bool,
    {
        let mut affected = Vec::new();
        let mut inspected_configs = Vec::new();

        for container in containers {
            if let Some(id) = &container.id
                && let Ok(details) = self.docker.inspect_container(id, None).await
                && let Some(host_config) = details.host_config.clone()
            {
                let name = details
                    .name
                    .clone()
                    .unwrap_or_else(|| String::from("unknown"));
                inspected_configs.push((name.clone(), host_config.clone()));

                if !check_fn(&host_config) {
                    affected.push(name.trim_start_matches('/').to_string());
                }
            }
        }

        let audit_command =
            "docker inspect $(docker ps -q) --format '{{json .HostConfig}}'".to_string();
        let raw_output = serde_json::to_string_pretty(&inspected_configs).unwrap_or_default();

        let passed = affected.is_empty();
        Ok(CheckResult {
            rule: rule.clone(),
            status: if passed {
                CheckStatus::Pass
            } else {
                CheckStatus::Fail
            },
            message: if passed {
                "All containers compliant".to_string()
            } else {
                format!("{} container(s) non-compliant", affected.len())
            },
            affected,
            remediation_kind: RemediationKind::Guided,
            audit_command: Some(audit_command),
            raw_output: Some(raw_output),
        })
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
}
