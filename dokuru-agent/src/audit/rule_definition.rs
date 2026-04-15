// Data-driven rule definition - self-contained with all metadata
use super::types::*;
use bollard::Docker;
use eyre::Result;
use std::future::Future;
use std::pin::Pin;

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
