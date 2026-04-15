// Section 2: Daemon Configuration
// CIS Docker Benchmark v1.8.0

use super::section_trait::CheckSection;
use super::super::types::*;
use async_trait::async_trait;
use bollard::Docker;
use eyre::Result;

pub struct Section2;

#[async_trait]
impl CheckSection for Section2 {
    fn section_id(&self) -> &str {
        "2"
    }

    async fn check(
        &self,
        rule: &CisRule,
        docker: &Docker,
        _containers: &[bollard::models::ContainerSummary],
    ) -> Result<CheckResult> {
        match rule.id.as_str() {
            "2.10" => self.check_2_10(rule, docker).await,
            "2.11" => self.check_2_11(rule, docker).await,
            _ => Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: format!("Unknown rule: {}", rule.id),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            }),
        }
    }

    async fn fix(&self, rule_id: &str, docker: &Docker) -> Result<FixOutcome> {
        match rule_id {
            "2.10" => self.fix_2_10(docker).await,
            _ => Ok(FixOutcome {
                rule_id: rule_id.to_string(),
                status: FixStatus::Blocked,
                message: format!("No automated fix for {}", rule_id),
                requires_restart: false,
                restart_command: None,
                requires_elevation: false,
            }),
        }
    }
}

impl Section2 {
    async fn check_2_10(&self, rule: &CisRule, docker: &Docker) -> Result<CheckResult> {
        let info = docker.info().await?;
        let userns_enabled = info
            .security_options
            .as_ref()
            .and_then(|opts| opts.iter().find(|s| s.starts_with("name=userns")))
            .is_some();

        if userns_enabled {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Pass,
                message: "User namespace support is enabled.".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Auto,
                audit_command: Some("docker info --format '{{ .SecurityOptions }}'".to_string()),
                raw_output: Some(format!("{:?}", info.security_options)),
            })
        } else {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Fail,
                message: "User namespace support is not enabled.".to_string(),
                affected: vec!["Docker daemon".to_string()],
                remediation_kind: RemediationKind::Auto,
                audit_command: Some("docker info --format '{{ .SecurityOptions }}'".to_string()),
                raw_output: Some(format!("{:?}", info.security_options)),
            })
        }
    }

    pub async fn check_2_11(&self, rule: &CisRule, docker: &Docker) -> Result<CheckResult> {
        let info = docker.info().await?;
        let cgroup_v2 = info
            .cgroup_version
            .as_ref()
            .map(|v| format!("{:?}", v).contains("V2"))
            .unwrap_or(false);

        let raw_output = info.cgroup_version.as_ref().map(|v| format!("{:?}", v));

        if cgroup_v2 {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Pass,
                message: "cgroup v2 is in use.".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: Some("docker info --format '{{ .CgroupVersion }}'".to_string()),
                raw_output,
            })
        } else {
            Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Fail,
                message: "cgroup v2 is not in use.".to_string(),
                affected: vec!["Docker daemon".to_string()],
                remediation_kind: RemediationKind::Manual,
                audit_command: Some("docker info --format '{{ .CgroupVersion }}'".to_string()),
                raw_output,
            })
        }
    }

    async fn fix_2_10(&self, _docker: &Docker) -> Result<FixOutcome> {
        // Fix: Enable user namespace in daemon.json
        Ok(FixOutcome {
            rule_id: "2.10".to_string(),
            status: FixStatus::Guided,
            message: "Add 'userns-remap: default' to /etc/docker/daemon.json".to_string(),
            requires_restart: true,
            restart_command: Some("systemctl restart docker".to_string()),
            requires_elevation: true,
        })
    }
}