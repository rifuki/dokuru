use clap::{Parser, Subcommand};

mod api;
mod audit;
mod cli;
mod docker;
mod host_shell;

const VERSION: &str = concat!(env!("CARGO_PKG_VERSION"), " (", env!("GIT_HASH"), ")");

/// Dokuru - Docker Security Hardening Agent (CIS Benchmark v1.8.0)
#[derive(Parser)]
#[command(name = "dokuru")]
#[command(version = VERSION)]
#[command(about = "Agent-Based Security Hardening Tool for Docker containers", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Guided first-time onboarding
    Onboard(cli::SetupArgs),
    /// Re-configure settings interactively
    Configure(cli::SetupArgs),
    /// Inspect Dokuru installation and host readiness
    Doctor(cli::DoctorArgs),
    /// Show Dokuru service and Docker status
    Status,
    /// Show local build metadata and latest release metadata
    Version(cli::VersionArgs),
    /// Manage agent authentication token
    Token {
        #[command(subcommand)]
        action: TokenAction,
    },
    /// View or manage configuration
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    /// Restart Dokuru service (and tunnel if running)
    Restart {
        /// Only restart the main dokuru service, skip the tunnel
        #[arg(long)]
        service_only: bool,
    },
    /// Update Dokuru from rolling latest or a versioned release
    Update(cli::UpdateArgs),
    /// Remove Dokuru from this host
    Uninstall(cli::UninstallArgs),
    /// Start the local API server (standalone mode)
    Serve,
}

#[derive(Subcommand)]
enum TokenAction {
    /// Display current token information
    Show(cli::SharedArgs),
    /// Generate and apply a new token
    Rotate(cli::SharedArgs),
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Display current configuration
    Show(cli::SharedArgs),
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    // Install eyre panic handler
    color_eyre::install()?;

    let cli = Cli::parse();

    match &cli.command {
        Commands::Onboard(args) => {
            if let Err(err) = cli::run(cli::SetupMode::Onboard, args.clone()) {
                eprintln!("\n[dokuru] {err}");
                std::process::exit(1);
            }
        }
        Commands::Configure(args) => {
            cli::run_configure(args.clone())?;
        }
        Commands::Doctor(args) => cli::run_doctor(args.clone())?,
        Commands::Status => cli::run_status()?,
        Commands::Version(args) => cli::run_version(args),
        Commands::Token { action } => match action {
            TokenAction::Show(shared) => cli::run_token_show(shared)?,
            TokenAction::Rotate(shared) => cli::run_token_rotate(shared)?,
        },
        Commands::Config { action } => match action {
            ConfigAction::Show(shared) => cli::run_config_show(shared)?,
        },
        Commands::Restart { service_only } => cli::run_restart(*service_only)?,
        Commands::Update(args) => cli::run_update(args)?,
        Commands::Uninstall(args) => cli::run_uninstall(args)?,
        Commands::Serve => {
            Box::pin(cli::run_serve()).await?;
        }
    }

    Ok(())
}
