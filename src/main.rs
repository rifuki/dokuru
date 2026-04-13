use clap::{Parser, Subcommand};
use dokuru_core::{Checker, Fixer, get_all_rules};
use bollard::Docker;

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
    Setup,
    /// Re-configure settings interactively
    Configure,
    /// Run all CIS checks and print results to stdout
    Audit,
    /// Apply a specific rule fix
    Fix {
        rule_id: String,
    },
    /// Launch interactive TUI dashboard
    Tui,
    /// Start the API daemon (Axum server)
    Serve,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install eyre panic handler
    color_eyre::install().map_err(|e| anyhow::anyhow!(e))?;
    
    let cli = Cli::parse();
    
    match &cli.command {
        Commands::Setup | Commands::Configure => {
            println!("=== Dokuru Initial Setup ===");
            let port: String = dialoguer::Input::new()
                .with_prompt("API Server Port")
                .default("3939".into())
                .interact_text()?;
                
            let host: String = dialoguer::Input::new()
                .with_prompt("Host Binding")
                .default("0.0.0.0".into())
                .interact_text()?;
                
            let socket: String = dialoguer::Input::new()
                .with_prompt("Docker Socket Path")
                .default("/var/run/docker.sock".into())
                .interact_text()?;
                
            let env_content = format!("PORT={}\nHOST={}\nDOCKER_SOCKET={}\n", port, host, socket);
            
            // Try to write to /etc/dokuru/.env if root, else local .env
            let prod_dir = std::path::Path::new("/etc/dokuru");
            if prod_dir.exists() || std::fs::create_dir_all(prod_dir).is_ok() {
                let prod_path = prod_dir.join(".env");
                if std::fs::write(&prod_path, &env_content).is_ok() {
                    println!("✅ Created production configuration at {}", prod_path.display());
                    return Ok(());
                }
            }
            
            // Fallback to local
            std::fs::write(".env", &env_content)?;
            println!("✅ Created local configuration at .env");
        }
        Commands::Audit => {
            let docker = Docker::connect_with_local_defaults()?;
            let checker = Checker::new(docker);
            println!("Running Audit...");
            let report = checker.run_audit().await?;
            println!("Audit finished. Score: {}/100", report.score);
            println!("Passed: {}, Failed: {}", report.passed, report.failed);
            for result in report.results {
                println!("[{:?}] {} - {}", result.status, result.rule.id, result.rule.title);
            }
        }
        Commands::Fix { rule_id } => {
            let docker = Docker::connect_with_local_defaults()?;
            let fixer = Fixer::new(docker);
            println!("Applying fix for rule {}...", rule_id);
            let msg = fixer.apply_fix(rule_id).await?;
            println!("{}", msg);
        }
        Commands::Tui => {
            dokuru_tui::run().await?;
        }
        Commands::Serve => {
            println!("API Server starting on port {}...", "3939");
            dokuru_server::serve().await.map_err(|e| anyhow::anyhow!(e))?;
        }
    }

    Ok(())
}
