// Section 4: Container Images and Build File Configuration
// CIS Docker Benchmark v1.8.0
use super::RuleDefinition;
use crate::audit::types::{
    CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity,
};

pub struct Section4;

impl Section4 {
    pub fn rules() -> Vec<RuleDefinition> {
        vec![Self::rule_4_1(), Self::rule_4_6()]
    }

    fn container_name(names: Option<&Vec<String>>, id: &str) -> String {
        names.and_then(|n| n.first()).map_or_else(
            || id.chars().take(12).collect(),
            |s| s.trim_start_matches('/').to_string(),
        )
    }

    fn empty_result(
        id: &str,
        title: &str,
        category: RuleCategory,
        severity: Severity,
    ) -> CheckResult {
        CheckResult {
            rule: CisRule {
                id: id.into(),
                title: title.into(),
                category,
                severity,
                section: "Container Images".into(),
                description: String::new(),
                remediation: String::new(),
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
        }
    }

    // ── 4.1 — Non-root user ───────────────────────────────────────────────────

    /// 4.1 - Ensure that a user for the container has been created
    fn rule_4_1() -> RuleDefinition {
        RuleDefinition {
            id: "4.1".into(),
            section: 4,
            title: "Ensure that a user for the container has been created".into(),
            description: "Containers should not run as root. Running as root means the container process has host root privileges if it escapes the namespace.".into(),
            category: RuleCategory::Namespace,
            severity: Severity::High,
            scored: true,
            audit_command: Some("docker ps --quiet | xargs docker inspect --format '{{ .Id }}: User={{ .Config.User }}'".into()),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(Self::empty_result(
                            "4.1",
                            "Ensure that a user for the container has been created",
                            RuleCategory::Namespace,
                            Severity::High,
                        ));
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let user = inspect
                                .config
                                .as_ref()
                                .and_then(|cfg| cfg.user.as_deref())
                                .unwrap_or("");
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: User={user:?}"));
                            // Fail if user is empty, "root", or "0"
                            if user.is_empty() || user == "root" || user == "0" {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "4.1".into(),
                            title: "Ensure that a user for the container has been created".into(),
                            category: RuleCategory::Namespace,
                            severity: Severity::High,
                            section: "Container Images".into(),
                            description: "Non-root user in container".into(),
                            remediation: "Add USER directive to Dockerfile or use --user flag".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers run as non-root user".into()
                        } else {
                            format!("{} container(s) running as root", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("docker inspect --format '{{ .Config.User }}' <container>".into()),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: r"Add a non-root user in your Dockerfile:

  RUN groupadd -r appuser && useradd -r -g appuser appuser
  USER appuser

Or use the --user flag at runtime:
  docker run --user 1000:1000 nginx".into(),
            requires_restart: true,
            requires_elevation: false,
            references: vec![
                "https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#user".into(),
                "CIS Docker Benchmark v1.8.0, Section 4.1".into(),
            ],
            rationale: "Running as root means a container escape gives the attacker full root access on the host, bypassing user namespace protections.".into(),
            impact: "Application must be able to run as non-root. May require file permission adjustments.".into(),
            tags: vec!["namespace".into(), "user".into(), "root".into(), "image".into()],
        }
    }

    // ── 4.6 — HEALTHCHECK ─────────────────────────────────────────────────────

    /// 4.6 - Ensure that HEALTHCHECK instructions have been added to container images
    fn rule_4_6() -> RuleDefinition {
        RuleDefinition {
            id: "4.6".into(),
            section: 4,
            title: "Ensure that HEALTHCHECK instructions have been added to container images".into(),
            description: "HEALTHCHECK allows Docker to test if a container is still working. Without it, Docker cannot automatically detect and restart unhealthy containers.".into(),
            category: RuleCategory::Runtime,
            severity: Severity::Low,
            scored: true,
            audit_command: Some("docker ps --quiet | xargs docker inspect --format '{{ .Id }}: Healthcheck={{ .Config.Healthcheck }}'".into()),
            check_fn: |docker, containers| {
                let docker = docker.clone();
                let containers = containers.to_vec();
                Box::pin(async move {
                    if containers.is_empty() {
                        return Ok(Self::empty_result(
                            "4.6",
                            "Ensure that HEALTHCHECK instructions have been added to container images",
                            RuleCategory::Runtime,
                            Severity::Low,
                        ));
                    }

                    let mut failing = Vec::new();
                    let mut raw_lines = Vec::new();

                    for c in &containers {
                        let id = c.id.as_deref().unwrap_or("");
                        if let Ok(inspect) = docker.inspect_container(id, None).await {
                            let has_healthcheck = inspect
                                .config
                                .as_ref()
                                .and_then(|cfg| cfg.healthcheck.as_ref())
                                .is_some();
                            let name = Self::container_name(c.names.as_ref(), id);
                            raw_lines.push(format!("{name}: Healthcheck={has_healthcheck}"));
                            if !has_healthcheck {
                                failing.push(name);
                            }
                        }
                    }

                    Ok(CheckResult {
                        rule: CisRule {
                            id: "4.6".into(),
                            title: "Ensure that HEALTHCHECK instructions have been added to container images".into(),
                            category: RuleCategory::Runtime,
                            severity: Severity::Low,
                            section: "Container Images".into(),
                            description: "HEALTHCHECK instruction in container image".into(),
                            remediation: "Add HEALTHCHECK to Dockerfile".into(),
                        },
                        status: if failing.is_empty() { CheckStatus::Pass } else { CheckStatus::Fail },
                        message: if failing.is_empty() {
                            "All containers have HEALTHCHECK configured".into()
                        } else {
                            format!("{} container(s) have no HEALTHCHECK", failing.len())
                        },
                        affected: failing,
                        remediation_kind: RemediationKind::Manual,
                        audit_command: Some("docker inspect --format '{{ .Config.Healthcheck }}' <container>".into()),
                        raw_output: Some(raw_lines.join("\n")),
                        references: None,
                        rationale: None,
                        impact: None,
                        tags: None,
                    })
                })
            },
            remediation_kind: RemediationKind::Manual,
            fix_fn: None,
            remediation_guide: r"Add HEALTHCHECK to your Dockerfile:

  HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

Or for non-HTTP services:
  HEALTHCHECK CMD pg_isready -U postgres || exit 1".into(),
            requires_restart: true,
            requires_elevation: false,
            references: vec![
                "https://docs.docker.com/engine/reference/builder/#healthcheck".into(),
                "CIS Docker Benchmark v1.8.0, Section 4.6".into(),
            ],
            rationale: "Without HEALTHCHECK, Docker cannot automatically detect and restart containers that are running but not functioning correctly.".into(),
            impact: "None. Adding HEALTHCHECK only improves container lifecycle management.".into(),
            tags: vec!["image".into(), "healthcheck".into(), "availability".into()],
        }
    }
}
