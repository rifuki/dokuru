// Section 3: Docker Daemon Configuration Files
// CIS Docker Benchmark v1.8.0

use super::super::types::*;
use super::section_trait::CheckSection;
use async_trait::async_trait;
use bollard::Docker;
use eyre::Result;
use std::fs;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};

pub struct Section3;

#[async_trait]
impl CheckSection for Section3 {
    fn section_id(&self) -> &str {
        "3"
    }

    fn handles(&self, rule_id: &str) -> bool {
        rule_id.starts_with("3.")
    }

    async fn check(
        &self,
        rule: &CisRule,
        _docker: &Docker,
        _containers: &[bollard::models::ContainerSummary],
    ) -> Result<CheckResult> {
        // Delegate to helper functions based on rule type
        match rule.id.as_str() {
            id if id.contains("ownership") => {
                let path = self.find_docker_path(&rule.id);
                Ok(check_ownership_rule(rule, path.as_deref(), 0, 0, "root", "root"))
            }
            id if id.contains("permission") => {
                let path = self.find_docker_path(&rule.id);
                Ok(check_permission_rule(rule, path.as_deref(), 0o644))
            }
            _ => Ok(CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: format!("Unknown Section 3 rule: {}", rule.id),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            }),
        }
    }
}

impl Section3 {
    fn find_docker_path(&self, rule_id: &str) -> Option<PathBuf> {
        // Map rule IDs to file paths
        match rule_id {
            "3.1" | "3.2" => Some(PathBuf::from("/etc/docker/daemon.json")),
            "3.3" | "3.4" => Some(PathBuf::from("/etc/docker")),
            _ => find_docker_service_path(),
        }
    }
}

// ── Section 3: file-system checks (free functions) ────────────────────────────

pub const SENSITIVE_HOST_DIRS: &[&str] = &[
    "/", "/boot", "/dev", "/etc", "/lib", "/proc", "/sys", "/usr",
];

/// Check that `path` is owned by `expected_uid`:`expected_gid`.
pub fn check_ownership_rule(
    rule: &CisRule,
    path: Option<&Path>,
    expected_uid: u32,
    expected_gid: u32,
    uid_name: &str,
    gid_name: &str,
) -> CheckResult {
    let path = match path {
        Some(p) => p,
        None => {
            return CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: "Target file/directory not found at expected paths.".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            };
        }
    };

    let audit_command = format!("stat -c %U:%G {}", path.display());

    if !path.exists() {
        return CheckResult {
            rule: rule.clone(),
            status: CheckStatus::Error,
            message: format!("{} not found.", path.display()),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: Some(audit_command),
            raw_output: Some("not found".to_string()),
        };
    }

    match stat_ownership(path) {
        Some((uid, gid)) => {
            let passed = uid == expected_uid && gid == expected_gid;
            let actual_uid_str = if uid == 0 {
                "root".to_string()
            } else {
                uid.to_string()
            };
            let actual_gid_str = if gid == 0 {
                "root".to_string()
            } else {
                gid.to_string()
            };
            let raw = format!("{}:{}", actual_uid_str, actual_gid_str);

            CheckResult {
                rule: rule.clone(),
                status: if passed {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Fail
                },
                message: if passed {
                    format!(
                        "{} is owned by {}:{} ✓",
                        path.display(),
                        actual_uid_str,
                        actual_gid_str
                    )
                } else {
                    format!(
                        "{} is owned by {}:{} (expected {}:{})",
                        path.display(),
                        actual_uid_str,
                        actual_gid_str,
                        uid_name,
                        gid_name
                    )
                },
                affected: if passed {
                    vec![]
                } else {
                    vec![path.display().to_string()]
                },
                remediation_kind: RemediationKind::Guided,
                audit_command: Some(audit_command),
                raw_output: Some(raw),
            }
        }
        None => CheckResult {
            rule: rule.clone(),
            status: CheckStatus::Error,
            message: format!("Could not read metadata for {}.", path.display()),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: Some(audit_command),
            raw_output: None,
        },
    }
}

/// Check that `path` permissions are `max_mode` or more restrictive.
pub fn check_permission_rule(rule: &CisRule, path: Option<&Path>, max_mode: u32) -> CheckResult {
    let path = match path {
        Some(p) => p,
        None => {
            return CheckResult {
                rule: rule.clone(),
                status: CheckStatus::Error,
                message: "Target file/directory not found at expected paths.".to_string(),
                affected: vec![],
                remediation_kind: RemediationKind::Manual,
                audit_command: None,
                raw_output: None,
            };
        }
    };

    let audit_command = format!("stat -c %a {}", path.display());

    if !path.exists() {
        return CheckResult {
            rule: rule.clone(),
            status: CheckStatus::Error,
            message: format!("{} not found.", path.display()),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: Some(audit_command),
            raw_output: Some("not found".to_string()),
        };
    }

    match stat_mode(path) {
        Some(mode) => {
            // "max_mode or more restrictive" → no permission bits set beyond max_mode
            let passed = (mode & !max_mode) == 0;
            let raw = format!("{:o}", mode);

            CheckResult {
                rule: rule.clone(),
                status: if passed {
                    CheckStatus::Pass
                } else {
                    CheckStatus::Fail
                },
                message: if passed {
                    format!(
                        "{} has permissions {:o} (within {:o} ✓)",
                        path.display(),
                        mode,
                        max_mode
                    )
                } else {
                    format!(
                        "{} has permissions {:o} (expected {:o} or more restrictive)",
                        path.display(),
                        mode,
                        max_mode
                    )
                },
                affected: if passed {
                    vec![]
                } else {
                    vec![path.display().to_string()]
                },
                remediation_kind: RemediationKind::Guided,
                audit_command: Some(audit_command),
                raw_output: Some(raw),
            }
        }
        None => CheckResult {
            rule: rule.clone(),
            status: CheckStatus::Error,
            message: format!("Could not read metadata for {}.", path.display()),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: Some(audit_command),
            raw_output: None,
        },
    }
}

// ── OS helpers ────────────────────────────────────────────────────────────────

pub fn stat_ownership(path: &Path) -> Option<(u32, u32)> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        fs::metadata(path).ok().map(|m| (m.uid(), m.gid()))
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

pub fn stat_mode(path: &Path) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        fs::metadata(path).ok().map(|m| m.mode() & 0o777)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        None
    }
}

pub fn find_docker_service_path() -> Option<PathBuf> {
    for candidate in &[
        "/lib/systemd/system/docker.service",
        "/usr/lib/systemd/system/docker.service",
        "/etc/systemd/system/docker.service",
    ] {
        let p = Path::new(candidate);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    None
}

pub fn get_group_gid(name: &str) -> Option<u32> {
    let content = fs::read_to_string("/etc/group").ok()?;
    for line in content.lines() {
        let mut parts = line.splitn(4, ':');
        let group_name = parts.next()?;
        let _ = parts.next(); // password field
        let gid_str = parts.next()?;
        if group_name == name {
            return gid_str.parse().ok();
        }
    }
    None
}
