// Audit module - CIS Docker Benchmark implementation
//
// Structure:
// - checker.rs: Main audit orchestrator (749 lines - TODO: atomize)
// - checks/: CIS checks organized by section (TODO: extract from checker.rs)
//   - section2.rs: Daemon Configuration
//   - section3.rs: Docker Daemon Configuration Files  
//   - section5.rs: Container Runtime
// - fixer.rs: Fix implementations
// - rules.rs: CIS rule definitions
// - types.rs: Audit types

// Internal modules
mod checker;
mod checks;
mod fixer;
mod rules;
mod types;

// Public API - expose what's needed
pub use checker::Checker;
pub use fixer::Fixer;
pub use rules::get_all_rules;
pub use types::{AuditReport, CheckResult, CheckStatus, CisRule, FixOutcome, FixStatus};

// Internal use
use bollard::{API_DEFAULT_VERSION, Docker};

/// Run audit and return results (for agent mode)
pub async fn run_audit_report() -> eyre::Result<Vec<CheckResult>> {
    let socket = std::env::var("DOCKER_SOCKET")
        .unwrap_or_else(|_| "/var/run/docker.sock".to_string());
    
    let docker = Docker::connect_with_unix(&socket, 120, API_DEFAULT_VERSION)
        .map_err(|e| eyre::eyre!(e))?;
    
    let checker = Checker::new(docker);
    let report = checker.run_audit().await?;
    
    Ok(report.results)
}
