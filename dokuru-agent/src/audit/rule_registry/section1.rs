// Section 1: Host Configuration
// CIS Docker Benchmark v1.8.0
use super::RuleDefinition;
use crate::audit::types::{
    CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity,
};

pub struct Section1;

impl Section1 {
    pub fn rules() -> Vec<RuleDefinition> {
        vec![
            Self::rule_1_1_1(),
            Self::rule_1_1_2(),
            Self::rule_1_1_3(),
            Self::rule_1_1_4(),
            Self::rule_1_1_5(),
            Self::rule_1_1_6(),
            Self::rule_1_1_7(),
            Self::rule_1_1_8(),
            Self::rule_1_1_9(),
            Self::rule_1_1_10(),
            Self::rule_1_1_11(),
            Self::rule_1_1_12(),
            Self::rule_1_1_14(),
            Self::rule_1_1_18(),
        ]
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Read all audit rule files and return combined content
    fn read_audit_rules() -> String {
        let mut content = String::new();

        if let Ok(s) = std::fs::read_to_string("/etc/audit/audit.rules") {
            content.push_str(&s);
        }

        if let Ok(entries) = std::fs::read_dir("/etc/audit/rules.d") {
            let mut paths: Vec<_> = entries
                .flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .is_some_and(|ext| ext == "rules")
                })
                .collect();
            paths.sort_by_key(|e| e.path());
            for entry in paths {
                if let Ok(s) = std::fs::read_to_string(entry.path()) {
                    content.push_str(&s);
                }
            }
        }

        content
    }

    /// Check if any audit rule watches the given target path
    fn check_audit_rule(target_path: &str) -> bool {
        let content = Self::read_audit_rules();
        if content.is_empty() {
            return false;
        }
        content.lines().any(|line| {
            let line = line.trim();
            !line.starts_with('#') && line.contains(target_path)
        })
    }

    // ── 1.1.1 — Separate partition ────────────────────────────────────────────

    /// 1.1.1 - Ensure a separate partition for containers has been created
    fn rule_1_1_1() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.1".into(),
            section: 1,
            title: "Ensure a separate partition for containers has been created".into(),
            description: "Docker uses /var/lib/docker as default data directory. It should be on a separate partition to prevent container/image data from filling the root filesystem.".into(),

            category: RuleCategory::Runtime,
            severity: Severity::Low,
            scored: true,

            audit_command: Some("cat /proc/mounts | grep /var/lib/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let mounts = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
                    let matching: Vec<&str> = mounts
                        .lines()
                        .filter(|l| {
                            l.split_whitespace()
                                .nth(1)
                                .is_some_and(|mp| mp == "/var/lib/docker")
                        })
                        .collect();
                    let found = !matching.is_empty();

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.1".into(),
                            title: "Ensure a separate partition for containers has been created".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Low,
                            section: "Host Configuration".into(),
                            description: "Separate partition for /var/lib/docker".into(),
                            remediation: "Create and mount a dedicated partition at /var/lib/docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found {
                            "/var/lib/docker is on a separate partition".into()
                        } else {
                            "/var/lib/docker is NOT on a separate partition".into()
                        },
                        affected: if found { vec![] } else { vec!["/var/lib/docker".into()] },
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("cat /proc/mounts | grep /var/lib/docker".into()),
                        raw_output: Some(if matching.is_empty() {
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                            "(no mount entry found)".into()
                        } else {
                            matching.join("\n")
                        }),
                    })
                })
            },

            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: r#"Create a dedicated partition for Docker data:

1. Create partition: fdisk /dev/sdX → create new partition
2. Format: mkfs.ext4 /dev/sdX1
3. Move existing data:
   systemctl stop docker
   mv /var/lib/docker /var/lib/docker.bak
   mkdir /var/lib/docker
4. Mount: mount /dev/sdX1 /var/lib/docker
5. Add to /etc/fstab for persistence
6. Restore data: mv /var/lib/docker.bak/* /var/lib/docker/
7. Start Docker: systemctl start docker"#.into(),
            requires_restart: false,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/storage/storagedriver/".into(),
                "CIS Docker Benchmark v1.8.0, Section 1.1.1".into(),
            ],
            rationale: "Docker uses /var/lib/docker for image layers, containers, and volumes. If this fills the root filesystem, the system may become unresponsive.".into(),
            impact: "Requires partitioning and potential data migration.".into(),
            tags: vec!["host".into(), "partition".into(), "filesystem".into()],
        }
    }

    // ── 1.1.2 — Docker group ─────────────────────────────────────────────────

    /// 1.1.2 - Ensure only trusted users are added to the docker group
    fn rule_1_1_2() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.2".into(),
            section: 1,
            title: "Ensure only trusted users are added to the docker group".into(),
            description: "Members of the docker group have equivalent root-level access to the system via Docker. Only trusted users should be in this group.".into(),

            category: RuleCategory::Runtime,
            severity: Severity::High,
            scored: true,

            audit_command: Some("getent group docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let group_content = std::fs::read_to_string("/etc/group").unwrap_or_default();
                    let docker_line = group_content
                        .lines()
                        .find(|l| l.starts_with("docker:"));

                    let (members, raw) = match docker_line {
                        Some(line) => {
                            let parts: Vec<&str> = line.split(':').collect();
                            let member_str = parts.get(3).copied().unwrap_or("");
                            let members: Vec<String> = member_str
                                .split(',')
                                .filter(|s| !s.is_empty())
                                .map(String::from)
                                .collect();
                            (members, line.to_string())
                        }
                        None => (vec![], "(docker group not found)".into()),
                    };

                    // We report the members; operator must verify if they're trusted
                    // Fail only if docker group doesn't exist
                    let group_exists = docker_line.is_some();

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.2".into(),
                            title: "Ensure only trusted users are added to the docker group".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::High,
                            section: "Host Configuration".into(),
                            description: "Docker group membership control".into(),
                            remediation: "Review and restrict docker group membership".into(),
                        },
                        status: if group_exists { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if !group_exists {
                            "docker group not found".into()
                        } else if members.is_empty() {
                            "docker group exists with no members".into()
                        } else {
                            format!("docker group has {} member(s): {} — verify all are trusted", members.len(), members.join(", "))
                        },
                        affected: members,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("getent group docker".into()),
                        raw_output: Some(raw),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },

            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: r#"Review docker group membership:
  cat /etc/group | grep docker

Remove untrusted users:
  sudo gpasswd -d <username> docker

Members of the docker group have root-equivalent access.
Prefer using sudo docker or rootless Docker instead."#.into(),
            requires_restart: false,
            requires_elevation: true,

            references: vec![
                "https://docs.docker.com/engine/security/#docker-daemon-attack-surface".into(),
                "CIS Docker Benchmark v1.8.0, Section 1.1.2".into(),
            ],
            rationale: "docker group membership grants equivalent root access. Unintended membership is a privilege escalation vector.".into(),
            impact: "Removing users from the docker group requires them to use sudo for Docker commands.".into(),
            tags: vec!["host".into(), "privilege".into(), "group".into()],
        }
    }

    // ── 1.1.3 — Audit: dockerd ────────────────────────────────────────────────

    fn rule_1_1_3() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.3".into(),
            section: 1,
            title: "Ensure that Docker daemon activity is audited".into(),
            description: "Audit the Docker daemon binary (/usr/bin/dockerd) for security event tracking.".into(),

            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some("auditctl -l | grep /usr/bin/dockerd".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/usr/bin/dockerd");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/usr/bin/dockerd")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.3".into(),
                            title: "Ensure that Docker daemon activity is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /usr/bin/dockerd".into(),
                            remediation: "Add auditd rule: -w /usr/bin/dockerd -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found {
                            "Audit rule found for /usr/bin/dockerd".into()
                        } else {
                            "No audit rule for /usr/bin/dockerd".into()
                        },
                        affected: if found { vec![] } else { vec!["/usr/bin/dockerd".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /usr/bin/dockerd".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },

            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: r#"Add to /etc/audit/rules.d/docker.rules:
  -w /usr/bin/dockerd -p rwxa -k docker

Then reload:
  auditctl -R /etc/audit/rules.d/docker.rules
  systemctl restart auditd"#.into(),
            requires_restart: false,
            requires_elevation: true,

            references: vec![
                "https://linux.die.net/man/8/auditctl".into(),
                "CIS Docker Benchmark v1.8.0, Section 1.1.3".into(),
            ],
            rationale: "Auditing Docker daemon binary activity allows detection of tampering with the Docker binary or unexpected execution.".into(),
            impact: "Minimal performance impact from audit logging.".into(),
            tags: vec!["audit".into(), "host".into(), "logging".into()],
        }
    }

    // ── 1.1.4 — Audit: containerd ─────────────────────────────────────────────

    fn rule_1_1_4() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.4".into(),
            section: 1,
            title: "Ensure that containerd is audited".into(),
            description: "Audit the containerd socket (/run/containerd) for security event tracking.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /run/containerd".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/run/containerd");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/run/containerd")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.4".into(),
                            title: "Ensure that containerd is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /run/containerd".into(),
                            remediation: "Add auditd rule: -w /run/containerd -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /run/containerd".into() } else { "No audit rule for /run/containerd".into() },
                        affected: if found { vec![] } else { vec!["/run/containerd".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /run/containerd".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /run/containerd -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.4".into()],
            rationale: "Auditing containerd socket activity helps detect unauthorized container runtime operations.".into(),
            impact: "Minimal performance impact from audit logging.".into(),
            tags: vec!["audit".into(), "host".into(), "containerd".into()],
        }
    }

    // ── 1.1.5 — Audit: /var/lib/docker ───────────────────────────────────────

    fn rule_1_1_5() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.5".into(),
            section: 1,
            title: "Ensure that /var/lib/docker is audited".into(),
            description: "Audit the Docker data directory (/var/lib/docker) to track changes to container and image data.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /var/lib/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/var/lib/docker");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/var/lib/docker")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.5".into(),
                            title: "Ensure that /var/lib/docker is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /var/lib/docker".into(),
                            remediation: "Add auditd rule: -w /var/lib/docker -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /var/lib/docker".into() } else { "No audit rule for /var/lib/docker".into() },
                        affected: if found { vec![] } else { vec!["/var/lib/docker".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /var/lib/docker".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /var/lib/docker -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.5".into()],
            rationale: "Auditing /var/lib/docker helps detect unauthorized modifications to Docker image layers and container data.".into(),
            impact: "Audit logging on a high-churn directory may produce significant log volume.".into(),
            tags: vec!["audit".into(), "host".into(), "data".into()],
        }
    }

    // ── 1.1.6 — Audit: /etc/docker ───────────────────────────────────────────

    fn rule_1_1_6() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.6".into(),
            section: 1,
            title: "Ensure that /etc/docker is audited".into(),
            description: "Audit the Docker configuration directory (/etc/docker) to track changes to daemon configuration files.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/etc/docker");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/etc/docker")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.6".into(),
                            title: "Ensure that /etc/docker is audited".into(),
                            category: RuleCategory::Files,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /etc/docker".into(),
                            remediation: "Add auditd rule: -w /etc/docker -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /etc/docker".into() } else { "No audit rule for /etc/docker".into() },
                        affected: if found { vec![] } else { vec!["/etc/docker".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /etc/docker".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/docker -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.6".into()],
            rationale: "Auditing /etc/docker tracks changes to TLS certificates and daemon.json that could weaken Docker security.".into(),
            impact: "Low volume of audit events as /etc/docker changes infrequently.".into(),
            tags: vec!["audit".into(), "host".into(), "config".into()],
        }
    }

    // ── 1.1.7 — Audit: docker.service ────────────────────────────────────────

    fn rule_1_1_7() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.7".into(),
            section: 1,
            title: "Ensure that docker.service is audited".into(),
            description: "Audit the Docker systemd service file to detect unauthorized modifications.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep docker.service".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("docker.service");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("docker.service")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.7".into(),
                            title: "Ensure that docker.service is audited".into(),
                            category: RuleCategory::Files,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for docker.service".into(),
                            remediation: "Add auditd rule watching the docker.service file".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for docker.service".into() } else { "No audit rule for docker.service".into() },
                        affected: if found { vec![] } else { vec!["docker.service".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep docker.service".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: r#"Find the service file:
  systemctl show -p FragmentPath docker.service

Add to /etc/audit/rules.d/docker.rules:
  -w /lib/systemd/system/docker.service -p rwxa -k docker"#.into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.7".into()],
            rationale: "Auditing docker.service detects tampering with service startup configuration.".into(),
            impact: "Low audit event volume.".into(),
            tags: vec!["audit".into(), "systemd".into(), "service".into()],
        }
    }

    // ── 1.1.8 — Audit: containerd.sock ───────────────────────────────────────

    fn rule_1_1_8() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.8".into(),
            section: 1,
            title: "Ensure that containerd.sock is audited".into(),
            description: "Audit the containerd socket file to detect unauthorized access to the container runtime.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep containerd.sock".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("containerd.sock");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("containerd.sock")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.8".into(),
                            title: "Ensure that containerd.sock is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for containerd.sock".into(),
                            remediation: "Add auditd rule watching containerd.sock".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for containerd.sock".into() } else { "No audit rule for containerd.sock".into() },
                        affected: if found { vec![] } else { vec!["containerd.sock".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep containerd.sock".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /run/containerd/containerd.sock -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.8".into()],
            rationale: "Auditing the containerd socket detects unauthorized container runtime access that bypasses Docker daemon.".into(),
            impact: "Low audit event volume.".into(),
            tags: vec!["audit".into(), "containerd".into(), "socket".into()],
        }
    }

    // ── 1.1.9 — Audit: docker.sock ───────────────────────────────────────────

    fn rule_1_1_9() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.9".into(),
            section: 1,
            title: "Ensure that docker.sock is audited".into(),
            description: "Audit the Docker daemon socket file to track all API access attempts.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::High,
            scored: true,
            audit_command: Some("auditctl -l | grep docker.sock".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("docker.sock");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("docker.sock")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.9".into(),
                            title: "Ensure that docker.sock is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::High,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /var/run/docker.sock".into(),
                            remediation: "Add auditd rule: -w /var/run/docker.sock -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for docker.sock".into() } else { "No audit rule for docker.sock".into() },
                        affected: if found { vec![] } else { vec!["/var/run/docker.sock".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep docker.sock".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /var/run/docker.sock -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.9".into()],
            rationale: "The Docker socket is the primary API entry point. Auditing it provides a record of all Docker API access.".into(),
            impact: "High-volume Docker environments will generate significant audit log entries.".into(),
            tags: vec!["audit".into(), "socket".into(), "api".into()],
        }
    }

    // ── 1.1.10 — Audit: /etc/default/docker ──────────────────────────────────

    fn rule_1_1_10() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.10".into(),
            section: 1,
            title: "Ensure that /etc/default/docker is audited".into(),
            description: "Audit the Docker default environment file (/etc/default/docker).".into(),
            category: RuleCategory::Files,
            severity: Severity::Low,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/default/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    // Check if file exists first
                    let file_exists = std::path::Path::new("/etc/default/docker").exists();
                    if !file_exists {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "1.1.10".into(),
                                title: "Ensure that /etc/default/docker is audited".into(),
                                category: RuleCategory::Files,
                                severity: Severity::Low,
                                section: "Host Configuration".into(),
                                description: "Audit rule for /etc/default/docker".into(),
                                remediation: "Add auditd rule if file exists".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "/etc/default/docker does not exist (not applicable)".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        });
                    }
                    let found = Section1::check_audit_rule("/etc/default/docker");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/etc/default/docker")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.10".into(),
                            title: "Ensure that /etc/default/docker is audited".into(),
                            category: RuleCategory::Files,
                            severity: Severity::Low,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /etc/default/docker".into(),
                            remediation: "Add auditd rule: -w /etc/default/docker -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /etc/default/docker".into() } else { "No audit rule for /etc/default/docker".into() },
                        affected: if found { vec![] } else { vec!["/etc/default/docker".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /etc/default/docker".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/default/docker -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.10".into()],
            rationale: "Auditing /etc/default/docker detects changes to Docker daemon environment variable overrides.".into(),
            impact: "Only applicable on Debian/Ubuntu-based systems.".into(),
            tags: vec!["audit".into(), "config".into()],
        }
    }

    // ── 1.1.11 — Audit: daemon.json ──────────────────────────────────────────

    fn rule_1_1_11() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.11".into(),
            section: 1,
            title: "Ensure that /etc/docker/daemon.json is audited".into(),
            description: "Audit the Docker daemon configuration file to detect unauthorized changes to daemon settings.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep daemon.json".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let file_exists = std::path::Path::new("/etc/docker/daemon.json").exists();
                    if !file_exists {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "1.1.11".into(),
                                title: "Ensure that /etc/docker/daemon.json is audited".into(),
                                category: RuleCategory::Files,
                                severity: Severity::Medium,
                                section: "Host Configuration".into(),
                                description: "Audit rule for /etc/docker/daemon.json".into(),
                                remediation: "Create daemon.json and add audit rule".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "/etc/docker/daemon.json does not exist (not applicable)".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        });
                    }
                    let found = Section1::check_audit_rule("daemon.json");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("daemon.json")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.11".into(),
                            title: "Ensure that /etc/docker/daemon.json is audited".into(),
                            category: RuleCategory::Files,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /etc/docker/daemon.json".into(),
                            remediation: "Add auditd rule: -w /etc/docker/daemon.json -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for daemon.json".into() } else { "No audit rule for /etc/docker/daemon.json".into() },
                        affected: if found { vec![] } else { vec!["/etc/docker/daemon.json".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep daemon.json".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/docker/daemon.json -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.11".into()],
            rationale: "daemon.json controls all Docker daemon security settings. Auditing it detects unauthorized configuration changes.".into(),
            impact: "Low audit event volume.".into(),
            tags: vec!["audit".into(), "daemon".into(), "config".into()],
        }
    }

    // ── 1.1.12 — Audit: /etc/containerd/config.toml ──────────────────────────

    fn rule_1_1_12() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.12".into(),
            section: 1,
            title: "Ensure that /etc/containerd/config.toml is audited".into(),
            description: "Audit the containerd configuration file to detect unauthorized changes to runtime settings.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/containerd/config.toml".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let file_exists = std::path::Path::new("/etc/containerd/config.toml").exists();
                    if !file_exists {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "1.1.12".into(),
                                title: "Ensure that /etc/containerd/config.toml is audited".into(),
                                category: RuleCategory::Files,
                                severity: Severity::Medium,
                                section: "Host Configuration".into(),
                                description: "Audit rule for /etc/containerd/config.toml".into(),
                                remediation: "Add audit rule if file exists".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "/etc/containerd/config.toml does not exist (not applicable)".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        });
                    }
                    let found = Section1::check_audit_rule("/etc/containerd/config.toml");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/etc/containerd/config.toml")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.12".into(),
                            title: "Ensure that /etc/containerd/config.toml is audited".into(),
                            category: RuleCategory::Files,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /etc/containerd/config.toml".into(),
                            remediation: "Add auditd rule for /etc/containerd/config.toml".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /etc/containerd/config.toml".into() } else { "No audit rule for /etc/containerd/config.toml".into() },
                        affected: if found { vec![] } else { vec!["/etc/containerd/config.toml".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /etc/containerd/config.toml".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/containerd/config.toml -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.12".into()],
            rationale: "Containerd config controls low-level container runtime behavior. Auditing detects tampering.".into(),
            impact: "Low audit event volume.".into(),
            tags: vec!["audit".into(), "containerd".into(), "config".into()],
        }
    }

    // ── 1.1.14 — Audit: /usr/bin/containerd ──────────────────────────────────

    fn rule_1_1_14() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.14".into(),
            section: 1,
            title: "Ensure that /usr/bin/containerd is audited".into(),
            description: "Audit the containerd binary to detect unauthorized access or modification.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /usr/bin/containerd".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/usr/bin/containerd");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines()
                        .filter(|l| l.contains("/usr/bin/containerd") && !l.contains("containerd-shim"))
                        .collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.14".into(),
                            title: "Ensure that /usr/bin/containerd is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /usr/bin/containerd".into(),
                            remediation: "Add auditd rule: -w /usr/bin/containerd -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /usr/bin/containerd".into() } else { "No audit rule for /usr/bin/containerd".into() },
                        affected: if found { vec![] } else { vec!["/usr/bin/containerd".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /usr/bin/containerd".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /usr/bin/containerd -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.14".into()],
            rationale: "Auditing the containerd binary detects unauthorized execution or modification of the container runtime.".into(),
            impact: "Minimal performance impact.".into(),
            tags: vec!["audit".into(), "containerd".into(), "binary".into()],
        }
    }

    // ── 1.1.18 — Audit: /usr/bin/runc ────────────────────────────────────────

    fn rule_1_1_18() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.18".into(),
            section: 1,
            title: "Ensure that /usr/bin/runc is audited".into(),
            description: "Audit the runc binary — the low-level OCI container runtime used by containerd and Docker.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /usr/bin/runc".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let found = Section1::check_audit_rule("/usr/bin/runc");
                    let raw = Section1::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/usr/bin/runc")).collect();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.18".into(),
                            title: "Ensure that /usr/bin/runc is audited".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Medium,
                            section: "Host Configuration".into(),
                            description: "Audit rule for /usr/bin/runc".into(),
                            remediation: "Add auditd rule: -w /usr/bin/runc -k docker".into(),
                        },
                        status: if found { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if found { "Audit rule found for /usr/bin/runc".into() } else { "No audit rule for /usr/bin/runc".into() },
                        affected: if found { vec![] } else { vec!["/usr/bin/runc".into()] },
                        remediation_kind: RemediationKind::Guided,
                        audit_command: Some("auditctl -l | grep /usr/bin/runc".into()),
                        raw_output: Some(if relevant.is_empty() { "(no matching rules)".into() } else { relevant.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Guided,
            fix_fn: None,
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /usr/bin/runc -p rwxa -k docker\nThen reload auditd.".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.18".into()],
            rationale: "runc is the final layer of container execution. Auditing it detects exploitation attempts like CVE-2019-5736 (runc escape).".into(),
            impact: "Minimal performance impact.".into(),
            tags: vec!["audit".into(), "runc".into(), "oci".into()],
        }
    }
}
