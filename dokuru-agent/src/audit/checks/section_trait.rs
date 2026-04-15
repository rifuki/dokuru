// Section trait - each CIS section implements its own checks and fixes
//
// Best Practice: Strategy Pattern + Registry
// - Each section is self-contained (checks + fixes + metadata)
// - Polymorphic dispatch via trait
// - Easy to add new sections without modifying checker.rs

use super::super::types::*;
use async_trait::async_trait;
use bollard::Docker;
use eyre::Result;

/// Trait for CIS Docker Benchmark sections
#[async_trait]
pub trait CheckSection: Send + Sync {
    /// Section identifier (e.g., "2", "3", "5")
    fn section_id(&self) -> &str;
    
    /// Check if this section handles the given rule ID
    fn handles(&self, rule_id: &str) -> bool {
        rule_id.starts_with(&format!("{}.", self.section_id()))
    }
    
    /// Run check for a specific rule
    async fn check(
        &self,
        rule: &CisRule,
        docker: &Docker,
        containers: &[bollard::models::ContainerSummary],
    ) -> Result<CheckResult>;
    
    /// Apply fix for a specific rule (optional - not all rules have automated fixes)
    async fn fix(&self, rule_id: &str, docker: &Docker) -> Result<FixOutcome> {
        Ok(FixOutcome {
            rule_id: rule_id.to_string(),
            status: FixStatus::Blocked,
            message: format!("Automated fix not available for rule {}", rule_id),
            requires_restart: false,
            restart_command: None,
            requires_elevation: false,
        })
    }
}
