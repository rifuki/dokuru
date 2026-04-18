// CLI module - command implementations
//
// Structure:
// - types/: CLI argument definitions and enums
// - commands/: Command implementations (onboard, doctor, update, uninstall)
// - helpers.rs: Shared helper functions (internal only)
// - cloudflare.rs: Cloudflare Tunnel integration
// - utils.rs: Shared utilities (internal only)

mod cloudflare;
mod commands;
mod helpers;
mod types;

// Public API - only expose what main.rs needs
pub use commands::{
    run, run_configure, run_doctor, run_restart, run_serve, run_status, run_token_rotate,
    run_token_show, run_uninstall, run_update,
};
pub use types::{DoctorArgs, SetupArgs, SetupMode, SharedArgs, UninstallArgs, UpdateArgs};

// Internal use only
pub use cloudflare::CloudflareTunnel;
