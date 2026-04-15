// Registry for all CIS Docker Benchmark rules
use super::types::*;
use bollard::Docker;
use chrono::Utc;
use eyre::Result;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

mod section2;

// ── Rule Definition ──────────────────────────────────────────────────────────

pub type CheckFn = fn(
    &Docker,
    &[bollard::models::ContainerSummary],
) -> Pin<Box<dyn Future<Output = Result<CheckResult>> + Send>>;
pub type FixFn = fn(&Docker) -> Pin<Box<dyn Future<Output = Result<FixOutcome>> + Send>>;

/// Self-contained rule definition with metadata + logic
pub struct RuleDefinition {
    // Identity
    pub id: String,
    pub section: u8,
    pub title: String,
    pub description: String,

    // Classification
    pub category: RuleCategory,
    pub severity: Severity,
    pub scored: bool,

    // Audit
    pub audit_command: Option<String>,
    pub check_fn: CheckFn,

    // Remediation
    pub remediation_kind: RemediationKind,
    pub fix_fn: Option<FixFn>,
    pub remediation_guide: String,
    pub requires_restart: bool,
    pub requires_elevation: bool,

    // Documentation
    pub references: Vec<String>,
    pub rationale: String,
    pub impact: String,

    // Metadata
    pub tags: Vec<String>,
}

impl RuleDefinition {
    /// Execute check for this rule
    pub async fn check(
        &self,
        docker: &Docker,
        containers: &[bollard::models::ContainerSummary],
    ) -> Result<CheckResult> {
        (self.check_fn)(docker, containers).await
    }

    /// Execute fix for this rule
    pub async fn fix(&self, docker: &Docker) -> Result<FixOutcome> {
        match self.fix_fn {
            Some(fix) => fix(docker).await,
            None => Ok(FixOutcome {
                rule_id: self.id.clone(),
                status: FixStatus::Guided,
                message: "Manual fix required - see remediation guide".to_string(),
                requires_restart: self.requires_restart,
                restart_command: None,
                requires_elevation: self.requires_elevation,
            }),
        }
    }
}

// ── Rule Registry ────────────────────────────────────────────────────────────

pub struct RuleRegistry {
    rules: HashMap<String, RuleDefinition>,
}

impl RuleRegistry {
    pub fn new() -> Self {
        let mut rules = HashMap::new();

        // Register Section 2 rules
        rules.insert("2.10".into(), section2::rule_2_10());
        rules.insert("2.11".into(), section2::rule_2_11());

        Self { rules }
    }

    pub fn get(&self, rule_id: &str) -> Option<&RuleDefinition> {
        self.rules.get(rule_id)
    }

    pub fn all(&self) -> Vec<&RuleDefinition> {
        self.rules.values().collect()
    }

    pub fn by_section(&self, section: u8) -> Vec<&RuleDefinition> {
        self.rules
            .values()
            .filter(|r| r.section == section)
            .collect()
    }

    pub fn by_severity(&self, severity: Severity) -> Vec<&RuleDefinition> {
        self.rules
            .values()
            .filter(|r| r.severity == severity)
            .collect()
    }

    /// Run full audit - check all rules
    pub async fn run_audit(&self, docker: &Docker) -> Result<AuditReport> {
        let info = docker.info().await?;
        let version = docker.version().await?;
        let containers = docker.list_containers::<String>(None).await?;

        let mut results = Vec::new();
        for rule_def in self.all() {
            let result = rule_def.check(docker, &containers).await?;
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
            total_containers: containers.len(),
            results,
            summary: AuditSummary {
                total: passed + failed,
                passed,
                failed,
                score,
            },
        })
    }

    /// Check single rule by ID
    pub async fn check_rule(&self, rule_id: &str, docker: &Docker) -> Result<CheckResult> {
        let rule_def = self
            .get(rule_id)
            .ok_or_else(|| eyre::eyre!("Rule {} not found", rule_id))?;
        let containers = docker.list_containers::<String>(None).await?;
        rule_def.check(docker, &containers).await
    }

    /// Fix single rule by ID
    pub async fn fix_rule(&self, rule_id: &str, docker: &Docker) -> Result<FixOutcome> {
        let rule_def = self
            .get(rule_id)
            .ok_or_else(|| eyre::eyre!("Rule {} not found", rule_id))?;
        rule_def.fix(docker).await
    }
}

impl Default for RuleRegistry {
    fn default() -> Self {
        Self::new()
    }
}
