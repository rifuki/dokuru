// Section 3: Docker Daemon Configuration File Permissions
// CIS Docker Benchmark v1.8.0
#![allow(clippy::too_many_lines)]
use super::RuleDefinition;
use crate::audit::{
    fix_helpers,
    types::{CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity},
};

pub struct Section3;

impl Section3 {
    pub fn rules() -> Vec<RuleDefinition> {
        vec![
            Self::rule_3_1(),
            Self::rule_3_2(),
            Self::rule_3_3(),
            Self::rule_3_4(),
            Self::rule_3_5(),
            Self::rule_3_6(),
            Self::rule_3_17(),
            Self::rule_3_18(),
        ]
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Returns (uid, gid, mode) or None if the file doesn't exist
    #[cfg(unix)]
    fn file_meta(path: &str) -> Option<(u32, u32, u32)> {
        use std::os::unix::fs::MetadataExt;
        std::fs::metadata(path)
            .ok()
            .map(|m| (m.uid(), m.gid(), m.mode() & 0o7777))
    }

    #[cfg(not(unix))]
    fn file_meta(_path: &str) -> Option<(u32, u32, u32)> {
        None
    }

    /// True if no extra permission bits are set beyond `max`
    const fn perms_ok(mode: u32, max: u32) -> bool {
        (mode & !max) == 0
    }

    /// Find the docker.service or docker.socket file path across common systemd locations
    fn find_systemd_unit(unit: &str) -> Option<String> {
        let paths = [
            format!("/lib/systemd/system/{unit}"),
            format!("/usr/lib/systemd/system/{unit}"),
            format!("/etc/systemd/system/{unit}"),
        ];
        paths.into_iter().find(|p| std::path::Path::new(p).exists())
    }

    fn ownership_check(id: &str, title: &str, path: &str, audit_cmd: &str) -> CheckResult {
        match Self::file_meta(path) {
            None => CheckResult {
                rule: CisRule {
                    id: id.into(),
                    title: title.into(),
                    category: RuleCategory::Files,
                    severity: Severity::Medium,
                    section: "Config File Permissions".into(),
                    description: format!("Ownership check for {path}"),
                    remediation: format!("chown root:root {path}"),
                },
                status: CheckStatus::Pass,
                message: format!("{path} does not exist (not applicable)"),
                affected: vec![],
                remediation_kind: RemediationKind::Guided,
                audit_command: Some(audit_cmd.into()),
                raw_output: None,
                references: None,
                rationale: None,
                impact: None,
                tags: None,
            },
            Some((uid, gid, _)) => {
                let ok = uid == 0 && gid == 0;
                CheckResult {
                    rule: CisRule {
                        id: id.into(),
                        title: title.into(),
                        category: RuleCategory::Files,
                        severity: Severity::Medium,
                        section: "Config File Permissions".into(),
                        description: format!("Ownership check for {path}"),
                        remediation: format!("chown root:root {path}"),
                    },
                    status: if ok {
                        CheckStatus::Pass
                    } else {
                        CheckStatus::Fail
                    },
                    message: if ok {
                        format!("{path} is owned by root:root")
                    } else {
                        format!("{path} is owned by uid={uid} gid={gid} (expected root:root)")
                    },
                    affected: if ok { vec![] } else { vec![path.into()] },
                    remediation_kind: RemediationKind::Guided,
                    audit_command: Some(audit_cmd.into()),
                    raw_output: Some(format!("uid={uid} gid={gid}")),
                    references: None,
                    rationale: None,
                    impact: None,
                    tags: None,
                }
            }
        }
    }

    fn permissions_check(
        id: &str,
        title: &str,
        path: &str,
        max_mode: u32,
        max_desc: &str,
        audit_cmd: &str,
    ) -> CheckResult {
        match Self::file_meta(path) {
            None => CheckResult {
                rule: CisRule {
                    id: id.into(),
                    title: title.into(),
                    category: RuleCategory::Files,
                    severity: Severity::Medium,
                    section: "Config File Permissions".into(),
                    description: format!("Permission check for {path}"),
                    remediation: format!("chmod {max_desc} {path}"),
                },
                status: CheckStatus::Pass,
                message: format!("{path} does not exist (not applicable)"),
                affected: vec![],
                remediation_kind: RemediationKind::Guided,
                audit_command: Some(audit_cmd.into()),
                raw_output: None,
                references: None,
                rationale: None,
                impact: None,
                tags: None,
            },
            Some((_, _, mode)) => {
                let ok = Self::perms_ok(mode, max_mode);
                CheckResult {
                    rule: CisRule {
                        id: id.into(),
                        title: title.into(),
                        category: RuleCategory::Files,
                        severity: Severity::Medium,
                        section: "Config File Permissions".into(),
                        description: format!("Permission check for {path}"),
                        remediation: format!("chmod {max_desc} {path}"),
                    },
                    status: if ok {
                        CheckStatus::Pass
                    } else {
                        CheckStatus::Fail
                    },
                    message: if ok {
                        format!("{path} permissions are {mode:04o} (within {max_desc})")
                    } else {
                        format!(
                            "{path} permissions are {mode:04o} (too permissive, max {max_desc})"
                        )
                    },
                    affected: if ok { vec![] } else { vec![path.into()] },
                    remediation_kind: RemediationKind::Guided,
                    audit_command: Some(audit_cmd.into()),
                    raw_output: Some(format!("{mode:04o}")),
                    references: None,
                    rationale: None,
                    impact: None,
                    tags: None,
                }
            }
        }
    }

    // ── 3.1 — docker.service ownership ───────────────────────────────────────

    fn rule_3_1() -> RuleDefinition {
        RuleDefinition {
            id: "3.1".into(),
            section: 3,
            title: "Ensure that the docker.service file ownership is set to root:root".into(),
            description: "docker.service is the systemd unit that controls Docker daemon startup. It must be owned by root.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %U:%G $(systemctl show -p FragmentPath docker.service | cut -d= -f2)".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.service")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.service".into());
                    Ok(Self::ownership_check(
                        "3.1",
                        "Ensure that the docker.service file ownership is set to root:root",
                        &path,
                        "stat -c %U:%G /lib/systemd/system/docker.service",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.service")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.service".into());
                    match fix_helpers::run_cmd("chown", &["root:root", &path]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.1", &format!("{path} ownership set to root:root"), false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.1", &format!("chown failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.1", &format!("chown error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chown root:root /lib/systemd/system/docker.service".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.1".into()],
            rationale: "If docker.service is owned by non-root, unprivileged users could modify daemon startup parameters.".into(),
            impact: "None — root ownership is the expected default.".into(),
            tags: vec!["files".into(), "ownership".into(), "systemd".into()],
        }
    }

    // ── 3.2 — docker.service permissions ─────────────────────────────────────

    fn rule_3_2() -> RuleDefinition {
        RuleDefinition {
            id: "3.2".into(),
            section: 3,
            title: "Ensure that the docker.service file permissions are appropriately set".into(),
            description: "docker.service permissions should be at most 644 to prevent unauthorized modification.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %a $(systemctl show -p FragmentPath docker.service | cut -d= -f2)".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.service")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.service".into());
                    Ok(Self::permissions_check(
                        "3.2",
                        "Ensure that the docker.service file permissions are appropriately set",
                        &path,
                        0o644,
                        "644",
                        "stat -c %a /lib/systemd/system/docker.service",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.service")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.service".into());
                    match fix_helpers::run_cmd("chmod", &["644", &path]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.2", &format!("{path} permissions set to 644"), false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.2", &format!("chmod failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.2", &format!("chmod error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chmod 644 /lib/systemd/system/docker.service".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.2".into()],
            rationale: "Overly permissive permissions allow unauthorized users to modify Docker daemon startup.".into(),
            impact: "None — 644 is the expected default for systemd unit files.".into(),
            tags: vec!["files".into(), "permissions".into(), "systemd".into()],
        }
    }

    // ── 3.3 — docker.socket ownership ────────────────────────────────────────

    fn rule_3_3() -> RuleDefinition {
        RuleDefinition {
            id: "3.3".into(),
            section: 3,
            title: "Ensure that the docker.socket file ownership is set to root:root".into(),
            description: "docker.socket is the systemd socket activation unit for Docker. It must be owned by root.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %U:%G /lib/systemd/system/docker.socket".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.socket")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.socket".into());
                    Ok(Self::ownership_check(
                        "3.3",
                        "Ensure that the docker.socket file ownership is set to root:root",
                        &path,
                        "stat -c %U:%G /lib/systemd/system/docker.socket",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.socket")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.socket".into());
                    match fix_helpers::run_cmd("chown", &["root:root", &path]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.3", &format!("{path} ownership set to root:root"), false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.3", &format!("chown failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.3", &format!("chown error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chown root:root /lib/systemd/system/docker.socket".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.3".into()],
            rationale: "docker.socket controls socket activation. Non-root ownership is a privilege escalation vector.".into(),
            impact: "None.".into(),
            tags: vec!["files".into(), "ownership".into(), "socket".into()],
        }
    }

    // ── 3.4 — docker.socket permissions ──────────────────────────────────────

    fn rule_3_4() -> RuleDefinition {
        RuleDefinition {
            id: "3.4".into(),
            section: 3,
            title: "Ensure that the docker.socket file permissions are appropriately set".into(),
            description: "docker.socket permissions should be at most 644.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %a /lib/systemd/system/docker.socket".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.socket")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.socket".into());
                    Ok(Self::permissions_check(
                        "3.4",
                        "Ensure that the docker.socket file permissions are appropriately set",
                        &path,
                        0o644,
                        "644",
                        "stat -c %a /lib/systemd/system/docker.socket",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    let path = Self::find_systemd_unit("docker.socket")
                        .unwrap_or_else(|| "/lib/systemd/system/docker.socket".into());
                    match fix_helpers::run_cmd("chmod", &["644", &path]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.4", &format!("{path} permissions set to 644"), false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.4", &format!("chmod failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.4", &format!("chmod error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chmod 644 /lib/systemd/system/docker.socket".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.4".into()],
            rationale: "Overly permissive permissions allow unauthorized modification of socket activation.".into(),
            impact: "None.".into(),
            tags: vec!["files".into(), "permissions".into(), "socket".into()],
        }
    }

    // ── 3.5 — /etc/docker ownership ──────────────────────────────────────────

    fn rule_3_5() -> RuleDefinition {
        RuleDefinition {
            id: "3.5".into(),
            section: 3,
            title: "Ensure that the /etc/docker directory ownership is set to root:root".into(),
            description: "/etc/docker contains TLS certificates and daemon.json. It must be owned by root.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %U:%G /etc/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    Ok(Self::ownership_check(
                        "3.5",
                        "Ensure that the /etc/docker directory ownership is set to root:root",
                        "/etc/docker",
                        "stat -c %U:%G /etc/docker",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::run_cmd("chown", &["root:root", "/etc/docker"]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.5", "/etc/docker ownership set to root:root", false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.5", &format!("chown failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.5", &format!("chown error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chown root:root /etc/docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.5".into()],
            rationale: "/etc/docker contains sensitive TLS material. Non-root ownership exposes it to tampering.".into(),
            impact: "None — root ownership is expected.".into(),
            tags: vec!["files".into(), "ownership".into(), "tls".into()],
        }
    }

    // ── 3.6 — /etc/docker permissions ────────────────────────────────────────

    fn rule_3_6() -> RuleDefinition {
        RuleDefinition {
            id: "3.6".into(),
            section: 3,
            title:
                "Ensure that /etc/docker directory permissions are set to 755 or more restrictive"
                    .into(),
            description: "/etc/docker permissions should be at most 755.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %a /etc/docker".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    Ok(Self::permissions_check(
                        "3.6",
                        "Ensure that /etc/docker directory permissions are set to 755 or more restrictive",
                        "/etc/docker",
                        0o755,
                        "755",
                        "stat -c %a /etc/docker",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    match fix_helpers::run_cmd("chmod", &["755", "/etc/docker"]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.6", "/etc/docker permissions set to 755", false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.6", &format!("chmod failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.6", &format!("chmod error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chmod 755 /etc/docker".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.6".into()],
            rationale:
                "World-writable /etc/docker allows any user to plant malicious TLS certificates."
                    .into(),
            impact: "None — 755 is the expected default for config directories.".into(),
            tags: vec!["files".into(), "permissions".into(), "config".into()],
        }
    }

    // ── 3.17 — daemon.json ownership ─────────────────────────────────────────

    fn rule_3_17() -> RuleDefinition {
        RuleDefinition {
            id: "3.17".into(),
            section: 3,
            title: "Ensure that the daemon.json file ownership is set to root:root".into(),
            description:
                "daemon.json controls Docker daemon security settings and must be owned by root."
                    .into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %U:%G /etc/docker/daemon.json".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    Ok(Self::ownership_check(
                        "3.17",
                        "Ensure that the daemon.json file ownership is set to root:root",
                        "/etc/docker/daemon.json",
                        "stat -c %U:%G /etc/docker/daemon.json",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/docker/daemon.json").exists() {
                        return Ok(fix_helpers::blocked("3.17", "/etc/docker/daemon.json does not exist"));
                    }
                    match fix_helpers::run_cmd("chown", &["root:root", "/etc/docker/daemon.json"]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.17", "/etc/docker/daemon.json ownership set to root:root", false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.17", &format!("chown failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.17", &format!("chown error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chown root:root /etc/docker/daemon.json".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.17".into()],
            rationale:
                "daemon.json controls all security features. Non-root ownership allows tampering."
                    .into(),
            impact: "None.".into(),
            tags: vec!["files".into(), "ownership".into(), "daemon".into()],
        }
    }

    // ── 3.18 — daemon.json permissions ───────────────────────────────────────

    fn rule_3_18() -> RuleDefinition {
        RuleDefinition {
            id: "3.18".into(),
            section: 3,
            title: "Ensure that the daemon.json file permissions are set to 644 or more restrictive".into(),
            description: "daemon.json permissions should be at most 644.".into(),
            category: RuleCategory::Files,
            severity: Severity::Medium,
            scored: true,
            audit_command: Some("stat -c %a /etc/docker/daemon.json".into()),
            check_fn: |_docker, _containers| {
                Box::pin(async move {
                    Ok(Self::permissions_check(
                        "3.18",
                        "Ensure that the daemon.json file permissions are set to 644 or more restrictive",
                        "/etc/docker/daemon.json",
                        0o644,
                        "644",
                        "stat -c %a /etc/docker/daemon.json",
                    ))
                })
            },
            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|_docker| {
                Box::pin(async move {
                    if !std::path::Path::new("/etc/docker/daemon.json").exists() {
                        return Ok(fix_helpers::blocked("3.18", "/etc/docker/daemon.json does not exist"));
                    }
                    match fix_helpers::run_cmd("chmod", &["644", "/etc/docker/daemon.json"]).await {
                        Ok((_, _, true)) => Ok(fix_helpers::applied("3.18", "/etc/docker/daemon.json permissions set to 644", false)),
                        Ok((_, stderr, _)) => Ok(fix_helpers::blocked("3.18", &format!("chmod failed: {stderr}"))),
                        Err(e) => Ok(fix_helpers::blocked("3.18", &format!("chmod error: {e}"))),
                    }
                })
            }),
            remediation_guide: "chmod 644 /etc/docker/daemon.json".into(),
            requires_restart: false,
            requires_elevation: true,
            references: vec!["CIS Docker Benchmark v1.8.0, Section 3.18".into()],
            rationale: "World-writable daemon.json allows any user to change Docker security configuration.".into(),
            impact: "None — 644 is correct for config files.".into(),
            tags: vec!["files".into(), "permissions".into(), "daemon".into()],
        }
    }
}
