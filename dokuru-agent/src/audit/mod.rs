// Audit module - CIS Docker Benchmark implementation
//
// Architecture: Data-driven (SIMPLE!)
// - RuleDefinition = DATA (metadata + check_fn + fix_fn)
// - RuleRegistry = STORAGE + EXECUTOR
// - That's it!

pub mod fix_helpers;
mod rule_registry;
mod types;

// Public API
pub use rule_registry::RuleRegistry;
pub use types::*;

#[cfg(test)]
mod engine_tests;
#[cfg(test)]
mod types_tests;

use bollard::{API_DEFAULT_VERSION, Docker};

/// Run audit and return results (for agent mode)
#[allow(dead_code)]
pub async fn run_audit_report() -> eyre::Result<Vec<CheckResult>> {
    let socket =
        std::env::var("DOCKER_SOCKET").unwrap_or_else(|_| "/var/run/docker.sock".to_string());

    let docker =
        Docker::connect_with_unix(&socket, 120, API_DEFAULT_VERSION).map_err(|e| eyre::eyre!(e))?;

    let registry = RuleRegistry::new();
    let report = registry.run_audit(&docker).await?;

    Ok(report.results)
}
