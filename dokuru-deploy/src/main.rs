mod compose;
mod config;
mod generator;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use cliclack::{confirm, input, intro, outro, outro_cancel, select};
use compose::{Compose, doctor, services_or_default};
use config::DeployConfig;
use generator::{
    generate_docker_compose_override, generate_env_file, generate_local_toml, generate_secret,
    generate_secrets_toml,
};
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
    /// Generate production config files and compose overrides
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
    /// Validate local prerequisites and Dokuru config files
    Doctor(ProjectArgs),
    /// Show Docker Compose service status
    Status(ServiceArgs),
    /// Run the server container healthcheck
    Health(ProjectArgs),
    /// Pull images, start infrastructure, run migrations, and roll out apps
    Deploy(DeployArgs),
    /// Start Compose services without running migrations
    Up(ServiceArgs),
    /// Alias for up
    Start(ServiceArgs),
    /// Pull Compose service images
    Pull(ServiceArgs),
    /// Run database migrations through the migration image
    Migrate(RunArgs),
    /// Stop Compose services
    Down(DownArgs),
}

#[derive(Args, Clone)]
struct ProjectArgs {
    /// Dokuru project directory containing docker-compose.yaml
    #[arg(long, value_name = "DIR", default_value = ".")]
    project_dir: PathBuf,
}

#[derive(Args, Clone)]
struct RunArgs {
    #[command(flatten)]
    project: ProjectArgs,

    /// Print commands without executing them
    #[arg(long)]
    dry_run: bool,

    /// Override the Compose VERSION image tag
    #[arg(long)]
    version: Option<String>,
}

#[derive(Args, Clone)]
struct ServiceArgs {
    #[command(flatten)]
    run: RunArgs,

    /// Compose services to target. Defaults to Dokuru app services.
    #[arg(long = "service", value_name = "SERVICE")]
    services: Vec<String>,
}

#[derive(Args, Clone)]
struct DeployArgs {
    #[command(flatten)]
    service: ServiceArgs,

    /// Skip docker compose pull before rollout
    #[arg(long)]
    no_pull: bool,

    /// Skip database migrations before app rollout
    #[arg(long)]
    skip_migrations: bool,
}

#[derive(Args, Clone)]
struct DownArgs {
    #[command(flatten)]
    project: ProjectArgs,

    /// Print commands without executing them
    #[arg(long)]
    dry_run: bool,

    /// Also remove named volumes
    #[arg(long)]
    volumes: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let Some(command) = cli.command else {
        return run_init(
            cli.domain,
            cli.db_name.unwrap_or_else(|| "dokuru_db".to_string()),
            cli.db_user.unwrap_or_else(|| "dokuru".to_string()),
            cli.db_password,
            cli.resend_key,
            cli.output.unwrap_or_else(|| PathBuf::from(".")),
        );
    };

    match command {
        Commands::Init {
            domain,
            db_name,
            db_user,
            db_password,
            resend_key,
            output,
        } => run_init(
            domain,
            db_name.unwrap_or_else(|| "dokuru_db".to_string()),
            db_user.unwrap_or_else(|| "dokuru".to_string()),
            db_password,
            resend_key,
            output.unwrap_or_else(|| PathBuf::from(".")),
        ),
        Commands::Doctor(args) => doctor(&args.project_dir),
        Commands::Status(args) => run_status(&args),
        Commands::Health(args) => run_health(args),
        Commands::Deploy(args) => run_deploy(&args),
        Commands::Up(args) | Commands::Start(args) => run_up(&args),
        Commands::Pull(args) => run_pull(&args),
        Commands::Migrate(args) => run_migrate(&args),
        Commands::Down(args) => run_down(args),
    }
}

fn run_status(args: &ServiceArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.status(&services_or_default(&args.services, &[]))
}

fn run_health(args: ProjectArgs) -> Result<()> {
    let compose = Compose::new(args.project_dir, false, None)?;
    compose.health()
}

fn run_deploy(args: &DeployArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.service.run)?;
    compose.deploy(&args.service.services, !args.no_pull, !args.skip_migrations)
}

fn run_up(args: &ServiceArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.up(&services_or_default(&args.services, &[]))
}

fn run_pull(args: &ServiceArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.pull(&services_or_default(&args.services, &[]))
}

fn run_migrate(args: &RunArgs) -> Result<()> {
    let compose = compose_from_run_args(args)?;
    compose.migrate()
}

fn run_down(args: DownArgs) -> Result<()> {
    let compose = Compose::new(args.project.project_dir, args.dry_run, None)?;
    compose.down(args.volumes)
}

fn compose_from_run_args(args: &RunArgs) -> Result<Compose> {
    Compose::new(
        args.project.project_dir.clone(),
        args.dry_run,
        args.version.clone(),
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
    show_intro(is_interactive)?;

    let project_dir = resolve_project_dir(is_interactive, output)?;
    let domains = resolve_domains(domain, is_interactive)?;
    let strategy = domains.strategy;
    let database = resolve_database(db_name, db_user, db_password, is_interactive)?;
    let resend_api = resolve_resend_key(resend_key, is_interactive)?;
    let secrets = resolve_jwt_secrets(is_interactive)?;
    let config = build_deploy_config(domains, database, secrets, resend_api);

    confirm_configuration(&config, is_interactive)?;
    generate_files(&config, &project_dir, strategy)?;
    show_completion(&config, strategy, is_interactive)?;

    Ok(())
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum DeployStrategy {
    FullVps,
    LandingVercel,
    AppVercel,
    BothVercel,
    Custom,
}

impl DeployStrategy {
    const fn as_str(self) -> &'static str {
        match self {
            Self::FullVps => "full-vps",
            Self::LandingVercel => "landing-vercel",
            Self::AppVercel => "app-vercel",
            Self::BothVercel => "both-vercel",
            Self::Custom => "custom",
        }
    }
}

struct DomainConfig {
    landing: String,
    www: String,
    api: String,
    strategy: DeployStrategy,
}

struct DatabaseCredentials {
    name: String,
    user: String,
    password: String,
}

struct JwtSecrets {
    access: String,
    refresh: String,
}

fn show_intro(is_interactive: bool) -> Result<()> {
    if is_interactive {
        intro("🚀 Dokuru Deployment Setup")?;
        println!("Let's configure your Dokuru deployment!\n");
    }
    Ok(())
}

fn resolve_project_dir(is_interactive: bool, output: PathBuf) -> Result<PathBuf> {
    if !is_interactive {
        return Ok(output);
    }

    if let Some(path) = detect_project_dir()? {
        println!("✓ Found Dokuru project at: {}\n", path.display());
        if confirm("Use this project directory?")
            .initial_value(true)
            .interact()?
        {
            return Ok(path);
        }
    } else {
        println!("📁 Project Directory\n");
    }

    prompt_project_dir()
}

fn detect_project_dir() -> Result<Option<PathBuf>> {
    let current_dir = std::env::current_dir()?;
    if is_project_dir(&current_dir) {
        return Ok(Some(current_dir));
    }

    Ok(current_dir
        .parent()
        .filter(|path| is_project_dir(path))
        .map(PathBuf::from))
}

fn is_project_dir(path: &std::path::Path) -> bool {
    path.join("docker-compose.yaml").exists() && path.join("dokuru-server").exists()
}

fn prompt_project_dir() -> Result<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let default_path = format!("{home}/apps/dokuru");
    let custom_path: String = input("Project directory")
        .placeholder(&default_path)
        .default_input(&default_path)
        .interact()?;
    let project_path = PathBuf::from(shellexpand::tilde(&custom_path).to_string());

    ensure_project_dir_exists(&project_path)?;
    Ok(project_path)
}

fn ensure_project_dir_exists(project_path: &PathBuf) -> Result<()> {
    if project_path.exists() {
        return Ok(());
    }

    let create = confirm(format!(
        "Directory {} doesn't exist. Create it?",
        project_path.display()
    ))
    .initial_value(true)
    .interact()?;

    if !create {
        outro_cancel("Cancelled")?;
        return Err(anyhow::anyhow!("cancelled"));
    }

    std::fs::create_dir_all(project_path)?;
    println!("  ✓ Created directory: {}\n", project_path.display());
    Ok(())
}

fn resolve_domains(domain: Option<String>, is_interactive: bool) -> Result<DomainConfig> {
    if !is_interactive {
        let base = domain.expect("domain is required in non-interactive mode");
        return Ok(DomainConfig {
            landing: base.clone(),
            www: format!("app.{base}"),
            api: format!("api.{base}"),
            strategy: DeployStrategy::FullVps,
        });
    }

    println!("📦 Deployment Strategy\n");
    match prompt_strategy()? {
        DeployStrategy::FullVps => full_vps_domains(),
        DeployStrategy::LandingVercel => landing_vercel_domains(),
        DeployStrategy::AppVercel => app_vercel_domains(),
        DeployStrategy::BothVercel => both_vercel_domains(),
        DeployStrategy::Custom => custom_domains(),
    }
}

fn prompt_strategy() -> Result<DeployStrategy> {
    select("How will you deploy?")
        .item(
            DeployStrategy::FullVps,
            "🏠  Full VPS",
            "Landing + App + API on VPS (Docker Compose)",
        )
        .item(
            DeployStrategy::LandingVercel,
            "🌐  Landing on Vercel",
            "Landing (Vercel) | App + API (VPS)",
        )
        .item(
            DeployStrategy::AppVercel,
            "⚛️  App on Vercel",
            "App (Vercel) | Landing + API (VPS)",
        )
        .item(
            DeployStrategy::BothVercel,
            "☁️  Both on Vercel",
            "Landing + App (Vercel) | API (VPS)",
        )
        .item(
            DeployStrategy::Custom,
            "⚙️  Custom",
            "Specify each domain manually",
        )
        .interact()
        .map_err(Into::into)
}

fn full_vps_domains() -> Result<DomainConfig> {
    let base: String = input("Base domain")
        .placeholder("dokuru.rifuki.dev")
        .default_input("dokuru.rifuki.dev")
        .interact()?;
    let domains = DomainConfig {
        landing: base.clone(),
        www: format!("app.{base}"),
        api: format!("api.{base}"),
        strategy: DeployStrategy::FullVps,
    };
    print_domain_summary(&domains, true, true, true);
    Ok(domains)
}

fn landing_vercel_domains() -> Result<DomainConfig> {
    println!("\n💡 Landing on Vercel, App + API on VPS\n");
    let www = prompt_domain("App domain (VPS)", "app.dokuru.rifuki.dev")?;
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing: "landing.vercel.app".to_string(),
        www,
        api,
        strategy: DeployStrategy::LandingVercel,
    };
    print_domain_summary(&domains, false, true, true);
    Ok(domains)
}

fn app_vercel_domains() -> Result<DomainConfig> {
    println!("\n💡 App on Vercel, Landing + API on VPS\n");
    let landing = prompt_domain("Landing domain (VPS)", "dokuru.rifuki.dev")?;
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing,
        www: "app.vercel.app".to_string(),
        api,
        strategy: DeployStrategy::AppVercel,
    };
    print_domain_summary(&domains, true, false, true);
    Ok(domains)
}

fn both_vercel_domains() -> Result<DomainConfig> {
    println!("\n💡 Landing + App on Vercel, API on VPS\n");
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing: "landing.vercel.app".to_string(),
        www: "app.vercel.app".to_string(),
        api,
        strategy: DeployStrategy::BothVercel,
    };
    print_domain_summary(&domains, false, false, true);
    Ok(domains)
}

fn custom_domains() -> Result<DomainConfig> {
    println!("\n⚙️  Custom domain configuration\n");
    Ok(DomainConfig {
        landing: input("Landing domain")
            .placeholder("dokuru.com")
            .interact()?,
        www: input("App domain")
            .placeholder("app.dokuru.com")
            .interact()?,
        api: input("API domain")
            .placeholder("api.dokuru.com")
            .interact()?,
        strategy: DeployStrategy::Custom,
    })
}

fn prompt_domain(label: &str, default: &str) -> Result<String> {
    input(label)
        .placeholder(default)
        .default_input(default)
        .interact()
        .map_err(Into::into)
}

fn print_domain_summary(
    domains: &DomainConfig,
    show_landing: bool,
    show_www: bool,
    show_api: bool,
) {
    println!("\n✨ Configuration:");
    if show_landing {
        println!("   Landing: https://{} (VPS)", domains.landing);
    }
    if show_www {
        println!("   App:     https://{} (VPS)", domains.www);
    }
    if show_api {
        println!("   API:     https://{} (VPS)", domains.api);
    }
}

fn resolve_database(
    db_name: String,
    db_user: String,
    db_password: Option<String>,
    is_interactive: bool,
) -> Result<DatabaseCredentials> {
    if let Some(password) = db_password {
        return Ok(DatabaseCredentials {
            name: db_name,
            user: db_user,
            password,
        });
    }

    if is_interactive {
        prompt_database(db_name, db_user)
    } else {
        Ok(DatabaseCredentials {
            name: db_name,
            user: db_user,
            password: generate_secret(32),
        })
    }
}

fn prompt_database(db_name: String, db_user: String) -> Result<DatabaseCredentials> {
    println!("\n🗄️  Database Configuration\n");
    if confirm("Auto-generate secure database configuration?")
        .initial_value(true)
        .interact()?
    {
        let password = generate_secret(32);
        println!("  Generated: {}••••••••", &password[..8]);
        return Ok(DatabaseCredentials {
            name: db_name,
            user: db_user,
            password,
        });
    }

    let name = prompt_domain("Database name", "dokuru_db")?;
    let user = prompt_domain("Database user", "dokuru")?;
    Ok(DatabaseCredentials {
        name,
        user,
        password: prompt_database_password()?,
    })
}

fn prompt_database_password() -> Result<String> {
    if confirm("Auto-generate database password?")
        .initial_value(true)
        .interact()?
    {
        let password = generate_secret(32);
        println!("  Generated: {}••••••••", &password[..8]);
        return Ok(password);
    }

    input("Database password")
        .placeholder("Enter secure password (min 16 chars)")
        .interact()
        .map_err(Into::into)
}

fn resolve_resend_key(resend_key: Option<String>, is_interactive: bool) -> Result<String> {
    if let Some(key) = resend_key {
        return Ok(key);
    }
    if !is_interactive {
        return Err(anyhow::anyhow!("Resend API key is required"));
    }

    println!("\n📧 Email Configuration\n");
    println!("  Dokuru uses Resend for transactional emails");
    println!("  Get your API key at: https://resend.com/api-keys\n");
    input("Resend API key")
        .placeholder("re_xxxxxxxxxxxxx")
        .interact()
        .map_err(Into::into)
}

fn resolve_jwt_secrets(is_interactive: bool) -> Result<JwtSecrets> {
    if !is_interactive {
        return Ok(generated_jwt_secrets());
    }

    println!("\n🔐 Security Configuration\n");
    if confirm("Auto-generate JWT secrets?")
        .initial_value(true)
        .interact()?
    {
        println!("  ✓ Generated secure JWT secrets");
        return Ok(generated_jwt_secrets());
    }

    Ok(JwtSecrets {
        access: input("JWT access secret (min 32 chars)")
            .default_input(&generate_secret(64))
            .interact()?,
        refresh: input("JWT refresh secret (min 32 chars)")
            .default_input(&generate_secret(64))
            .interact()?,
    })
}

fn generated_jwt_secrets() -> JwtSecrets {
    JwtSecrets {
        access: generate_secret(64),
        refresh: generate_secret(64),
    }
}

fn build_deploy_config(
    domains: DomainConfig,
    database: DatabaseCredentials,
    secrets: JwtSecrets,
    resend_api_key: String,
) -> DeployConfig {
    let base_domain = domains.api.replace("api.", "");
    DeployConfig {
        base_domain,
        landing_domain: domains.landing,
        www_domain: domains.www,
        api_domain: domains.api,
        db_name: database.name,
        db_user: database.user,
        db_password: database.password,
        jwt_access_secret: secrets.access,
        jwt_refresh_secret: secrets.refresh,
        resend_api_key,
    }
}

fn confirm_configuration(config: &DeployConfig, is_interactive: bool) -> Result<()> {
    if !is_interactive {
        return Ok(());
    }

    print_config_summary(config);
    if confirm("Proceed and save configuration files?")
        .initial_value(true)
        .interact()?
    {
        Ok(())
    } else {
        outro_cancel("Cancelled")?;
        Err(anyhow::anyhow!("cancelled"))
    }
}

fn print_config_summary(config: &DeployConfig) {
    println!("\n📋 Configuration Summary\n");
    println!("  🌐 Domains:");
    println!("     Landing: https://{}", config.landing_domain);
    println!("     App:     https://{}", config.www_domain);
    println!("     API:     https://{}", config.api_domain);
    println!("\n  🗄️  Database:");
    println!("     Name:     {}", config.db_name);
    println!("     User:     {}", config.db_user);
    println!(
        "     Password: {}",
        secret_preview(&config.db_password, "••••••••")
    );
    println!("\n  🔐 Security:");
    println!(
        "     JWT Access:  {}",
        secret_preview(&config.jwt_access_secret, "••••••••")
    );
    println!(
        "     JWT Refresh: {}",
        secret_preview(&config.jwt_refresh_secret, "••••••••")
    );
    println!("\n  📧 Email:");
    println!("     Provider: Resend");
    println!("     From:     noreply@{}", config.base_domain);
    println!();
}

fn secret_preview(secret: &str, fallback: &str) -> String {
    if secret.len() >= 8 {
        format!("{}••••••••", &secret[..8])
    } else {
        fallback.to_string()
    }
}

fn generate_files(
    config: &DeployConfig,
    project_dir: &std::path::Path,
    strategy: DeployStrategy,
) -> Result<()> {
    let server_config_dir = project_dir.join("dokuru-server/config");
    std::fs::create_dir_all(&server_config_dir)?;

    generate_local_toml(config, &server_config_dir.join("local.toml"))?;
    generate_secrets_toml(config, &server_config_dir.join("secrets.toml"))?;
    generate_docker_compose_override(
        config,
        &project_dir.join("docker-compose.override.yaml"),
        strategy.as_str(),
    )?;
    generate_env_file(config, &project_dir.join("dokuru-server/.env"))?;
    Ok(())
}

fn show_completion(
    config: &DeployConfig,
    strategy: DeployStrategy,
    is_interactive: bool,
) -> Result<()> {
    if is_interactive {
        outro("✅ Configuration files generated successfully!")?;
    } else {
        println!("✅ Configuration files generated successfully!");
    }

    println!("\n📁 Generated files:");
    println!("  • dokuru-server/config/local.toml");
    println!("  • dokuru-server/config/secrets.toml");
    println!("  • dokuru-server/.env");
    println!("  • docker-compose.override.yaml");

    // Show deployment-specific instructions
    match strategy {
        DeployStrategy::FullVps | DeployStrategy::LandingVercel | DeployStrategy::AppVercel => {
            println!("\n⚙️  GitHub Actions Setup (for VPS services):");
            println!(
                "  1. Go to: https://github.com/{}/settings/variables/actions",
                std::env::var("GITHUB_REPOSITORY")
                    .unwrap_or_else(|_| "your-username/dokuru".to_string())
            );
            println!("  2. Add repository variable:");
            println!("     Name:  API_DOMAIN");
            println!("     Value: https://{}", config.api_domain);
            println!("  3. Add production deployment variables:");
            println!("     DOKURU_DEPLOY_HOST, DOKURU_DEPLOY_USER, DOKURU_DEPLOY_PATH");
            println!("     Optional: DOKURU_DEPLOY_PORT");
            println!("  4. Add production deployment secret:");
            println!("     DOKURU_DEPLOY_SSH_KEY");
            println!("     Optional if GHCR images are private: DOKURU_GHCR_TOKEN");
            if !matches!(strategy, DeployStrategy::AppVercel) {
                println!("\n  Note: This is needed for building dokuru-www Docker image");
            }
        }
        DeployStrategy::BothVercel => {
            println!("\n💡 All frontend services on Vercel - no GitHub Actions setup needed!");
        }
        DeployStrategy::Custom => {}
    }

    println!("\n🚀 Next steps:");
    println!("  1. Review generated files");
    println!("  2. Set up GitHub Actions variables/secrets for production");
    println!("  3. Push to main or run the relevant Build & Deploy workflow manually");
    println!("  4. CI/CD will pull images, run migrations, then roll out services");

    Ok(())
}
