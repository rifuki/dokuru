// Section 5: Container Runtime
// CIS Docker Benchmark v1.8.0

use super::super::types::*;
use super::section3::SENSITIVE_HOST_DIRS;
use super::section_trait::CheckSection;
use async_trait::async_trait;
use bollard::Docker;
use eyre::Result;

pub struct Section5;

#[async_trait]
impl CheckSection for Section5 {
    fn section_id(&self) -> &str {
        "5"
    }

    fn handles(&self, rule_id: &str) -> bool {
        rule_id.starts_with("5.")
    }

    async fn check(
        &self,
        rule: &CisRule,
        docker: &Docker,
        containers: &[bollard::models::ContainerSummary],
    ) -> Result<CheckResult> {
        // Delegate to check_container_rule with appropriate predicate
        match rule.id.as_str() {
            "5.1" => self.check_container_rule(rule, docker, containers, |hc| {
                hc.security_opt.as_ref().is_some_and(|opts| {
                    opts.iter().any(|opt| opt.starts_with("apparmor=") && opt != "apparmor=unconfined")
                })
            }).await,
            _ => Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: format!("Rule {} not yet implemented", rule.id),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            }),
        }
    }
}

impl Section5 {
    async fn check_container_rule<F>(
        &self,
        rule: &CisRule,
        docker: &Docker,
        containers: &[bollard::models::ContainerSummary],
        predicate: F,
    ) -> Result<CheckResult>
    where
        F: Fn(&bollard::models::HostConfig) -> bool,
    {
        let mut failed_containers = Vec::new();

        for container in containers {
            let id = container.id.as_deref().unwrap_or("unknown");
            let inspect = docker.inspect_container(id, None).await?;

            if let Some(host_config) = inspect.host_config {
                if !predicate(&host_config) {
                    let name = container
                        .names
                        .as_ref()
                        .and_then(|n| n.first())
                        .map(|s| s.trim_start_matches('/'))
                        .unwrap_or(id);
                    failed_containers.push(name.to_string());
                }
            }
        }

        if failed_containers.is_empty() {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Pass,
                message: format!("All {} containers comply.", containers.len()),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: Some("docker inspect <container>".to_string()),
                raw_output: None,
            })
        } else {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Fail,
                message: format!("{} container(s) do not comply.", failed_containers.len()),
                affected: failed_containers,
                remediation_kind: RemediationKind::Manual,
                audit_command: Some("docker inspect <container>".to_string()),
                raw_output: None,
            })
        }
    }
}
