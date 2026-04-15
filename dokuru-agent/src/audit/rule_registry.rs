// Registry for all CIS Docker Benchmark rules
use super::rule_definition::RuleDefinition;
use super::types::*;
use bollard::Docker;
use chrono::Utc;
use eyre::Result;
use std::collections::HashMap;

mod section2;

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
