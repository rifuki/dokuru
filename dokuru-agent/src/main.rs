use clap::{Parser, Subcommand};

mod api;
mod audit;
mod cli;

/// Dokuru 0.1.0 - Docker Security Hardening Agent (CIS Benchmark v1.8.0)
#[derive(Parser)]
#[command(name = "dokuru")]
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
    /// Update Dokuru from the rolling latest release
    Update(cli::UpdateArgs),
    /// Remove Dokuru from this host
    Uninstall(cli::UninstallArgs),
    /// Start the local API server (standalone mode)
    Serve,
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
        Commands::Status => cli::run_status(),
        Commands::Update(args) => cli::run_update(args)?,
        Commands::Uninstall(args) => cli::run_uninstall(args)?,
        Commands::Serve => {
            cli::run_serve().await?;
        }
    }

    Ok(())
}
