// Section 1: Host Configuration
// CIS Docker Benchmark v1.8.0
#![allow(
    clippy::too_many_lines,
    clippy::option_if_let_else,
    clippy::single_match_else
)]
use super::RuleDefinition;
use crate::audit::{
    fix_helpers,
    types::{CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity},
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

    fn read_audit_rules() -> String {
        let mut content = String::new();
        if let Ok(s) = std::fs::read_to_string("/etc/audit/audit.rules") {
            content.push_str(&s);
        }
        if let Ok(entries) = std::fs::read_dir("/etc/audit/rules.d") {
            let mut paths: Vec<_> = entries
                .flatten()
                .filter(|e| e.path().extension().is_some_and(|ext| ext == "rules"))
                .collect();
            paths.sort_by_key(std::fs::DirEntry::path);
            for entry in paths {
                if let Ok(s) = std::fs::read_to_string(entry.path()) {
                    content.push_str(&s);
                }
            }
        }
        content
    }

    fn audit_result(
        id: &str,
        title: &str,
        target: &str,
        found: bool,
        relevant: &[&str],
    ) -> CheckResult {
        CheckResult {
            rule: CisRule {
                id: id.into(),
                title: title.into(),
                category: RuleCategory::Runtime,
                severity: Severity::Medium,
                section: "Host Configuration".into(),
                description: format!("Audit rule for {target}"),
                remediation: format!("Add auditd rule: -w {target} -p rwxa -k docker"),
            },
            status: if found {
                CheckStatus::Pass
            } else {
                CheckStatus::Fail
            },
            message: if found {
                format!("Audit rule found for {target}")
            } else {
                format!("No audit rule for {target}")
            },
            affected: if found { vec![] } else { vec![target.into()] },
            remediation_kind: RemediationKind::Guided,
            audit_command: Some(format!("auditctl -l | grep {target}")),
            raw_output: Some(if relevant.is_empty() {
                "(no matching rules)".into()
            } else {
                relevant.join("\n")
            }),
            references: None,
            rationale: None,
            impact: None,
            tags: None,
        }
    }

    // ── 1.1.1 — Separate partition ────────────────────────────────────────────

    fn rule_1_1_1() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.1".into(),
            section: 1,
            title: "Ensure a separate partition for containers has been created".into(),
            description: "Docker uses /var/lib/docker as default data directory. It should be on a separate partition to prevent container data from filling the root filesystem.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Low,
            scored: true,
            audit_command: Some("cat /proc/mounts | grep /var/lib/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let mounts = std::fs::read_to_string("/proc/mounts").unwrap_or_default();
                    let matching: Vec<String> = mounts
                        .lines()
                        .filter(|l| l.split_whitespace().nth(1).is_some_and(|mp| mp == "/var/lib/docker"))
                        .map(String::from)
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
                            remediation: "Mount a dedicated partition at /var/lib/docker".into(),
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
                        raw_output: Some(if matching.is_empty() { "(no mount entry)".into() } else { matching.join("\n") }),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: "Create a dedicated partition and mount it at /var/lib/docker:\n  1. Create partition with fdisk\n  2. mkfs.ext4 /dev/sdX1\n  3. Add to /etc/fstab\n  4. Restart Docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.1".into()],
            rationale: "Without a separate partition, Docker data can fill the root filesystem.".into(),
            impact: "Requires partitioning and data migration.".into(),
            tags: vec!["host".into(), "partition".into(), "filesystem".into()],
        }
    }

    // ── 1.1.2 — Docker group ─────────────────────────────────────────────────

    fn rule_1_1_2() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.2".into(),
            section: 1,
            title: "Ensure only trusted users are added to the docker group".into(),
            description: "Members of the docker group have root-equivalent access via Docker. Only trusted administrators should be members.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::High,
            scored: true,
            audit_command: Some("getent group docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let group_content = std::fs::read_to_string("/etc/group").unwrap_or_default();
                    let docker_line = group_content.lines().find(|l| l.starts_with("docker:"));
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
                    let group_exists = docker_line.is_some();
                    Ok(CheckResult {
                        rule: CisRule {
                            id: "1.1.2".into(),
                            title: "Ensure only trusted users are added to the docker group".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::High,
                            section: "Host Configuration".into(),
                            description: "Docker group membership control".into(),
                            remediation: "Remove untrusted users from the docker group".into(),
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
                    })
                })
            },
            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: "Review docker group:\n  cat /etc/group | grep docker\nRemove untrusted users:\n  sudo gpasswd -d <username> docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.2".into()],
            rationale: "docker group membership grants root-equivalent access to the host.".into(),
            impact: "Removed users must use sudo for Docker commands.".into(),
            tags: vec!["host".into(), "privilege".into(), "group".into()],
        }
    }

    // ── 1.1.3–1.1.18 — Auditd rules ─────────────────────────────────────────

    fn rule_1_1_3() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.3".into(),
            section: 1,
            title: "Ensure that Docker daemon activity is audited".into(),
            description: "Audit /usr/bin/dockerd to track all daemon invocations.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /usr/bin/dockerd".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/usr/bin/dockerd")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.3", "Ensure that Docker daemon activity is audited", "/usr/bin/dockerd", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /usr/bin/dockerd -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.3", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.3", "Audit rule added for /usr/bin/dockerd", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /usr/bin/dockerd -p rwxa -k docker\nThen: systemctl restart auditd".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.3".into()],
            rationale: "Auditing dockerd detects tampering with the Docker binary.".into(),
            impact: "Minimal performance impact from audit logging.".into(),
            tags: vec!["audit".into(), "host".into()],
        }
    }

    fn rule_1_1_4() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.4".into(),
            section: 1,
            title: "Ensure that containerd is audited".into(),
            description: "Audit /run/containerd to track container runtime socket access.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /run/containerd".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw
                        .lines()
                        .filter(|l| l.contains("/run/containerd"))
                        .collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result(
                        "1.1.4",
                        "Ensure that containerd is audited",
                        "/run/containerd",
                        found,
                        &relevant,
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /run/containerd -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked(
                            "1.1.4",
                            &format!("Failed to write audit rule: {e}"),
                        )),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied(
                                "1.1.4",
                                "Audit rule added for /run/containerd",
                                false,
                            ))
                        }
                    }
                })
            }),
            remediation_guide:
                "Add to /etc/audit/rules.d/docker.rules:\n  -w /run/containerd -p rwxa -k docker"
                    .into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.4".into()],
            rationale:
                "Containerd socket access should be audited to detect bypasses of Docker daemon."
                    .into(),
            impact: "Minimal performance impact.".into(),
            tags: vec!["audit".into(), "containerd".into()],
        }
    }

    fn rule_1_1_5() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.5".into(),
            section: 1,
            title: "Ensure that /var/lib/docker is audited".into(),
            description: "Audit the Docker data directory to track changes to container/image data.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /var/lib/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/var/lib/docker")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.5", "Ensure that /var/lib/docker is audited", "/var/lib/docker", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /var/lib/docker -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.5", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.5", "Audit rule added for /var/lib/docker", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /var/lib/docker -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.5".into()],
            rationale: "Auditing /var/lib/docker detects unauthorized modifications to image layers and container data.".into(),
            impact: "High-churn directory may produce significant log volume.".into(),
            tags: vec!["audit".into(), "data".into()],
        }
    }

    fn rule_1_1_6() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.6".into(),
            section: 1,
            title: "Ensure that /etc/docker is audited".into(),
            description:
                "Audit the Docker config directory to detect changes to TLS certs and daemon.json."
                    .into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> =
                        raw.lines().filter(|l| l.contains("/etc/docker")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result(
                        "1.1.6",
                        "Ensure that /etc/docker is audited",
                        "/etc/docker",
                        found,
                        &relevant,
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /etc/docker -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked(
                            "1.1.6",
                            &format!("Failed to write audit rule: {e}"),
                        )),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied(
                                "1.1.6",
                                "Audit rule added for /etc/docker",
                                false,
                            ))
                        }
                    }
                })
            }),
            remediation_guide:
                "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/docker -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.6".into()],
            rationale: "Changes to /etc/docker may weaken TLS or daemon security settings.".into(),
            impact: "Low event volume.".into(),
            tags: vec!["audit".into(), "config".into()],
        }
    }

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
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("docker.service")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.7", "Ensure that docker.service is audited", "docker.service", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    let unit_paths = [
                        "/lib/systemd/system/docker.service",
                        "/usr/lib/systemd/system/docker.service",
                        "/etc/systemd/system/docker.service",
                    ];
                    let path = unit_paths.iter()
                        .find(|p| std::path::Path::new(p).exists())
                        .copied()
                        .unwrap_or("/lib/systemd/system/docker.service");
                    let rule = format!("-w {path} -p rwxa -k docker");
                    match fix_helpers::ensure_audit_rule(&rule) {
                        Err(e) => Ok(fix_helpers::blocked("1.1.7", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.7", &format!("Audit rule added for {path}"), false))
                        }
                    }
                })
            }),
            remediation_guide: "Find service file path:\n  systemctl show -p FragmentPath docker.service\nAdd rule:\n  -w /lib/systemd/system/docker.service -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.7".into()],
            rationale: "Tampering with docker.service changes daemon startup configuration.".into(),
            impact: "Low event volume.".into(),
            tags: vec!["audit".into(), "systemd".into()],
        }
    }

    fn rule_1_1_8() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.8".into(),
            section: 1,
            title: "Ensure that containerd.sock is audited".into(),
            description: "Audit the containerd socket to detect unauthorized container runtime access.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep containerd.sock".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("containerd.sock")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.8", "Ensure that containerd.sock is audited", "containerd.sock", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /run/containerd/containerd.sock -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.8", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.8", "Audit rule added for containerd.sock", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /run/containerd/containerd.sock -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.8".into()],
            rationale: "Containerd socket access bypasses Docker daemon — it must be audited separately.".into(),
            impact: "Low event volume.".into(),
            tags: vec!["audit".into(), "containerd".into(), "socket".into()],
        }
    }

    fn rule_1_1_9() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.9".into(),
            section: 1,
            title: "Ensure that docker.sock is audited".into(),
            description: "Audit /var/run/docker.sock — the primary Docker API entry point — to track all API access.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::High,
            scored: true,
            audit_command: Some("auditctl -l | grep docker.sock".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("docker.sock")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.9", "Ensure that docker.sock is audited", "docker.sock", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /var/run/docker.sock -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.9", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.9", "Audit rule added for /var/run/docker.sock", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /var/run/docker.sock -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.9".into()],
            rationale: "docker.sock is the API entry point. Auditing it records all Docker API calls.".into(),
            impact: "High-volume environments generate significant log entries.".into(),
            tags: vec!["audit".into(), "socket".into(), "api".into()],
        }
    }

    fn rule_1_1_10() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.10".into(),
            section: 1,
            title: "Ensure that /etc/default/docker is audited".into(),
            description: "Audit the Docker environment override file if it exists.".into(),
            category: RuleCategory::Files,
            severity: Severity::Low,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/default/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/default/docker").exists() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "1.1.10".into(),
                                title: "Ensure that /etc/default/docker is audited".into(),
                                category: RuleCategory::Files,
                                severity: Severity::Low,
                                section: "Host Configuration".into(),
                                description: "Audit rule for /etc/default/docker".into(),
                                remediation: "Not applicable — file does not exist".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "/etc/default/docker does not exist (not applicable on this system)".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                            references: None,
                            rationale: None,
                            impact: None,
                            tags: None,
                        });
                    }
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/etc/default/docker")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.10", "Ensure that /etc/default/docker is audited", "/etc/default/docker", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/default/docker").exists() {
                        return Ok(fix_helpers::blocked("1.1.10", "/etc/default/docker does not exist on this system"));
                    }
                    match fix_helpers::ensure_audit_rule("-w /etc/default/docker -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.10", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.10", "Audit rule added for /etc/default/docker", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/default/docker -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.10".into()],
            rationale: "Detects changes to Docker daemon env var overrides on Debian-based systems.".into(),
            impact: "Only applicable on Debian/Ubuntu systems.".into(),
            tags: vec!["audit".into(), "config".into()],
        }
    }

    fn rule_1_1_11() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.11".into(),
            section: 1,
            title: "Ensure that /etc/docker/daemon.json is audited".into(),
            description: "Audit daemon.json to detect unauthorized changes to Docker daemon security settings.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep daemon.json".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/docker/daemon.json").exists() {
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
                        });
                    }
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("daemon.json")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.11", "Ensure that /etc/docker/daemon.json is audited", "/etc/docker/daemon.json", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/docker/daemon.json").exists() {
                        return Ok(fix_helpers::blocked("1.1.11", "/etc/docker/daemon.json does not exist yet"));
                    }
                    match fix_helpers::ensure_audit_rule("-w /etc/docker/daemon.json -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.11", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.11", "Audit rule added for /etc/docker/daemon.json", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/docker/daemon.json -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.11".into()],
            rationale: "daemon.json controls all Docker security settings. Auditing it detects unauthorized changes.".into(),
            impact: "Low event volume.".into(),
            tags: vec!["audit".into(), "daemon".into(), "config".into()],
        }
    }

    fn rule_1_1_12() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.12".into(),
            section: 1,
            title: "Ensure that /etc/containerd/config.toml is audited".into(),
            description: "Audit containerd config to detect unauthorized runtime configuration changes.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /etc/containerd/config.toml".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/containerd/config.toml").exists() {
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
                        });
                    }
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/etc/containerd/config.toml")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.12", "Ensure that /etc/containerd/config.toml is audited", "/etc/containerd/config.toml", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/containerd/config.toml").exists() {
                        return Ok(fix_helpers::blocked("1.1.12", "/etc/containerd/config.toml does not exist"));
                    }
                    match fix_helpers::ensure_audit_rule("-w /etc/containerd/config.toml -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.12", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.12", "Audit rule added for /etc/containerd/config.toml", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /etc/containerd/config.toml -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.12".into()],
            rationale: "containerd config controls low-level runtime behavior. Auditing detects tampering.".into(),
            impact: "Low event volume.".into(),
            tags: vec!["audit".into(), "containerd".into()],
        }
    }

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
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines()
                        .filter(|l| l.contains("/usr/bin/containerd") && !l.contains("containerd-shim"))
                        .collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.14", "Ensure that /usr/bin/containerd is audited", "/usr/bin/containerd", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /usr/bin/containerd -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.14", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.14", "Audit rule added for /usr/bin/containerd", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /usr/bin/containerd -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.14".into()],
            rationale: "Auditing the containerd binary detects unauthorized execution or tampering.".into(),
            impact: "Minimal performance impact.".into(),
            tags: vec!["audit".into(), "containerd".into(), "binary".into()],
        }
    }

    fn rule_1_1_18() -> RuleDefinition {
        RuleDefinition {
            id: "1.1.18".into(),
            section: 1,
            title: "Ensure that /usr/bin/runc is audited".into(),
            description: "Audit the runc OCI runtime binary to detect unauthorized access or modification.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("auditctl -l | grep /usr/bin/runc".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let raw = Self::read_audit_rules();
                    let relevant: Vec<&str> = raw.lines().filter(|l| l.contains("/usr/bin/runc")).collect();
                    let found = !relevant.is_empty();
                    Ok(Self::audit_result("1.1.18", "Ensure that /usr/bin/runc is audited", "/usr/bin/runc", found, &relevant))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::ensure_audit_rule("-w /usr/bin/runc -p rwxa -k docker") {
                        Err(e) => Ok(fix_helpers::blocked("1.1.18", &format!("Failed to write audit rule: {e}"))),
                        Ok(_) => {
                            let _ = fix_helpers::run_cmd("service", &["auditd", "reload"]).await;
                            Ok(fix_helpers::applied("1.1.18", "Audit rule added for /usr/bin/runc", false))
                        }
                    }
                })
            }),
            remediation_guide: "Add to /etc/audit/rules.d/docker.rules:\n  -w /usr/bin/runc -p rwxa -k docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 1.1.18".into()],
            rationale: "runc is the final execution layer. Auditing detects CVE-style binary replacement attacks.".into(),
            impact: "Minimal performance impact.".into(),
            tags: vec!["audit".into(), "runc".into(), "oci".into()],
        }
    }
}
