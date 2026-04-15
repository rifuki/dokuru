use bollard::Docker;
use chrono::Utc;
use serde_json::Value;
use std::{fs, path::Path, path::PathBuf};

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
            // ── Section 2: Daemon Configuration ──────────────────────────────
            "2.10" => self.check_2_10(rule).await,
            "2.11" => self.check_2_11(rule).await,

            // ── Section 3: Docker Daemon Configuration Files ──────────────────
            "3.1" => {
                let path = find_docker_service_path();
                Ok(check_ownership_rule(rule, path.as_deref(), 0, 0, "root", "root"))
            }
            "3.2" => {
                let path = find_docker_service_path();
                Ok(check_permission_rule(rule, path.as_deref(), 0o644))
            }
            "3.5" => Ok(check_ownership_rule(
                rule,
                Some(Path::new("/etc/docker")),
                0,
                0,
                "root",
                "root",
            )),
            "3.6" => Ok(check_permission_rule(
                rule,
                Some(Path::new("/etc/docker")),
                0o755,
            )),
            "3.15" => {
                let docker_gid = get_group_gid("docker").unwrap_or(u32::MAX);
                Ok(check_ownership_rule(
                    rule,
                    Some(Path::new("/var/run/docker.sock")),
                    0,
                    docker_gid,
                    "root",
                    "docker",
                ))
            }
            "3.16" => Ok(check_permission_rule(
                rule,
                Some(Path::new("/var/run/docker.sock")),
                0o660,
            )),
            "3.17" => {
                let path = Path::new("/etc/docker/daemon.json");
                if !path.exists() {
                    return Ok(CheckResult {
                        rule: rule.clone(),
                        status: CheckStatus::Pass,
                        message: "daemon.json does not exist; default settings in use.".to_string(),
                        affected: vec![],
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("stat -c %U:%G /etc/docker/daemon.json".to_string()),
                        raw_output: Some("file not found".to_string()),
                    });
                }
                Ok(check_ownership_rule(rule, Some(path), 0, 0, "root", "root"))
            }
            "3.18" => {
                let path = Path::new("/etc/docker/daemon.json");
                if !path.exists() {
                    return Ok(CheckResult {
                        rule: rule.clone(),
                        status: CheckStatus::Pass,
                        message: "daemon.json does not exist; default settings in use.".to_string(),
                        affected: vec![],
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("stat -c %a /etc/docker/daemon.json".to_string()),
                        raw_output: Some("file not found".to_string()),
                    });
                }
                Ok(check_permission_rule(rule, Some(path), 0o644))
            }

            // ── Section 5: Container Runtime ──────────────────────────────────
            "5.2" => {
                self.check_container_rule(rule, containers, |config| {
                    config.security_opt.as_ref().is_some_and(|opts| {
                        opts.iter().any(|opt| {
                            opt.starts_with("apparmor=") && opt != "apparmor=unconfined"
                        })
                    })
                })
                .await
            }
            "5.3" => {
                self.check_container_rule(rule, containers, |config| {
                    config.security_opt.as_ref().is_some_and(|opts| {
                        opts.iter().any(|opt| opt.starts_with("label="))
                    })
                })
                .await
            }
            "5.4" => {
                self.check_container_rule(rule, containers, |config| {
                    config.cap_add.as_ref().is_none_or(|caps| caps.is_empty())
                })
                .await
            }
            "5.5" => {
                self.check_container_rule(rule, containers, |config| {
                    !config.privileged.unwrap_or(false)
                })
                .await
            }
            "5.6" => {
                self.check_container_rule(rule, containers, |config| {
                    let binds = config.binds.as_deref().unwrap_or(&[]);
                    !binds.iter().any(|bind| {
                        let src = bind.split(':').next().unwrap_or("");
                        SENSITIVE_HOST_DIRS.contains(&src)
                    })
                })
                .await
            }
            "5.8" => {
                self.check_container_rule(rule, containers, |config| {
                    config.port_bindings.as_ref().is_none_or(|bindings| {
                        !bindings.values().any(|ports| {
                            ports.as_ref().is_some_and(|ps| {
                                ps.iter().any(|p| {
                                    p.host_port
                                        .as_deref()
                                        .and_then(|port| port.parse::<u16>().ok())
                                        .is_some_and(|n| n > 0 && n < 1024)
                                })
                            })
                        })
                    })
                })
                .await
            }
            "5.10" => {
                self.check_container_rule(rule, containers, |config| {
                    config.network_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.11" => {
                self.check_container_rule(rule, containers, |config| {
                    config.memory.unwrap_or(0) > 0
                })
                .await
            }
            "5.12" => {
                self.check_container_rule(rule, containers, |config| {
                    let shares = config.cpu_shares.unwrap_or(0);
                    shares != 0 && shares != 1024
                })
                .await
            }
            "5.13" => {
                self.check_container_rule(rule, containers, |config| {
                    config.readonly_rootfs.unwrap_or(false)
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
            "5.22" => {
                self.check_container_rule(rule, containers, |config| {
                    config.security_opt.as_ref().is_none_or(|opts| {
                        !opts.iter().any(|opt| opt == "seccomp=unconfined")
                    })
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
            "5.27" => self.check_health_rule(rule, containers).await,
            "5.29" => {
                self.check_container_rule(rule, containers, |config| {
                    config.pids_limit.unwrap_or(0) > 0
                })
                .await
            }
            "5.31" => {
                self.check_container_rule(rule, containers, |config| {
                    config.userns_mode.as_deref() != Some("host")
                })
                .await
            }
            "5.32" => {
                self.check_container_rule(rule, containers, |config| {
                    let binds = config.binds.as_deref().unwrap_or(&[]);
                    !binds.iter().any(|bind| {
                        bind.split(':').next().unwrap_or("") == "/var/run/docker.sock"
                    })
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

    // ── Section 2 ─────────────────────────────────────────────────────────────

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
                "Default cgroup-parent is in use (no custom cgroup-parent configured)."
                    .to_string(),
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

    // ── Section 5 helpers ─────────────────────────────────────────────────────

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

    async fn check_health_rule(
        &self,
        rule: &CisRule,
        containers: &[bollard::models::ContainerSummary],
    ) -> eyre::Result<CheckResult> {
        let mut affected = Vec::new();
        let mut raw_parts: Vec<serde_json::Value> = Vec::new();

        for container in containers {
            if let Some(id) = &container.id
                && let Ok(details) = self.docker.inspect_container(id, None).await
            {
                let name = details
                    .name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string());
                let healthcheck = details
                    .config
                    .as_ref()
                    .and_then(|c| c.healthcheck.as_ref());

                let has_healthcheck = healthcheck.is_some_and(|h| {
                    h.test.as_ref().is_some_and(|t| {
                        !t.is_empty() && t.first().map(|s| s.as_str()) != Some("NONE")
                    })
                });

                raw_parts.push(serde_json::json!({
                    "name": name.trim_start_matches('/'),
                    "healthcheck": healthcheck
                }));

                if !has_healthcheck {
                    affected.push(name.trim_start_matches('/').to_string());
                }
            }
        }

        let passed = affected.is_empty();
        Ok(CheckResult {
            rule: rule.clone(),
            status: if passed {
                CheckStatus::Pass
            } else {
                CheckStatus::Fail
            },
            message: if passed {
                "All containers have health checks configured".to_string()
            } else {
                format!("{} container(s) missing health check", affected.len())
            },
            affected,
            remediation_kind: RemediationKind::Guided,
            audit_command: Some(
                "docker inspect $(docker ps -q) --format '{{json .Config.Healthcheck}}'"
                    .to_string(),
            ),
            raw_output: Some(serde_json::to_string_pretty(&raw_parts).unwrap_or_default()),
        })
    }

    // ── Shared helpers ────────────────────────────────────────────────────────

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

// ── Section 3: file-system checks (free functions) ────────────────────────────

const SENSITIVE_HOST_DIRS: &[&str] = &[
    "/", "/boot", "/dev", "/etc", "/lib", "/proc", "/sys", "/usr",
];

/// Check that `path` is owned by `expected_uid`:`expected_gid`.
fn check_ownership_rule(
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
fn check_permission_rule(rule: &CisRule, path: Option<&Path>, max_mode: u32) -> CheckResult {
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

fn stat_ownership(path: &Path) -> Option<(u32, u32)> {
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

fn stat_mode(path: &Path) -> Option<u32> {
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

fn find_docker_service_path() -> Option<PathBuf> {
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

fn get_group_gid(name: &str) -> Option<u32> {
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
