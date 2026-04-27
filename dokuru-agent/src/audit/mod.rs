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
pub use rule_registry::{RuleDefinition, RuleRegistry};
pub use types::*;

#[cfg(test)]
mod engine_tests;
#[cfg(test)]
mod types_tests;
