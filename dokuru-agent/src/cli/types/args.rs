use clap::Args;
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
pub struct UpdateArgs {
    #[command(flatten)]
    pub shared: SharedArgs,
}

#[derive(Args, Debug, Clone, Default)]
pub struct UninstallArgs {
    #[command(flatten)]
    pub shared: SharedArgs,
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
