use clap::{Args, Subcommand};
use std::path::PathBuf;

// Internal only - used by other Args structs
#[derive(Args, Debug, Clone, Default)]
pub struct SharedArgs {
    /// Skip interactive prompts and use detected defaults
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Override the binary install path
    #[arg(long = "install-path")]
    pub install_path: Option<PathBuf>,

    /// Override the config directory
    #[arg(long = "config-dir")]
    pub config_dir: Option<PathBuf>,

    /// Override the systemd unit directory
    #[arg(long = "systemd-dir")]
    pub systemd_dir: Option<PathBuf>,

    /// Override the systemd service name
    #[arg(long = "service-name")]
    pub service_name: Option<String>,
}

#[derive(Args, Debug, Clone, Default)]
pub struct SetupArgs {
    #[command(flatten)]
    pub shared: SharedArgs,

    /// Override the service port
    #[arg(long)]
    pub port: Option<u16>,

    /// Override the host bind address
    #[arg(long)]
    pub host: Option<String>,

    /// Override the Docker socket path
    #[arg(long = "docker-socket")]
    pub docker_socket: Option<String>,

    /// Override allowed CORS origins
    #[arg(long = "cors-origins")]
    pub cors_origins: Option<String>,

    /// Skip writing and starting a systemd unit
    #[arg(long = "skip-service")]
    pub skip_service: bool,

    /// Automatically install Docker if not present (non-interactive mode only)
    #[arg(long = "install-docker")]
    pub install_docker: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct DoctorArgs {
    #[command(flatten)]
    pub shared: SharedArgs,

    /// Override the Docker socket path reported by doctor
    #[arg(long = "docker-socket")]
    pub docker_socket: Option<String>,
}

#[derive(Args, Debug, Clone, Default)]
pub struct VersionArgs {
    /// Skip checking public release metadata
    #[arg(long)]
    pub offline: bool,

    /// Show metadata for a specific release tag, for example v0.1.0
    #[arg(long = "release", value_name = "TAG")]
    pub release: Option<String>,

    /// List recent Dokuru agent releases from GitHub
    #[arg(long)]
    pub list: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct UpdateArgs {
    #[command(flatten)]
    pub shared: SharedArgs,

    /// Re-download even when the local binary is up to date
    #[arg(long)]
    pub force: bool,

    /// Update to a specific version tag instead of rolling latest, for example v0.1.0
    #[arg(long = "version", value_name = "TAG")]
    pub version: Option<String>,
}

#[derive(Args, Debug, Clone, Default)]
pub struct UninstallArgs {
    #[command(flatten)]
    pub shared: SharedArgs,
}

#[derive(Subcommand, Debug, Clone)]
pub enum AuditAction {
    /// Run a full audit and print the current score
    Run(AuditRunArgs),
    /// Preview targets and parameters for one rule
    Preview(AuditPreviewArgs),
    /// Apply one rule fix using fresh preview targets by default
    Fix(AuditFixArgs),
    /// Apply every failed auto-fixable rule from a fresh audit
    FixAll(AuditFixAllArgs),
    /// Show stored fix history entries
    History(AuditHistoryArgs),
    /// Roll back a stored fix history entry
    Rollback(AuditRollbackArgs),
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditRunArgs {
    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditPreviewArgs {
    /// CIS rule ID, for example 4.1 or 5.11
    pub rule_id: String,

    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditFixArgs {
    /// CIS rule ID, for example 4.1 or 5.11
    pub rule_id: String,

    /// Limit the fix to matching container IDs or names; repeat for multiple targets
    #[arg(long = "target", value_name = "CONTAINER")]
    pub targets: Vec<String>,

    /// Override strategy for selected targets, for example `dokuru_override`, `compose_update`, `docker_update`, `recreate`
    #[arg(long)]
    pub strategy: Option<String>,

    /// Override memory limit in bytes for cgroup rules
    #[arg(long)]
    pub memory: Option<i64>,

    /// Override CPU shares for cgroup rules
    #[arg(long = "cpu-shares")]
    pub cpu_shares: Option<i64>,

    /// Override PIDs limit for cgroup rules
    #[arg(long = "pids-limit")]
    pub pids_limit: Option<i64>,

    /// Explicit runtime user for rule 4.1, for example 1000:1000
    #[arg(long)]
    pub user: Option<String>,

    /// Print the resolved request without applying it
    #[arg(long)]
    pub dry_run: bool,

    /// Apply without the safety confirmation hint
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditFixAllArgs {
    /// Only include these rule IDs; repeat for multiple rules
    #[arg(long = "rule", value_name = "RULE_ID")]
    pub rules: Vec<String>,

    /// Exclude these rule IDs; repeat for multiple rules
    #[arg(long = "exclude-rule", value_name = "RULE_ID")]
    pub exclude_rules: Vec<String>,

    /// Print the resolved plan without applying fixes
    #[arg(long)]
    pub dry_run: bool,

    /// Apply without the safety confirmation hint
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditHistoryArgs {
    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Args, Debug, Clone, Default)]
pub struct AuditRollbackArgs {
    /// Fix history entry ID to roll back
    pub history_id: String,

    /// Print the rollback action without applying it
    #[arg(long)]
    pub dry_run: bool,

    /// Apply without the safety confirmation hint
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Emit machine-readable JSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetupMode {
    Onboard,
    Configure,
}

impl SetupMode {
    pub const fn heading(self) -> &'static str {
        match self {
            Self::Onboard => "onboard",
            Self::Configure => "configure",
        }
    }

    pub const fn command_name(self) -> &'static str {
        match self {
            Self::Onboard => "onboard",
            Self::Configure => "configure",
        }
    }

    pub const fn should_install_binary(self) -> bool {
        matches!(self, Self::Onboard)
    }
}
