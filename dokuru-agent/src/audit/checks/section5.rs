// Section 5: Container Runtime
// CIS Docker Benchmark v1.8.0

use bollard::Docker;
use super::super::types::*;
use super::section3::SENSITIVE_HOST_DIRS;
use eyre::Result;

pub struct Section5Checker<'a> {
    docker: &'a Docker,
}

impl<'a> Section5Checker<'a> {
    pub fn new(docker: &'a Docker) -> Self {
        Self { docker }
    }

    pub async fn check_container_rule<F>(
        &self,
        rule: &CisRule,
        containers: &[bollard::models::ContainerSummary],
        predicate: F,
    ) -> Result<CheckResult>
    where
        F: Fn(&bollard::models::HostConfig) -> bool,
    {
        let mut failed_containers = Vec::new();

        for container in containers {
            let id = container.id.as_deref().unwrap_or("unknown");
            let inspect = self.docker.inspect_container(id, None).await?;

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
