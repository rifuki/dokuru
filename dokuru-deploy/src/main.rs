mod config;
mod generator;

use anyhow::Result;
use clap::{Parser, Subcommand};
use cliclack::{confirm, input, intro, outro, outro_cancel, select};
use config::DeployConfig;
use generator::{generate_docker_compose_override, generate_local_toml, generate_secrets_toml, generate_secret};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "dokuru-deploy")]
#[command(about = "Dokuru deployment configuration tool", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
    
    /// Base domain (e.g., dokuru.rifuki.dev)
    #[arg(long)]
    domain: Option<String>,

    /// Database name
    #[arg(long)]
    db_name: Option<String>,

    /// Database user
    #[arg(long)]
    db_user: Option<String>,

    /// Database password
    #[arg(long)]
    db_password: Option<String>,

    /// Resend API key
    #[arg(long)]
    resend_key: Option<String>,

    /// Output directory
    #[arg(long)]
    output: Option<PathBuf>,
}

#[derive(Subcommand)]
enum Commands {
    Init {
        #[arg(long)]
        domain: Option<String>,
        #[arg(long)]
        db_name: Option<String>,
        #[arg(long)]
        db_user: Option<String>,
        #[arg(long)]
        db_password: Option<String>,
        #[arg(long)]
        resend_key: Option<String>,
        #[arg(long)]
        output: Option<PathBuf>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let (domain, db_name, db_user, db_password, resend_key, output) = match cli.command {
        Some(Commands::Init { domain, db_name, db_user, db_password, resend_key, output }) => {
            (domain, db_name, db_user, db_password, resend_key, output)
        }
        None => (cli.domain, cli.db_name, cli.db_user, cli.db_password, cli.resend_key, cli.output),
    };

    run_init(
        domain,
        db_name.unwrap_or_else(|| "dokuru_db".to_string()),
        db_user.unwrap_or_else(|| "dokuru".to_string()),
        db_password,
        resend_key,
        output.unwrap_or_else(|| PathBuf::from(".")),
    )
}

fn run_init(
    domain: Option<String>,
    db_name: String,
    db_user: String,
    db_password: Option<String>,
    resend_key: Option<String>,
    output: PathBuf,
) -> Result<()> {
    let is_interactive = domain.is_none() || resend_key.is_none();

    if is_interactive {
        intro("🚀 Dokuru Deployment Setup")?;
        println!("Let's configure your Dokuru deployment!\n");
    }

    // === STEP 0: Detect or ask for project directory ===
    let project_dir = if is_interactive {
        // Search for dokuru project in current and parent directories
        let current_dir = std::env::current_dir()?;
        let mut detected_path: Option<PathBuf> = None;
        
        // Check current directory
        if current_dir.join("docker-compose.yaml").exists() 
            && current_dir.join("dokuru-server").exists() {
            detected_path = Some(current_dir.clone());
        } else {
            // Check parent directory
            if let Some(parent) = current_dir.parent() {
                if parent.join("docker-compose.yaml").exists() 
                    && parent.join("dokuru-server").exists() {
                    detected_path = Some(parent.to_path_buf());
                }
            }
        }

        if let Some(path) = detected_path {
            println!("✓ Found Dokuru project at: {}\n", path.display());
            
            let use_detected: bool = confirm("Use this project directory?")
                .initial_value(true)
                .interact()?;
            
            if use_detected {
                path
            } else {
                let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
                let default_path = format!("{}/apps/dokuru", home);
                
                let custom_path: String = input("Project directory")
                    .placeholder(&default_path)
                    .default_input(&default_path)
                    .interact()?;
                
                let project_path = PathBuf::from(shellexpand::tilde(&custom_path).to_string());
                
                if !project_path.exists() {
                    let create = confirm(format!("Directory {} doesn't exist. Create it?", project_path.display()))
                        .initial_value(true)
                        .interact()?;
                    
                    if !create {
                        outro_cancel("Cancelled")?;
                        return Ok(());
                    }
                    
                    std::fs::create_dir_all(&project_path)?;
                    println!("  ✓ Created directory: {}\n", project_path.display());
                }
                
                project_path
            }
        } else {
            println!("📁 Project Directory\n");
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            let default_path = format!("{}/apps/dokuru", home);
            
            let path: String = input("Where should the configuration be generated?")
                .placeholder(&default_path)
                .default_input(&default_path)
                .interact()?;
            
            let project_path = PathBuf::from(shellexpand::tilde(&path).to_string());
            
            if !project_path.exists() {
                let create = confirm(format!("Directory {} doesn't exist. Create it?", project_path.display()))
                    .initial_value(true)
                    .interact()?;
                
                if !create {
                    outro_cancel("Cancelled")?;
                    return Ok(());
                }
                
                std::fs::create_dir_all(&project_path)?;
                println!("  ✓ Created directory: {}\n", project_path.display());
            }
            
            project_path
        }
    } else {
        output
    };

    // === STEP 1: Deployment Strategy ===
    let (landing_domain, www_domain, api_domain, strategy) = if is_interactive {
        println!("📦 Deployment Strategy\n");
        
        let strategy: &str = select("How will you deploy?")
            .item("full-vps", "🏠  Full VPS", "Landing + App + API on VPS (Docker Compose)")
            .item("landing-vercel", "🌐  Landing on Vercel", "Landing (Vercel) | App + API (VPS)")
            .item("app-vercel", "⚛️  App on Vercel", "App (Vercel) | Landing + API (VPS)")
            .item("both-vercel", "☁️  Both on Vercel", "Landing + App (Vercel) | API (VPS)")
            .item("custom", "⚙️  Custom", "Specify each domain manually")
            .interact()?;

        match strategy {
            "full-vps" => {
                let base: String = input("Base domain")
                    .placeholder("dokuru.rifuki.dev")
                    .default_input("dokuru.rifuki.dev")
                    .interact()?;
                
                let landing = base.clone();
                let www = format!("app.{}", base);
                let api = format!("api.{}", base);
                
                println!("\n✨ Auto-configured domains:");
                println!("   Landing: https://{} (VPS)", landing);
                println!("   App:     https://{} (VPS)", www);
                println!("   API:     https://{} (VPS)", api);
                
                (landing, www, api, "full-vps")
            }
            "landing-vercel" => {
                println!("\n💡 Landing on Vercel, App + API on VPS\n");
                
                let www: String = input("App domain (VPS)")
                    .placeholder("app.dokuru.rifuki.dev")
                    .interact()?;
                
                let api: String = input("API domain (VPS)")
                    .placeholder("api.dokuru.rifuki.dev")
                    .interact()?;
                
                let landing = "landing.vercel.app".to_string(); // Placeholder, not used
                
                println!("\n✨ Configuration:");
                println!("   App: https://{} (VPS)", www);
                println!("   API: https://{} (VPS)", api);
                
                (landing, www, api, "landing-vercel")
            }
            "app-vercel" => {
                println!("\n💡 App on Vercel, Landing + API on VPS\n");
                
                let landing: String = input("Landing domain (VPS)")
                    .placeholder("dokuru.rifuki.dev")
                    .interact()?;
                
                let api: String = input("API domain (VPS)")
                    .placeholder("api.dokuru.rifuki.dev")
                    .interact()?;
                
                let www = "app.vercel.app".to_string(); // Placeholder, not used
                
                println!("\n✨ Configuration:");
                println!("   Landing: https://{} (VPS)", landing);
                println!("   API:     https://{} (VPS)", api);
                
                (landing, www, api, "app-vercel")
            }
            "both-vercel" => {
                println!("\n💡 Landing + App on Vercel, API on VPS\n");
                
                let api: String = input("API domain (VPS)")
                    .placeholder("api.dokuru.rifuki.dev")
                    .interact()?;
                
                let landing = "landing.vercel.app".to_string(); // Placeholder
                let www = "app.vercel.app".to_string(); // Placeholder
                
                println!("\n✨ Configuration:");
                println!("   API: https://{} (VPS)", api);
                
                (landing, www, api, "both-vercel")
            }
            "custom" => {
                println!("\n⚙️  Custom domain configuration\n");
                
                let landing: String = input("Landing domain")
                    .placeholder("dokuru.com")
                    .interact()?;
                
                let www: String = input("App domain")
                    .placeholder("app.dokuru.com")
                    .interact()?;
                
                let api: String = input("API domain")
                    .placeholder("api.dokuru.com")
                    .interact()?;
                
                (landing, www, api, "custom")
            }
            _ => unreachable!(),
        }
    } else {
        let base = domain.unwrap();
        (base.clone(), format!("app.{}", base), format!("api.{}", base), "full-vps")
    };

    // === STEP 2: Database Configuration ===
    let db_pass = if let Some(p) = db_password {
        p
    } else if is_interactive {
        println!("\n🗄️  Database Configuration\n");
        
        let auto_gen: bool = confirm("Auto-generate secure database password?")
            .initial_value(true)
            .interact()?;

        if auto_gen {
            let pass = generate_secret(32);
            println!("  Generated: {}••••••••", &pass[..8]);
            pass
        } else {
            input("Database password")
                .placeholder("Enter secure password (min 16 chars)")
                .interact()?
        }
    } else {
        generate_secret(32)
    };

    // === STEP 3: Email Configuration ===
    let resend_api = if let Some(k) = resend_key {
        k
    } else if is_interactive {
        println!("\n📧 Email Configuration\n");
        println!("  Dokuru uses Resend for transactional emails");
        println!("  Get your API key at: https://resend.com/api-keys\n");
        
        input("Resend API key")
            .placeholder("re_xxxxxxxxxxxxx")
            .interact()?
    } else {
        return Err(anyhow::anyhow!("Resend API key is required"));
    };

    // === STEP 4: Security Secrets ===
    let (jwt_access, jwt_refresh) = if is_interactive {
        println!("\n🔐 Security Configuration\n");
        
        let auto_gen: bool = confirm("Auto-generate JWT secrets?")
            .initial_value(true)
            .interact()?;

        if auto_gen {
            let access = generate_secret(64);
            let refresh = generate_secret(64);
            println!("  ✓ Generated secure JWT secrets");
            (access, refresh)
        } else {
            let access: String = input("JWT access secret (min 32 chars)")
                .default_input(&generate_secret(64))
                .interact()?;
            
            let refresh: String = input("JWT refresh secret (min 32 chars)")
                .default_input(&generate_secret(64))
                .interact()?;
            
            (access, refresh)
        }
    } else {
        (generate_secret(64), generate_secret(64))
    };

    // Extract base domain from API domain
    let base_domain = api_domain.replace("api.", "");

    // Build config
    let config = DeployConfig {
        base_domain,
        landing_domain,
        www_domain,
        api_domain,
        db_name,
        db_user,
        db_password: db_pass,
        jwt_access_secret: jwt_access,
        jwt_refresh_secret: jwt_refresh,
        resend_api_key: resend_api,
    };

    // === STEP 5: Review & Confirm ===
    if is_interactive {
        println!("\n📋 Configuration Summary\n");
        println!("  🌐 Domains:");
        println!("     Landing: https://{}", config.landing_domain);
        println!("     App:     https://{}", config.www_domain);
        println!("     API:     https://{}", config.api_domain);
        println!("\n  🗄️  Database:");
        println!("     Name:     {}", config.db_name);
        println!("     User:     {}", config.db_user);
        let pass_preview = if config.db_password.len() >= 8 {
            format!("{}••••••••", &config.db_password[..8])
        } else {
            "••••••••".to_string()
        };
        println!("     Password: {}", pass_preview);
        println!("\n  🔐 Security:");
        let access_preview = if config.jwt_access_secret.len() >= 8 {
            format!("{}••••", &config.jwt_access_secret[..8])
        } else {
            "••••••••".to_string()
        };
        let refresh_preview = if config.jwt_refresh_secret.len() >= 8 {
            format!("{}••••", &config.jwt_refresh_secret[..8])
        } else {
            "••••••••".to_string()
        };
        println!("     JWT Access:  {}", access_preview);
        println!("     JWT Refresh: {}", refresh_preview);
        println!("\n  📧 Email:");
        println!("     Provider: Resend");
        println!("     From:     noreply@{}", config.base_domain);
        println!();

        let proceed: bool = confirm("Generate configuration files?")
            .initial_value(true)
            .interact()?;

        if !proceed {
            outro_cancel("Cancelled")?;
            return Ok(());
        }
    }

    // Generate files
    let server_config_dir = project_dir.join("dokuru-server/config");
    std::fs::create_dir_all(&server_config_dir)?;

    generate_local_toml(&config, &server_config_dir.join("local.toml"))?;
    generate_secrets_toml(&config, &server_config_dir.join("secrets.toml"))?;
    generate_docker_compose_override(&config, &project_dir.join("docker-compose.override.yaml"), strategy)?;

    if is_interactive {
        outro("✅ Configuration files generated successfully!")?;
    } else {
        println!("✅ Configuration files generated successfully!");
    }
    
    println!("\n📁 Generated files:");
    println!("  • dokuru-server/config/local.toml");
    println!("  • dokuru-server/config/secrets.toml");
    println!("  • docker-compose.override.yaml");
    
    // Show deployment-specific instructions
    match strategy {
        "full-vps" | "landing-vercel" | "app-vercel" => {
            println!("\n⚙️  GitHub Actions Setup (for VPS services):");
            println!("  1. Go to: https://github.com/{}/settings/variables/actions", 
                std::env::var("GITHUB_REPOSITORY").unwrap_or_else(|_| "your-username/dokuru".to_string()));
            println!("  2. Add repository variable:");
            println!("     Name:  API_DOMAIN");
            println!("     Value: https://{}", config.api_domain);
            if strategy != "app-vercel" {
                println!("\n  Note: This is needed for building dokuru-www Docker image");
            }
        }
        "both-vercel" => {
            println!("\n💡 All frontend services on Vercel - no GitHub Actions setup needed!");
        }
        _ => {}
    }
    
    println!("\n🚀 Next steps:");
    println!("  1. Review generated files");
    println!("  2. Set up GitHub Actions variable (if needed)");
    println!("  3. Run: docker-compose up -d");
    println!("  4. Run migrations: docker-compose run --rm dokuru-server migrate");

    Ok(())
}
