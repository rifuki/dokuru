// Section 2: Docker Daemon Configuration
use super::RuleDefinition;
use crate::audit::{
    fix_helpers,
    types::{CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity},
};

const RULE_2_10_GUIDE: &str = r#"STEP 1: Create sub-UID and sub-GID mappings
   sudo touch /etc/subuid /etc/subgid
   sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 dockremap

STEP 2: Edit /etc/docker/daemon.json:
   {
     "userns-remap": "default"
   }

STEP 3: Restart Docker daemon:
   sudo systemctl restart docker

STEP 4: Verify configuration:
   docker info | grep userns
   ps -h -p $(docker inspect --format='{{ .State.Pid }}' <container>) -o pid,user

STEP 5: Recreate existing containers with new user namespace mapping

⚠️  WARNING: Existing containers will need to be recreated. Volume permissions may need adjustment."#;

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
            description: "User namespaces remap container root user to non-privileged host user, providing strong isolation between containers and host. This prevents privilege escalation attacks where a compromised container could gain root access to the host system.".into(),

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
                            description: "User namespace remapping isolates container UIDs from host UIDs".into(),
                            remediation: "Enable userns-remap in /etc/docker/daemon.json and restart Docker daemon".into(),
                        },
                        status: if enabled { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if enabled {
                            "✓ User namespace remapping is enabled - container root is mapped to unprivileged host user".into()
                        } else {
                            "✗ User namespace remapping is NOT enabled - containers run as root on host (HIGH RISK)".into()
                        },
                        affected: if enabled { vec![] } else { vec!["Docker daemon".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("docker info --format '{{ .SecurityOptions }}'".into()),
                        raw_output: info.security_options.map(|opts| opts.join(", ")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    // Step 1: Create dockremap user (ignore error if already exists)
                    let _ = fix_helpers::run_cmd("useradd", &["-r", "-s", "/bin/false", "dockremap"]).await;

                    // Step 2: Ensure /etc/subuid and /etc/subgid exist
                    let _ = fix_helpers::run_cmd("touch", &["/etc/subuid", "/etc/subgid"]).await;

                    // Step 3: Add subuid/subgid mappings for dockremap
                    let _ = fix_helpers::run_cmd(
                        "usermod",
                        &["--add-subuids", "100000-165535", "dockremap"],
                    ).await;
                    let _ = fix_helpers::run_cmd(
                        "usermod",
                        &["--add-subgids", "100000-165535", "dockremap"],
                    ).await;

                    // Step 4: Write userns-remap to daemon.json
                    match fix_helpers::merge_daemon_json(
                        "userns-remap",
                        serde_json::Value::String("default".into()),
                    ) {
                        Err(e) => Ok(fix_helpers::blocked("2.10", &format!("Failed to update daemon.json: {e}"))),
                        Ok(()) => {
                            match fix_helpers::run_cmd("systemctl", &["restart", "docker"]).await {
                                Ok((_, _, true)) => Ok(fix_helpers::applied(
                                    "2.10",
                                    "userns-remap enabled: dockremap user created, subuid/subgid mapped, Docker restarted",
                                    false,
                                )),
                                Ok((_, stderr, _)) => Ok(fix_helpers::blocked(
                                    "2.10",
                                    &format!("daemon.json updated but Docker restart failed: {stderr}"),
                                )),
                                Err(e) => Ok(fix_helpers::blocked(
                                    "2.10",
                                    &format!("daemon.json updated but restart command failed: {e}"),
                                )),
                            }
                        }
                    }
                })
            }),
            remediation_guide: RULE_2_10_GUIDE.into(),
            requires_restart: true,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/engine/security/userns-remap/".into(),
                "https://man7.org/linux/man-pages/man7/user_namespaces.7.html".into(),
                "https://www.cisecurity.org/benchmark/docker".into(),
                "CIS Docker Benchmark v1.8.0, Section 2.10".into(),
            ],
            rationale: "Without user namespace remapping, container processes run as root (UID 0) on the host. If a container is compromised, the attacker has root privileges on the host system, allowing them to escape the container, access sensitive files, and compromise other containers. User namespace remapping maps container root to an unprivileged user on the host, significantly reducing the attack surface.".into(),
            impact: "• Existing containers must be recreated\n• Volume permissions may need adjustment\n• Some Docker features may be incompatible (e.g., --pid=host, --network=host)\n• Slight performance overhead for UID/GID mapping".into(),
            tags: vec!["security".into(), "namespace".into(), "isolation".into(), "privilege-escalation".into()],
        }
    }

    /// 2.11 - Ensure the default cgroup usage has been confirmed
    fn rule_2_11() -> RuleDefinition {
        RuleDefinition {
            id: "2.11".into(),
            section: 2,
            title: "Ensure the default cgroup usage has been confirmed".into(),
            description: "Control groups (cgroups) limit and isolate resource usage (CPU, memory, disk I/O) of containers. The --cgroup-parent option allows setting a custom cgroup parent. Unless specifically required, the default cgroup should be used to ensure proper resource isolation and prevent resource exhaustion attacks."
                .into(),

            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some("grep -E 'cgroup-parent|CgroupVersion' /etc/docker/daemon.json; docker info --format '{{ .CgroupDriver }} {{ .CgroupVersion }}'".into()),
            check_fn: |docker, _containers| {
                let docker = docker.clone();
                Box::pin(async move {
                    let info = docker.info().await?;

                    // Check cgroup driver and version
                    let cgroup_driver = info.cgroup_driver.as_ref().map(std::string::ToString::to_string).unwrap_or_default();
                    let cgroup_version = info.cgroup_version.as_ref().map(|v| format!("{v:?}")).unwrap_or_default();

                    // Default cgroup is considered secure (no custom --cgroup-parent)
                    let using_default = !cgroup_driver.is_empty();
                    let raw_output = format!("Driver: {cgroup_driver}, Version: {cgroup_version}");

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "2.11".into(),
                            title: "Ensure the default cgroup usage has been confirmed".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::Medium,
                            section: "Daemon Configuration".into(),
                            description: "Cgroup configuration controls resource limits and isolation".into(),
                            remediation: "Use default cgroup configuration unless specific requirements exist".into(),
                        },
                        status: if using_default {
                            CheckStatus::Pass
                        } else {
                            CheckStatus::Fail
                        },
                        message: if using_default {
                            format!("✓ Using default cgroup configuration (Driver: {cgroup_driver}, Version: {cgroup_version})")
                        } else {
                            "✗ Custom cgroup configuration detected - verify this is intentional".into()
                        },
                        affected: if using_default {
                            vec![]
                        } else {
                            vec!["Docker daemon".into()]
                        },
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("docker info --format '{{ .CgroupDriver }} {{ .CgroupVersion }}'".into()),
                        raw_output: Some(raw_output),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: r#"OPTION 1: Keep default cgroup (Recommended)
   The default setting is secure. No action needed unless you have specific requirements.

OPTION 2: Set custom cgroup parent (Advanced)
   Only if you have specific resource management requirements:

   1. Edit /etc/docker/daemon.json:
      {
        "cgroup-parent": "/custom-cgroup"
      }

   2. Restart Docker:
      sudo systemctl restart docker

   3. Verify:
      docker info | grep -i cgroup

⚠️  NOTE: Custom cgroups should only be used with proper understanding of resource management implications."#.into(),
            requires_restart: true,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/engine/reference/commandline/dockerd/#default-cgroup-parent".into(),
                "https://docs.docker.com/config/containers/runmetrics/".into(),
                "https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html".into(),
                "CIS Docker Benchmark v1.8.0, Section 2.11".into(),
            ],
            rationale: "System administrators typically define cgroups under which containers should run. Attaching to a non-default cgroup without proper configuration can lead to uneven resource sharing, causing resource exhaustion on the host. The default cgroup provides balanced resource allocation and prevents containers from monopolizing system resources.".into(),
            impact: "• Using non-default cgroups may cause uneven resource distribution\n• Improper cgroup configuration can lead to denial of service\n• Default cgroup provides adequate isolation for most use cases".into(),
            tags: vec!["cgroup".into(), "resource-management".into(), "isolation".into()],
        }
    }
}
