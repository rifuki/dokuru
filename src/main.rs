use bollard::{API_DEFAULT_VERSION, Docker};
use clap::{Parser, Subcommand};
use dokuru_core::{Checker, Fixer};

mod setup;

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
    /// Interactive first-time setup
    Setup(setup::SetupArgs),
    /// Re-configure settings interactively
    Configure(setup::SetupArgs),
    /// Inspect Dokuru installation and host readiness
    Doctor(setup::DoctorArgs),
    /// Update Dokuru from the rolling latest release
    Update(setup::UpdateArgs),
    /// Remove Dokuru from this host
    Uninstall(setup::UninstallArgs),
    /// Run all CIS checks and print results to stdout
    Audit,
    /// Apply a specific rule fix
    Fix { rule_id: String },
    /// Launch interactive TUI dashboard
    Tui,
    /// Start the API daemon (Axum server)
    Serve,
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    // Install eyre panic handler
    color_eyre::install()?;
    dokuru_server::infrastructure::env::load();

    let cli = Cli::parse();

    match &cli.command {
        Commands::Setup(args) => setup::run(setup::SetupMode::Setup, args.clone())?,
        Commands::Configure(args) => setup::run(setup::SetupMode::Configure, args.clone())?,
        Commands::Doctor(args) => setup::run_doctor(args.clone())?,
        Commands::Update(args) => setup::run_update(args.clone())?,
        Commands::Uninstall(args) => setup::run_uninstall(args.clone())?,
        Commands::Audit => {
            let docker = connect_docker()?;
            let checker = Checker::new(docker);
            println!("Running Audit...");
            let report = checker.run_audit().await?;
            println!("Audit finished. Score: {}/100", report.score);
            println!("Passed: {}, Failed: {}", report.passed, report.failed);
            for result in report.results {
                println!(
                    "[{:?}] {} - {}",
                    result.status, result.rule.id, result.rule.title
                );
            }
        }
        Commands::Fix { rule_id } => {
            let docker = connect_docker()?;
            let fixer = Fixer::new(docker);
            println!("Applying fix for rule {}...", rule_id);
            let outcome = fixer.apply_fix(rule_id).await?;
            println!("{:?}: {}", outcome.status, outcome.message);
            if let Some(command) = outcome.restart_command {
                println!("Next step: {}", command);
            }
        }
        Commands::Tui => {
            dokuru_tui::run().await?;
        }
        Commands::Serve => {
            println!("API Server starting...");
            dokuru_server::serve().await?;
        }
    }

    Ok(())
}

fn connect_docker() -> eyre::Result<Docker> {
    let socket =
        std::env::var("DOCKER_SOCKET").unwrap_or_else(|_| "/var/run/docker.sock".to_string());
    Docker::connect_with_unix(&socket, 120, API_DEFAULT_VERSION).map_err(|e| eyre::eyre!(e))
}
