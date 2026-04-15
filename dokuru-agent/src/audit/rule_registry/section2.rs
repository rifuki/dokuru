// Section 2: Docker Daemon Configuration
use super::RuleDefinition;
use crate::audit::types::*;

/// Section 2: Docker Daemon Configuration
/// CIS Docker Benchmark v1.8.0
pub struct Section2;

impl Section2 {
    /// Get all rules in this section
    pub fn rules() -> Vec<RuleDefinition> {
        vec![
            Self::rule_2_10(),
            Self::rule_2_11(),
            // Add more rules here - easy to see what's missing!
        ]
    }

    /// 2.10 - Ensure that user namespace support is enabled
    fn rule_2_10() -> RuleDefinition {
        RuleDefinition {
            id: "2.10".into(),
            section: 2,
            title: "Ensure that user namespace support is enabled".into(),
            description: "User namespaces remap container root user to non-privileged host user, providing strong isolation between containers and host.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,

            audit_command: Some("docker info --format '{{ .SecurityOptions }}'".into()),
            check_fn: |docker, _containers| {
                let docker = docker.clone();
                Box::pin(async move {
                    let info = docker.info().await?;
                    let enabled = info
                        .security_options
                        .as_ref()
                        .is_some_and(|opts| opts.iter().any(|opt| opt.contains("userns")));

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "2.10".into(),
                            title: "Ensure that user namespace support is enabled".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Daemon Configuration".into(),
                            description: "User namespace support".into(),
                            remediation: "Enable userns-remap in daemon.json".into(),
                        },
                        status: if enabled { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if enabled {
                            "User namespace is enabled".into()
                        } else {
                            "User namespace is not enabled".into()
                        },
                        affected: if enabled { vec![] } else { vec!["Docker daemon".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("docker info --format '{{ .SecurityOptions }}'".into()),
                        raw_output: info.security_options.map(|opts| opts.join(", ")),
                    })
                })
            },

            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: r#"1. Edit /etc/docker/daemon.json:
   {
     "userns-remap": "default"
   }

2. Restart Docker daemon:
   sudo systemctl restart docker

3. Verify:
   docker info | grep userns"#
                .into(),
            requires_restart: true,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/engine/security/userns-remap/".into(),
                "CIS Docker Benchmark v1.8.0, Section 2.10".into(),
            ],
            rationale: "Without user namespace remapping, container processes run as root on the host, increasing attack surface if container is compromised.".into(),
            impact: "Existing containers will need to be recreated. Volume permissions may need adjustment.".into(),
            tags: vec!["security".into(), "namespace".into(), "isolation".into()],
        }
    }

    /// 2.11 - Ensure that cgroup usage is confirmed
    fn rule_2_11() -> RuleDefinition {
        RuleDefinition {
            id: "2.11".into(),
            section: 2,
            title: "Ensure that cgroup usage is confirmed".into(),
            description: "Cgroup v2 provides better resource management and security isolation."
                .into(),

            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some("docker info --format '{{ .CgroupVersion }}'".into()),
            check_fn: |docker, _containers| {
                let docker = docker.clone();
                Box::pin(async move {
                    let info = docker.info().await?;
                    let cgroup_v2 = info
                        .cgroup_version
                        .as_ref()
                        .map(|v| format!("{:?}", v).contains("V2"))
                        .unwrap_or(false);

                    let raw_output = info.cgroup_version.as_ref().map(|v| format!("{:?}", v));

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "2.11".into(),
                            title: "Ensure that cgroup usage is confirmed".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::Medium,
                            section: "Daemon Configuration".into(),
                            description: "Cgroup v2 usage".into(),
                            remediation: "Upgrade to cgroup v2".into(),
                        },
                        status: if cgroup_v2 {
                            CheckStatus::Pass
                        } else {
                            CheckStatus::Fail
                        },
                        message: if cgroup_v2 {
                            "cgroup v2 is in use".into()
                        } else {
                            "cgroup v2 is not in use".into()
                        },
                        affected: if cgroup_v2 {
                            vec![]
                        } else {
                            vec!["Docker daemon".into()]
                        },
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("docker info --format '{{ .CgroupVersion }}'".into()),
                        raw_output,
                    })
                })
            },

            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide:
                "Upgrade to a Linux distribution with cgroup v2 support (kernel 5.2+)".into(),
            requires_restart: true,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/config/containers/runmetrics/".into(),
                "CIS Docker Benchmark v1.8.0, Section 2.11".into(),
            ],
            rationale: "Cgroup v2 provides unified hierarchy and better resource control.".into(),
            impact: "Requires kernel upgrade if not already on cgroup v2.".into(),
            tags: vec!["cgroup".into(), "resource-management".into()],
        }
    }
}
