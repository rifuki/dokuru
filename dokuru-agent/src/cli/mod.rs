// CLI module - command implementations
//
// Structure:
// - types/: CLI argument definitions and enums
// - commands/: Command implementations (onboard, doctor, update, uninstall)
// - helpers.rs: Shared helper functions (internal only)
// - utils.rs: Shared utilities (internal only)

mod commands;
mod helpers;
mod types;
mod utils;

// Public API - only expose what main.rs needs
pub use commands::{run, run_configure, run_doctor, run_serve, run_uninstall, run_update};
pub use types::{DoctorArgs, SetupArgs, SetupMode, UninstallArgs, UpdateArgs};

// Internal use only
