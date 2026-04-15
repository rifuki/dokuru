// Audit module - CIS Docker Benchmark implementation
//
// Architecture: Data-driven with RuleDefinition
// - Each rule is self-contained struct with metadata + logic
// - RuleRegistry stores all rules
// - Checker is just an executor

// Internal modules
mod checker;
mod fixer;
mod rule_definition;
mod rule_registry;
mod rules;
mod types;

// Public API - expose what's needed
pub use checker::Checker;
pub use fixer::Fixer;
pub use rule_definition::RuleDefinition;
pub use rule_registry::RuleRegistry;
pub use rules::get_all_rules;
pub use types::{AuditReport, CheckResult, CheckStatus, CisRule, FixOutcome, FixStatus};

// Internal use
use bollard::{API_DEFAULT_VERSION, Docker};

/// Run audit and return results (for agent mode)
pub async fn run_audit_report() -> eyre::Result<Vec<CheckResult>> {
    let socket =
        std::env::var("DOCKER_SOCKET").unwrap_or_else(|_| "/var/run/docker.sock".to_string());

    let docker =
        Docker::connect_with_unix(&socket, 120, API_DEFAULT_VERSION).map_err(|e| eyre::eyre!(e))?;

    let checker = Checker::new(docker);
    let report = checker.run_audit().await?;

    Ok(report.results)
}
