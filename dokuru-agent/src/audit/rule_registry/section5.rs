// Section 5: Container Runtime Configuration
// Namespace & Cgroup rules — CIS Docker Benchmark v1.8.0
use super::RuleDefinition;
use crate::audit::{
    fix_helpers,
    types::{CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity},
};

const RULE_5_5_GUIDE: &str = r"Recreate the container without --privileged.

Example (incorrect — avoid):
  docker run --privileged nginx

Example (correct):
  docker run nginx

If specific kernel capabilities are required, grant only the minimum capability with --cap-add instead of enabling full privileged mode.";

const RULE_5_10_GUIDE: &str = r"Do not pass --network=host when starting containers.
Use the default bridge network or a custom user-defined network instead.
Dokuru will stop, recreate and restart the container without --network=host.

Example (correct):
  docker run -p 8080:80 nginx

Example (incorrect — avoid):
  docker run --network=host nginx";

const RULE_5_11_GUIDE: &str = r"Set a memory limit when starting containers using --memory flag.

Dokuru can apply this live with Docker update using a default 256 MiB limit.

Example:
  docker update --memory=256m <container>
  docker run --memory=512m nginx

Or in docker-compose.yml:
  services:
    app:
      mem_limit: 512m";

const RULE_5_12_GUIDE: &str = r"Set CPU shares when starting containers using --cpu-shares flag.
Dokuru can apply this live with Docker update using a default value of 512.

Default value is 1024. Higher values = higher priority.

Example:
  docker update --cpu-shares=512 <container>
  docker run --cpu-shares=512 nginx    # half priority
  docker run --cpu-shares=1024 nginx   # normal priority
  docker run --cpu-shares=2048 app     # double priority

Or in docker-compose.yml:
  services:
    app:
      cpu_shares: 512";

const RULE_5_16_GUIDE: &str = r"Do not pass --pid=host when starting containers.
By default containers get their own isolated PID namespace.
Dokuru will stop, recreate and restart the container without --pid=host.

Example (incorrect — avoid):
  docker run --pid=host nginx

To inspect processes in a container, use docker exec instead:
  docker exec -it <container> ps aux";

const RULE_5_17_GUIDE: &str = r"Do not pass --ipc=host when starting containers.
Use private IPC namespace (default) or shareable between specific containers.
Dokuru will stop, recreate and restart the container with --ipc=private.

Example (incorrect — avoid):
  docker run --ipc=host nginx

Example (acceptable for inter-container sharing):
  docker run --ipc=shareable app1
  docker run --ipc=container:app1 app2";

const RULE_5_21_GUIDE: &str = r"Do not pass --uts=host when starting containers.
Dokuru will stop, recreate and restart the container without --uts=host.

Example (incorrect — avoid):
  docker run --uts=host nginx

By default, each container gets its own UTS namespace with an isolated hostname.";

const RULE_5_25_GUIDE: &str = r"Ensure containers run with at least one cgroup resource limit.
Setting memory, CPU, or PIDs limits activates proper cgroup confinement.

Example:
  docker run --memory=256m --cpu-shares=512 --pids-limit=100 nginx";

const RULE_5_29_GUIDE: &str = r"Set a PIDs limit when starting containers using --pids-limit flag.
Dokuru can apply this live with Docker update using a default limit of 100.

Example:
  docker update --pids-limit=100 <container>
  docker run --pids-limit=100 nginx

Or in docker-compose.yml:
  services:
    app:
      pids_limit: 100

A reasonable value for most workloads is 50-200.";

const RULE_5_31_GUIDE: &str = r#"Do not pass --userns=host when starting containers.
This flag disables user namespace remapping and gives the container root = host root.
Dokuru will stop, recreate and restart the container without --userns=host.

Note: rule 2.10 can pass while this rule still fails. Rule 2.10 checks that the Docker daemon supports/remaps user namespaces globally; rule 5.31 checks each running container and fails any container that explicitly opts out with userns=host.

Example (incorrect — avoid):
  docker run --userns=host nginx

To enable user namespace remapping globally (recommended), configure the Docker daemon:
  /etc/docker/daemon.json:
  {
    "userns-remap": "default"
  }
Then restart Docker: sudo systemctl restart docker"#;

pub struct Section5;

impl Section5 {
    pub fn rules() -> Vec<RuleDefinition> {
        vec![
            Self::rule_5_5(),
            Self::rule_5_10(),
            Self::rule_5_11(),
            Self::rule_5_12(),
            Self::rule_5_16(),
            Self::rule_5_17(),
            Self::rule_5_21(),
            Self::rule_5_25(),
            Self::rule_5_29(),
            Self::rule_5_31(),
        ]
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    fn inspect_command(field: &str, label: &str) -> String {
        format!(
            r#"docker ps --format "{{{{.ID}}}} {{{{.Names}}}}" | while read -r id name; do value=$(docker inspect --format "{{{{ {field} }}}}" "$id"); printf "%s: {label}=%s\n" "$name" "$value"; done"#,
        )
    }

    fn container_name(names: Option<&Vec<String>>, id: &str) -> String {
        names.and_then(|n| n.first()).map_or_else(
            || id.chars().take(12).collect(),
            |s| s.trim_start_matches('/').to_string(),
        )
    }

    fn no_running_containers_result(
        id: &str,
        title: &str,
        category: RuleCategory,
        severity: Severity,
        description: &str,
        remediation: &str,
        remediation_kind: RemediationKind,
    ) -> CheckResult {
        CheckResult {
            rule: CisRule {
                id: id.into(),
                title: title.into(),
                category,
                severity,
                section: "Container Runtime".into(),
                description: description.into(),
                remediation: remediation.into(),
            },
            status: CheckStatus::Pass,
            message: "No running containers to check".into(),
            affected: vec![],
            remediation_kind,
            audit_command: None,
            raw_output: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            ..Default::default()
        }
    }

    // ── 5.5 — Privileged Containers ───────────────────────────────────────────

    /// 5.5 - Ensure that privileged containers are not used
    fn rule_5_5() -> RuleDefinition {
        RuleDefinition {
            id: "5.5".into(),
            section: 5,
            title: "Ensure that privileged containers are not used".into(),
            description: "Privileged mode gives a container extended Linux capabilities and broad host device access, weakening the isolation boundary between the container and the host.".into(),

            category: RuleCategory::Runtime,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.Privileged", "Privileged")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(Self::no_running_containers_result(
                            "5.5",
                            "Ensure that privileged containers are not used",
                            RuleCategory::Runtime,
                            Severity::High,
                            "Privileged container runtime flag",
                            "Recreate containers without --privileged",
                            RemediationKind::Auto,
                        ));
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let privileged = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.privileged)
                                .unwrap_or(false);
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: Privileged={privileged}"));
                            if privileged {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.5".into(),
                            title: "Ensure that privileged containers are not used".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "Privileged container runtime flag".into(),
                            remediation: "Recreate containers without --privileged".into(),
                        },
                        status: if failing.is_empty() {
                            CheckStatus::Pass
                        } else {
                            CheckStatus::Fail
                        },
                        message: if failing.is_empty() {
                            "No containers run in privileged mode".into()
                        } else {
                            format!("{} container(s) run in privileged mode", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Auto,
                        audit_command: Some(Self::inspect_command(".HostConfig.Privileged", "Privileged")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                        ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_privileged_fix(&docker, "5.5")).await
                })
            }),
            remediation_guide: RULE_5_5_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.5".into(),
            ],
            rationale: "Privileged containers can access host devices and bypass several default Docker isolation controls, increasing the blast radius of a container compromise.".into(),
            impact: "Workloads that rely on broad host device access must be redesigned to use narrower capabilities or device mappings.".into(),
            tags: vec!["runtime".into(), "privileged".into(), "isolation".into()],
        }
    }

    // ── 5.10 — Network Namespace ──────────────────────────────────────────────

    /// 5.10 - Ensure that the host's network namespace is not shared
    fn rule_5_10() -> RuleDefinition {
        RuleDefinition {
            id: "5.10".into(),
            section: 5,
            title: "Ensure that the host's network namespace is not shared".into(),
            description: "The networking mode on a container when set to 'host' means the container shares the host's network stack. This gives the container full access to all the host's network interfaces.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.NetworkMode", "NetworkMode")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.10".into(),
                                title: "Ensure that the host's network namespace is not shared".into(),
                                category: RuleCategory::Namespace,
                                severity: Severity::High,
                                section: "Container Runtime".into(),
                                description: "Network namespace sharing".into(),
                                remediation: "Do not use --network=host when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let mode = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.network_mode.as_deref())
                                .unwrap_or("bridge");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: NetworkMode={mode}"));
                            if mode == "host" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.10".into(),
                            title: "Ensure that the host's network namespace is not shared".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "Network namespace sharing".into(),
                            remediation: "Do not use --network=host when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers use isolated network namespace".into()
                        } else {
                            format!("{} container(s) share the host network namespace", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.NetworkMode", "NetworkMode")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_namespace_fix(&docker, "5.10")).await
                })
            }),
            remediation_guide: RULE_5_10_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/network/".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.10".into(),
            ],
            rationale: "Sharing the host's network namespace breaks the network isolation between containers and gives a container full access to all host network interfaces, enabling traffic sniffing and other attacks.".into(),
            impact: "Container cannot use host ports directly; explicit port mapping with -p is required.".into(),
            tags: vec!["network".into(), "namespace".into(), "isolation".into()],
        }
    }

    // ── 5.11 — Memory Limit ───────────────────────────────────────────────────

    /// 5.11 - Ensure that the memory usage for containers is limited
    fn rule_5_11() -> RuleDefinition {
        RuleDefinition {
            id: "5.11".into(),
            section: 5,
            title: "Ensure that the memory usage for containers is limited".into(),
            description: "By default, container has no memory limit. A container can use all of the host's memory. This can cause the container to exhaust all available memory on the host.".into(),

            category: RuleCategory::Cgroup,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.Memory", "Memory")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.11".into(),
                                title: "Ensure that the memory usage for containers is limited".into(),
                                category: RuleCategory::Cgroup,
                                severity: Severity::High,
                                section: "Container Runtime".into(),
                                description: "Container memory cgroup limit".into(),
                                remediation: "Set --memory flag when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let memory = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.memory)
                                .unwrap_or(0);
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: Memory={memory}"));
                            if memory == 0 {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.11".into(),
                            title: "Ensure that the memory usage for containers is limited".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "Container memory cgroup limit".into(),
                            remediation: "Set --memory flag when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have memory limits configured".into()
                        } else {
                            format!("{} container(s) have no memory limit", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.Memory", "Memory")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    fix_helpers::apply_default_cgroup_resource_fix(&docker, "5.11").await
                })
            }),
            remediation_guide: RULE_5_11_GUIDE.into(),
            requires_restart: false,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/config/containers/resource_constraints/".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.11".into(),
            ],
            rationale: "Setting memory limits prevents a single container from exhausting all host memory, protecting other containers and the host from denial-of-service conditions.".into(),
            impact: "Container may be OOM-killed if it exceeds the configured limit.".into(),
            tags: vec!["cgroup".into(), "memory".into(), "resource-limit".into()],
        }
    }

    // ── 5.12 — CPU Shares ─────────────────────────────────────────────────────

    /// 5.12 - Ensure that CPU priority is set appropriately on containers
    fn rule_5_12() -> RuleDefinition {
        RuleDefinition {
            id: "5.12".into(),
            section: 5,
            title: "Ensure that CPU priority is set appropriately on containers".into(),
            description: "By default, all containers on a host get an equal share of the CPU cycles. CPU shares can be configured to prioritize containers that need more CPU time.".into(),

            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.CpuShares", "CpuShares")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.12".into(),
                                title: "Ensure that CPU priority is set appropriately on containers".into(),
                                category: RuleCategory::Cgroup,
                                severity: Severity::Medium,
                                section: "Container Runtime".into(),
                                description: "Container CPU cgroup shares".into(),
                                remediation: "Set --cpu-shares flag when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            // Default is 0 (equal share, not explicitly set)
                            let cpu_shares = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.cpu_shares)
                                .unwrap_or(0);
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: CpuShares={cpu_shares}"));
                            if cpu_shares == 0 {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.12".into(),
                            title: "Ensure that CPU priority is set appropriately on containers".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::Medium,
                            section: "Container Runtime".into(),
                            description: "Container CPU cgroup shares".into(),
                            remediation: "Set --cpu-shares flag when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have CPU shares configured".into()
                        } else {
                            format!("{} container(s) have no CPU shares set", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.CpuShares", "CpuShares")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    fix_helpers::apply_default_cgroup_resource_fix(&docker, "5.12").await
                })
            }),
            remediation_guide: RULE_5_12_GUIDE.into(),
            requires_restart: false,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/config/containers/resource_constraints/".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.12".into(),
            ],
            rationale: "Explicitly setting CPU shares ensures no single container can starve others of CPU time under load, improving overall system stability and security.".into(),
            impact: "CPU scheduling behavior changes when shares are set explicitly.".into(),
            tags: vec!["cgroup".into(), "cpu".into(), "resource-limit".into()],
        }
    }

    // ── 5.16 — PID Namespace ──────────────────────────────────────────────────

    /// 5.16 - Ensure that the host's process namespace is not shared
    fn rule_5_16() -> RuleDefinition {
        RuleDefinition {
            id: "5.16".into(),
            section: 5,
            title: "Ensure that the host's process namespace is not shared".into(),
            description: "Process ID (PID) namespace provides process isolation. If the host's PID namespace is shared with a container, all processes on the host are visible inside the container.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.PidMode", "PidMode")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.16".into(),
                                title: "Ensure that the host's process namespace is not shared".into(),
                                category: RuleCategory::Namespace,
                                severity: Severity::High,
                                section: "Container Runtime".into(),
                                description: "PID namespace isolation".into(),
                                remediation: "Do not use --pid=host when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let pid_mode = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.pid_mode.as_deref())
                                .unwrap_or("");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: PidMode={pid_mode}"));
                            if pid_mode == "host" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.16".into(),
                            title: "Ensure that the host's process namespace is not shared".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "PID namespace isolation".into(),
                            remediation: "Do not use --pid=host when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers use isolated PID namespace".into()
                        } else {
                            format!("{} container(s) share the host PID namespace", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.PidMode", "PidMode")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_namespace_fix(&docker, "5.16")).await
                })
            }),
            remediation_guide: RULE_5_16_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/reference/run/#pid-settings".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.16".into(),
            ],
            rationale: "Sharing the host PID namespace allows processes inside the container to see and interact with all host processes, enabling privilege escalation and information disclosure.".into(),
            impact: "None. Containers work correctly without sharing the host PID namespace.".into(),
            tags: vec!["namespace".into(), "pid".into(), "isolation".into()],
        }
    }

    // ── 5.17 — IPC Namespace ──────────────────────────────────────────────────

    /// 5.17 - Ensure that the host's IPC namespace is not shared
    fn rule_5_17() -> RuleDefinition {
        RuleDefinition {
            id: "5.17".into(),
            section: 5,
            title: "Ensure that the host's IPC namespace is not shared".into(),
            description: "IPC (POSIX/SysV IPC) namespace provides isolation for shared memory segments, semaphores, and message queues. Sharing the host IPC namespace removes this isolation.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.IpcMode", "IpcMode")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.17".into(),
                                title: "Ensure that the host's IPC namespace is not shared".into(),
                                category: RuleCategory::Namespace,
                                severity: Severity::High,
                                section: "Container Runtime".into(),
                                description: "IPC namespace isolation".into(),
                                remediation: "Do not use --ipc=host when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let ipc_mode = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.ipc_mode.as_deref())
                                .unwrap_or("private");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: IpcMode={ipc_mode}"));
                            if ipc_mode == "host" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.17".into(),
                            title: "Ensure that the host's IPC namespace is not shared".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "IPC namespace isolation".into(),
                            remediation: "Do not use --ipc=host when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers use isolated IPC namespace".into()
                        } else {
                            format!("{} container(s) share the host IPC namespace", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.IpcMode", "IpcMode")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_namespace_fix(&docker, "5.17")).await
                })
            }),
            remediation_guide: RULE_5_17_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/reference/run/#ipc-settings".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.17".into(),
            ],
            rationale: "Sharing the host IPC namespace allows a container to access shared memory of host processes, enabling data leakage and attacks via shared memory.".into(),
            impact: "None. Applications that genuinely require host IPC should be documented as exceptions.".into(),
            tags: vec!["namespace".into(), "ipc".into(), "isolation".into()],
        }
    }

    // ── 5.21 — UTS Namespace ──────────────────────────────────────────────────

    /// 5.21 - Ensure that the host's UTS namespace is not shared
    fn rule_5_21() -> RuleDefinition {
        RuleDefinition {
            id: "5.21".into(),
            section: 5,
            title: "Ensure that the host's UTS namespace is not shared".into(),
            description: "UTS namespace provides isolation of two system identifiers: the hostname and the NIS domain name. Sharing the host UTS namespace allows the container to change the host's hostname.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.UTSMode", "UTSMode")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.21".into(),
                                title: "Ensure that the host's UTS namespace is not shared".into(),
                                category: RuleCategory::Namespace,
                                severity: Severity::Medium,
                                section: "Container Runtime".into(),
                                description: "UTS namespace isolation".into(),
                                remediation: "Do not use --uts=host when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let uts_mode = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.uts_mode.as_deref())
                                .unwrap_or("");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: UTSMode={uts_mode}"));
                            if uts_mode == "host" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.21".into(),
                            title: "Ensure that the host's UTS namespace is not shared".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::Medium,
                            section: "Container Runtime".into(),
                            description: "UTS namespace isolation".into(),
                            remediation: "Do not use --uts=host when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers use isolated UTS namespace".into()
                        } else {
                            format!("{} container(s) share the host UTS namespace", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.UTSMode", "UTSMode")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_namespace_fix(&docker, "5.21")).await
                })
            }),
            remediation_guide: RULE_5_21_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/reference/run/#uts-settings".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.21".into(),
            ],
            rationale: "Sharing the host UTS namespace allows a container to change the hostname and domain name of the host, which can affect logging and network service identification.".into(),
            impact: "None. Containers work correctly without sharing the host UTS namespace.".into(),
            tags: vec!["namespace".into(), "uts".into(), "hostname".into(), "isolation".into()],
        }
    }

    // ── 5.25 — Cgroup Usage per Container ─────────────────────────────────────

    /// 5.25 - Ensure that cgroup usage is confirmed
    fn rule_5_25() -> RuleDefinition {
        RuleDefinition {
            id: "5.25".into(),
            section: 5,
            title: "Ensure that cgroup usage is confirmed".into(),
            description: "It is important to confirm that cgroup confinement is working correctly for each container to ensure resource limits and isolation policies are enforced.".into(),

            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.CgroupParent", "CgroupParent")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(Self::no_running_containers_result(
                            "5.25",
                            "Ensure that cgroup usage is confirmed",
                            RuleCategory::Cgroup,
                            Severity::Medium,
                            "Container cgroup confinement",
                            "Ensure containers are running under proper cgroup hierarchy",
                            RemediationKind::Manual,
                        ));
                    }

                    // A container has proper cgroup confinement if it has at least one
                    // resource limit configured (memory OR cpu OR pids) OR runs under
                    // a non-default cgroup parent
                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await
                            && let Some(hc) = &inspect.host_config {
                                let memory = hc.memory.unwrap_or(0);
                                let cpu_shares = hc.cpu_shares.unwrap_or(0);
                                let pids_limit = hc.pids_limit.unwrap_or(0);
                                let cgroup_parent = hc.cgroup_parent.as_deref().unwrap_or("");

                                let has_limits = memory > 0
                                    || cpu_shares > 0
                                    || pids_limit > 0
                                    || !cgroup_parent.is_empty();

                                let name = Self::container_name(c.names.as_ref(), id);
                                raw_lines.push(format!(
                                    "{name}: Memory={memory} CpuShares={cpu_shares} PidsLimit={pids_limit} CgroupParent={cgroup_parent}"
                                ));

                                if !has_limits {
                                    failing.push(name);
                                }
                            }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.25".into(),
                            title: "Ensure that cgroup usage is confirmed".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::Medium,
                            section: "Container Runtime".into(),
                            description: "Container cgroup confinement".into(),
                            remediation: "Set at least one resource limit (--memory, --cpu-shares, or --pids-limit)".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have cgroup resource limits configured".into()
                        } else {
                            format!("{} container(s) have no cgroup resource limits", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.CgroupParent", "CgroupParent")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    fix_helpers::apply_default_cgroup_resource_fix(&docker, "5.25").await
                })
            }),
            remediation_guide: RULE_5_25_GUIDE.into(),
            requires_restart: false,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/config/containers/resource_constraints/".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.25".into(),
            ],
            rationale: "Containers without any cgroup limits can consume unlimited host resources, leading to denial-of-service and impacting other containers on the same host.".into(),
            impact: "Containers may be killed or throttled when they reach configured limits.".into(),
            tags: vec!["cgroup".into(), "resource-limit".into(), "isolation".into()],
        }
    }

    // ── 5.29 — PIDs Limit ────────────────────────────────────────────────────

    /// 5.29 - Ensure that the PIDs cgroup limit is used
    fn rule_5_29() -> RuleDefinition {
        RuleDefinition {
            id: "5.29".into(),
            section: 5,
            title: "Ensure that the PIDs cgroup limit is used".into(),
            description: "Without a PID limit, a single container can fork an unlimited number of processes, leading to a fork bomb that exhausts the host's process table.".into(),

            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.PidsLimit", "PidsLimit")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.29".into(),
                                title: "Ensure that the PIDs cgroup limit is used".into(),
                                category: RuleCategory::Cgroup,
                                severity: Severity::Medium,
                                section: "Container Runtime".into(),
                                description: "Container PIDs cgroup limit".into(),
                                remediation: "Set --pids-limit flag when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            // 0 or -1 means no limit
                            let pids_limit = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.pids_limit)
                                .unwrap_or(0);
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: PidsLimit={pids_limit}"));
                            if pids_limit <= 0 {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.29".into(),
                            title: "Ensure that the PIDs cgroup limit is used".into(),
                            category: RuleCategory::Cgroup,
                            severity: Severity::Medium,
                            section: "Container Runtime".into(),
                            description: "Container PIDs cgroup limit".into(),
                            remediation: "Set --pids-limit flag when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have PIDs limit configured".into()
                        } else {
                            format!("{} container(s) have no PIDs limit", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.PidsLimit", "PidsLimit")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    fix_helpers::apply_default_cgroup_resource_fix(&docker, "5.29").await
                })
            }),
            remediation_guide: RULE_5_29_GUIDE.into(),
            requires_restart: false,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/reference/run/#runtime-constraints-on-resources".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.29".into(),
            ],
            rationale: "Without a PIDs limit, a process inside the container can create a fork bomb (infinite process spawning), exhausting the host's process table and causing a denial-of-service.".into(),
            impact: "Container processes may be killed if they exceed the PIDs limit.".into(),
            tags: vec!["cgroup".into(), "pids".into(), "fork-bomb".into(), "resource-limit".into()],
        }
    }

    // ── 5.31 — User Namespace per Container ───────────────────────────────────

    /// 5.31 - Ensure that the host's user namespaces are not shared
    fn rule_5_31() -> RuleDefinition {
        RuleDefinition {
            id: "5.31".into(),
            section: 5,
            title: "Ensure that the host's user namespaces are not shared".into(),
            description: "User namespaces provide isolation of user and group IDs. Sharing the host user namespace means the container's root is the same as the host's root, which is a significant security risk.".into(),

            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,

            audit_command: Some(Self::inspect_command(".HostConfig.UsernsMode", "UsernsMode")),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(CheckResult {
                            rule: CisRule {
                                id: "5.31".into(),
                                title: "Ensure that the host's user namespaces are not shared".into(),
                                category: RuleCategory::Namespace,
                                severity: Severity::High,
                                section: "Container Runtime".into(),
                                description: "User namespace isolation per container".into(),
                                remediation: "Do not use --userns=host when starting containers".into(),
                            },
                            status: CheckStatus::Pass,
                            message: "No running containers to check".into(),
                            affected: vec![],
                            remediation_kind: RemediationKind::Manual,
                            audit_command: None,
                            raw_output: None,
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                        });
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let userns_mode = inspect
                                .host_config
                                .as_ref()
                                .and_then(|h| h.userns_mode.as_deref())
                                .unwrap_or("");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: UsernsMode={userns_mode}"));
                            if userns_mode == "host" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "5.31".into(),
                            title: "Ensure that the host's user namespaces are not shared".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Container Runtime".into(),
                            description: "User namespace isolation per container".into(),
                            remediation: "Do not use --userns=host when starting containers".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have isolated user namespaces".into()
                        } else {
                            format!("{} container(s) share the host user namespace", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some(Self::inspect_command(".HostConfig.UsernsMode", "UsernsMode")),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                ..Default::default()
                    })
                })
            },

            remediation_kind: RemediationKind::Auto,
            fix_fn: Some(|docker| {
                let docker = docker.clone();
                Box::pin(async move {
                    Box::pin(fix_helpers::apply_namespace_fix(&docker, "5.31")).await
                })
            }),
            remediation_guide: RULE_5_31_GUIDE.into(),
            requires_restart: true,
            requires_elevation: false,

            references: vec![
                "https://docs.docker.com/engine/security/userns-remap/".into(),
                "CIS Docker Benchmark v1.8.0, Section 5.31".into(),
            ],
            rationale: "Using --userns=host disables user namespace isolation, making container root equivalent to host root. This nullifies the security benefit of user namespace remapping configured at the daemon level.".into(),
            impact: "None. Containers work correctly without sharing the host user namespace.".into(),
            tags: vec!["namespace".into(), "user".into(), "root".into(), "isolation".into()],
        }
    }
}
