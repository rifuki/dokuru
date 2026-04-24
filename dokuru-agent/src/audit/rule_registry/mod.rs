// Registry for all CIS Docker Benchmark rules
use super::types::{
    AuditReport, AuditSummary, CheckResult, CheckStatus, FixOutcome, FixStatus, RemediationKind,
    RuleCategory, Severity,
};
use bollard::Docker;
use chrono::Utc;
use eyre::Result;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

mod section1;
mod section2;
mod section3;
mod section4;
mod section5;

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
        let mut result = (self.check_fn)(docker, containers).await?;

        // Enrich result with rule metadata
        result.rule.id.clone_from(&self.id);
        result.rule.title.clone_from(&self.title);
        result.rule.category = self.category.clone();
        result.rule.severity = self.severity.clone();
        result.rule.section = section_name(self.section).to_string();
        result.rule.description.clone_from(&self.description);
        result.audit_command.clone_from(&self.audit_command);
        result.references = Some(self.references.clone());
        result.rationale = Some(self.rationale.clone());
        result.impact = Some(self.impact.clone());
        result.tags = Some(self.tags.clone());
        // Always use definition-level remediation_kind so FE knows if auto-fix is available
        result.remediation_kind = self.remediation_kind.clone();
        result.remediation_guide = Some(self.remediation_guide.clone());

        Ok(result)
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

        // Register all sections
        for rule in section1::Section1::rules() {
            rules.insert(rule.id.clone(), rule);
        }
        for rule in section2::Section2::rules() {
            rules.insert(rule.id.clone(), rule);
        }
        for rule in section3::Section3::rules() {
            rules.insert(rule.id.clone(), rule);
        }
        for rule in section4::Section4::rules() {
            rules.insert(rule.id.clone(), rule);
        }
        for rule in section5::Section5::rules() {
            rules.insert(rule.id.clone(), rule);
        }

        Self { rules }
    }

    pub fn get(&self, rule_id: &str) -> Option<&RuleDefinition> {
        self.rules.get(rule_id)
    }

    pub fn all(&self) -> Vec<&RuleDefinition> {
        self.rules.values().collect()
    }

    /// Run full audit - check all rules
    pub async fn run_audit(&self, docker: &Docker) -> Result<AuditReport> {
        let info = docker.info().await?;
        let version = docker.version().await?;
        let containers = docker.list_containers::<String>(None).await?;

        let mut results = Vec::new();
        let mut passed = 0;
        let mut failed = 0;

        for rule_def in self.all() {
            let result = rule_def.check(docker, &containers).await?;
            if rule_def.scored {
                match result.status {
                    CheckStatus::Pass => passed += 1,
                    CheckStatus::Fail => failed += 1,
                    CheckStatus::Error => {}
                }
            }
            results.push(result);
        }

        let score = score_percentage(passed, passed + failed);

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

fn score_percentage(passed: usize, total: usize) -> u8 {
    if total == 0 {
        return 0;
    }

    let percent = passed.saturating_mul(100) / total;
    u8::try_from(percent).unwrap_or(100)
}

const fn section_name(section: u8) -> &'static str {
    match section {
        1 => "Host Configuration",
        2 => "Docker Daemon Configuration",
        3 => "Docker Daemon Configuration Files",
        4 => "Container Images and Build Files",
        5 => "Container Runtime",
        _ => "Unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn score_percentage_is_integer_and_saturating() {
        assert_eq!(score_percentage(0, 0), 0);
        assert_eq!(score_percentage(1, 2), 50);
        assert_eq!(score_percentage(2, 3), 66);
        assert_eq!(score_percentage(usize::MAX, 1), 100);
    }

    #[test]
    fn section_name_maps_known_cis_sections() {
        assert_eq!(section_name(1), "Host Configuration");
        assert_eq!(section_name(5), "Container Runtime");
        assert_eq!(section_name(99), "Unknown");
    }
}

impl Default for RuleRegistry {
    fn default() -> Self {
        Self::new()
    }
}
