mod compose;
mod config;
mod generator;
mod ghcr;
mod project;
mod release;
mod runtime;

use anyhow::{Result, anyhow};
use clap::{Args, CommandFactory, Parser, Subcommand};
use cliclack::{confirm, input, intro, note, outro, outro_cancel, select};
use compose::{Compose, doctor, services_or_default};
use config::DeployConfig;
use generator::{
    generate_docker_compose_override, generate_env_file, generate_local_toml, generate_secret,
    generate_secrets_toml,
};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "dokuru-deploy", bin_name = "dokuru-deploy")]
#[command(about = "Dokuru deployment configuration tool", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Args, Clone)]
struct InitArgs {
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

    /// Clone the Dokuru repository when the project directory is missing
    #[arg(long)]
    clone_if_missing: bool,

    /// Git repository URL used by --clone-if-missing
    #[arg(long)]
    repo_url: Option<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate deployment config with guided prompts
    Init(InitArgs),
    /// Pull images, start infrastructure, run migrations, and roll out apps
    Deploy(DeployArgs),
    /// Start Compose services without running migrations
    Up(ServiceArgs),
    /// Pull Compose service images
    Pull(ServiceArgs),
    /// Run database migrations through the migration image
    Migrate(RunArgs),
    /// Stop Compose services
    Down(DownArgs),
    /// Restart Compose services
    Restart(ServiceArgs),
    /// Show Docker Compose service status
    Status(ServiceArgs),
    /// Show Docker Compose service logs
    Logs(LogsArgs),
    /// Run the server container healthcheck
    Health(HealthArgs),
    /// Validate local prerequisites and Dokuru config files
    Doctor(ProjectArgs),
    /// Manage deployment config, secrets, and backups
    Config(ConfigCommandArgs),
    /// Download and install the latest dokuru-deploy binary
    Update {
        /// Re-download even when the local binary is up to date
        #[arg(long)]
        force: bool,
    },
    /// Show local build metadata and latest release metadata
    Version {
        /// Skip checking the public latest release
        #[arg(long)]
        offline: bool,
    },
    /// Edit generated config, env, and secrets files
    #[command(hide = true)]
    Configure(ProjectArgs),
    /// Repair obviously invalid generated config values
    #[command(hide = true)]
    Repair(ProjectArgs),
    /// Export generated config, env, secrets, and compose override files
    #[command(hide = true)]
    Export(ExportArgs),
    /// Import generated config, env, secrets, and compose override files
    #[command(hide = true)]
    Import(ImportArgs),
}

#[derive(Args, Clone)]
struct ConfigCommandArgs {
    #[command(subcommand)]
    subcommand: Option<ConfigCommands>,

    #[command(flatten)]
    show: ConfigArgs,
}

#[derive(Subcommand, Clone)]
enum ConfigCommands {
    /// Print generated deployment config
    Show(ConfigArgs),
    /// Edit generated config, env, and secrets files
    Edit(ProjectArgs),
    /// Repair obviously invalid generated config values
    Repair(ProjectArgs),
    /// Export generated config, env, secrets, and compose override files
    #[command(alias = "backup")]
    Export(ExportArgs),
    /// Import generated config, env, secrets, and compose override files
    #[command(alias = "restore")]
    Import(ImportArgs),
}

#[derive(Args, Clone)]
struct ProjectArgs {
    /// Dokuru project directory containing docker-compose.yaml
    #[arg(long, value_name = "DIR", default_value = ".")]
    project_dir: PathBuf,

    /// Clone the Dokuru repository when the project directory is missing
    #[arg(long)]
    clone_if_missing: bool,

    /// Git repository URL used by --clone-if-missing
    #[arg(long)]
    repo_url: Option<String>,
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
struct ExportArgs {
    #[command(flatten)]
    project: ProjectArgs,

    /// Backup JSON output path
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Print raw backup JSON to stdout
    #[arg(long)]
    stdout: bool,
}

#[derive(Args, Clone)]
struct ImportArgs {
    /// Backup JSON file exported by `dokuru-deploy config export`
    input: Option<PathBuf>,

    #[command(flatten)]
    project: ProjectArgs,

    /// Raw backup JSON string
    #[arg(long)]
    raw: Option<String>,

    /// Read raw backup JSON from stdin
    #[arg(long)]
    stdin: bool,

    /// Overwrite files without confirmation
    #[arg(short, long)]
    yes: bool,
}

#[derive(Args, Clone)]
struct HealthArgs {
    #[command(flatten)]
    project: ProjectArgs,

    /// Check production domains instead of local Compose healthcheck
    #[arg(long)]
    production: bool,

    /// Base domain for production checks
    #[arg(long)]
    domain: Option<String>,
}

#[derive(Args, Clone)]
struct LogsArgs {
    #[command(flatten)]
    run: RunArgs,

    /// Service name
    service: String,

    /// Number of log lines
    #[arg(short, long, default_value_t = 50)]
    lines: usize,

    /// Follow log output
    #[arg(short, long)]
    follow: bool,
}

#[derive(Args, Clone)]
struct ConfigArgs {
    #[command(flatten)]
    project: ProjectArgs,

    /// Show raw secrets
    #[arg(long)]
    show_secrets: bool,
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

struct InitOptions {
    domain: Option<String>,
    db_name: String,
    db_user: String,
    db_password: Option<String>,
    resend_key: Option<String>,
    output: PathBuf,
    clone_if_missing: bool,
    repo_url: String,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let Some(command) = cli.command else {
        Cli::command().print_help()?;
        println!();
        return Ok(());
    };

    match command {
        Commands::Init(args) => run_init(InitOptions {
            domain: args.domain,
            db_name: args.db_name.unwrap_or_else(|| "dokuru_db".to_string()),
            db_user: args.db_user.unwrap_or_else(|| "dokuru".to_string()),
            db_password: args.db_password,
            resend_key: args.resend_key,
            output: args.output.unwrap_or_else(|| PathBuf::from(".")),
            clone_if_missing: args.clone_if_missing,
            repo_url: args
                .repo_url
                .unwrap_or_else(|| project::DEFAULT_REPO_URL.to_string()),
        }),
        Commands::Deploy(args) => run_deploy(&args),
        Commands::Up(args) => run_up(&args),
        Commands::Pull(args) => run_pull(&args),
        Commands::Migrate(args) => run_migrate(&args),
        Commands::Down(args) => run_down(&args),
        Commands::Restart(args) => run_restart(&args),
        Commands::Status(args) => run_status(&args),
        Commands::Health(args) => run_health(&args),
        Commands::Logs(args) => run_logs(&args),
        Commands::Doctor(args) => run_doctor(&args),
        Commands::Config(args) => run_config_group(&args),
        Commands::Update { force } => release::update_binary(force),
        Commands::Version { offline } => {
            release::print_version(offline);
            Ok(())
        }
        Commands::Configure(args) => run_configure(&args),
        Commands::Repair(args) => run_repair(&args),
        Commands::Export(args) => run_export(&args),
        Commands::Import(args) => run_import(&args),
    }
}

fn run_status(args: &ServiceArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.status(&services_or_default(&args.services, &[]))
}

fn run_doctor(args: &ProjectArgs) -> Result<()> {
    let project_dir = resolve_project_arg(args)?;
    doctor(&project_dir)
}

fn run_configure(args: &ProjectArgs) -> Result<()> {
    let project_dir = resolve_project_arg(args)?;
    runtime::configure(&project_dir)
}

fn run_repair(args: &ProjectArgs) -> Result<()> {
    let project_dir = resolve_project_arg(args)?;
    runtime::repair(&project_dir)
}

fn run_export(args: &ExportArgs) -> Result<()> {
    let project_dir = resolve_project_arg(&args.project)?;
    runtime::export_config(&project_dir, args.output.clone(), args.stdout)
}

fn run_import(args: &ImportArgs) -> Result<()> {
    let project_dir = resolve_project_arg(&args.project)?;
    runtime::import_config(
        &project_dir,
        args.input.as_deref(),
        args.raw.as_deref(),
        args.stdin,
        args.yes,
    )
}

fn run_config_command(args: &ConfigArgs) -> Result<()> {
    let project_dir = resolve_project_arg(&args.project)?;
    runtime::print_config(&project_dir, args.show_secrets)
}

fn run_config_group(args: &ConfigCommandArgs) -> Result<()> {
    match &args.subcommand {
        Some(ConfigCommands::Show(show_args)) => run_config_command(show_args),
        Some(ConfigCommands::Edit(project_args)) => run_configure(project_args),
        Some(ConfigCommands::Repair(project_args)) => run_repair(project_args),
        Some(ConfigCommands::Export(export_args)) => run_export(export_args),
        Some(ConfigCommands::Import(import_args)) => run_import(import_args),
        None => run_config_command(&args.show),
    }
}

fn run_health(args: &HealthArgs) -> Result<()> {
    if args.production {
        return run_production_health(args.domain.as_deref());
    }

    let project_dir = resolve_project_arg(&args.project)?;
    let compose = Compose::new(&project_dir, false, None)?;
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

fn run_restart(args: &ServiceArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.restart(&args.services)
}

fn run_logs(args: &LogsArgs) -> Result<()> {
    let compose = compose_from_run_args(&args.run)?;
    compose.logs(&args.service, args.lines, args.follow)
}

fn run_down(args: &DownArgs) -> Result<()> {
    let project_dir = resolve_project_arg(&args.project)?;
    let compose = Compose::new(&project_dir, args.dry_run, None)?;
    compose.down(args.volumes)
}

fn run_production_health(domain: Option<&str>) -> Result<()> {
    let base_domain = domain.ok_or_else(|| anyhow!("--domain is required with --production"))?;
    let endpoints = [
        ("landing", format!("https://{base_domain}")),
        ("app", format!("https://app.{base_domain}")),
        ("api", format!("https://api.{base_domain}/health")),
    ];

    println!("Production health\n");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    for (name, url) in endpoints {
        match client.get(&url).send() {
            Ok(response) if response.status().is_success() => println!("  OK    {name:<8} {url}"),
            Ok(response) => println!("  DOWN  {name:<8} {url} ({})", response.status()),
            Err(error) => println!("  ERR   {name:<8} {error}"),
        }
    }

    Ok(())
}

fn compose_from_run_args(args: &RunArgs) -> Result<Compose> {
    let project_dir = resolve_project_arg(&args.project)?;
    Compose::new(&project_dir, args.dry_run, args.version.clone())
}

fn resolve_project_arg(args: &ProjectArgs) -> Result<PathBuf> {
    project::prepare_project_dir(
        &args.project_dir,
        bootstrap_mode(args.clone_if_missing),
        repo_url_arg(args),
    )
}

fn repo_url_arg(args: &ProjectArgs) -> &str {
    args.repo_url
        .as_deref()
        .unwrap_or(project::DEFAULT_REPO_URL)
}

fn run_init(options: InitOptions) -> Result<()> {
    let is_interactive = options.domain.is_none() || options.resend_key.is_none();
    show_intro(is_interactive)?;

    let project_dir = resolve_project_dir(
        is_interactive,
        &options.output,
        options.clone_if_missing,
        &options.repo_url,
    )?;
    let domains = resolve_domains(options.domain, is_interactive)?;
    let strategy = domains.strategy;
    let database = resolve_database(
        options.db_name,
        options.db_user,
        options.db_password,
        is_interactive,
    )?;
    let resend_api = resolve_resend_key(options.resend_key, is_interactive)?;
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
        intro("🚀 Dokuru deploy init")?;
        note("Setup", "Generate deployment config for Dokuru services.")?;
    }
    Ok(())
}

fn resolve_project_dir(
    is_interactive: bool,
    output: &Path,
    clone_if_missing: bool,
    repo_url: &str,
) -> Result<PathBuf> {
    if !is_interactive {
        let bootstrap = bootstrap_mode(clone_if_missing);
        return project::prepare_project_dir(output, bootstrap, repo_url);
    }

    if let Some(path) = project::detect_project_dir()? {
        note(
            "Project",
            format!("Found Dokuru project at {}", path.display()),
        )?;
        if confirm("Use this project directory?")
            .initial_value(true)
            .interact()?
        {
            return Ok(path);
        }
    }

    prompt_project_dir(repo_url, clone_if_missing)
}

fn prompt_project_dir(repo_url: &str, clone_if_missing: bool) -> Result<PathBuf> {
    let default_path = project::default_project_dir().display().to_string();
    let custom_path: String = input("Project directory")
        .placeholder(&default_path)
        .default_input(&default_path)
        .interact()?;
    let project_path = PathBuf::from(shellexpand::tilde(&custom_path).to_string());

    ensure_prompted_project_dir(&project_path, repo_url, clone_if_missing)?;
    Ok(project_path)
}

fn ensure_prompted_project_dir(
    project_path: &Path,
    repo_url: &str,
    clone_if_missing: bool,
) -> Result<()> {
    if project::is_project_dir(project_path) {
        return Ok(());
    }

    let should_clone = if clone_if_missing {
        true
    } else {
        confirm(format!(
            "{} is not a Dokuru checkout. Clone it from {repo_url}?",
            project_path.display()
        ))
        .initial_value(true)
        .interact()?
    };

    if should_clone {
        project::ensure_or_bootstrap(project_path, project::Bootstrap::Clone, repo_url)
    } else {
        outro_cancel("Cancelled")?;
        Err(anyhow::anyhow!("cancelled"))
    }
}

const fn bootstrap_mode(clone_if_missing: bool) -> project::Bootstrap {
    if clone_if_missing {
        project::Bootstrap::Clone
    } else {
        project::Bootstrap::Error
    }
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
    print_domain_summary(&domains, true, true, true)?;
    Ok(domains)
}

fn landing_vercel_domains() -> Result<DomainConfig> {
    note("Strategy", "Landing on Vercel\nApp + API on VPS")?;
    let www = prompt_domain("App domain (VPS)", "app.dokuru.rifuki.dev")?;
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing: "landing.vercel.app".to_string(),
        www,
        api,
        strategy: DeployStrategy::LandingVercel,
    };
    print_domain_summary(&domains, false, true, true)?;
    Ok(domains)
}

fn app_vercel_domains() -> Result<DomainConfig> {
    note("Strategy", "App on Vercel\nLanding + API on VPS")?;
    let landing = prompt_domain("Landing domain (VPS)", "dokuru.rifuki.dev")?;
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing,
        www: "app.vercel.app".to_string(),
        api,
        strategy: DeployStrategy::AppVercel,
    };
    print_domain_summary(&domains, true, false, true)?;
    Ok(domains)
}

fn both_vercel_domains() -> Result<DomainConfig> {
    note("Strategy", "Landing + App on Vercel\nAPI on VPS")?;
    let api = prompt_domain("API domain (VPS)", "api.dokuru.rifuki.dev")?;
    let domains = DomainConfig {
        landing: "landing.vercel.app".to_string(),
        www: "app.vercel.app".to_string(),
        api,
        strategy: DeployStrategy::BothVercel,
    };
    print_domain_summary(&domains, false, false, true)?;
    Ok(domains)
}

fn custom_domains() -> Result<DomainConfig> {
    note("Strategy", "Custom domain configuration")?;
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
) -> Result<()> {
    let mut lines = Vec::new();
    if show_landing {
        lines.push(format!("Landing: https://{} (VPS)", domains.landing));
    }
    if show_www {
        lines.push(format!("App:     https://{} (VPS)", domains.www));
    }
    if show_api {
        lines.push(format!("API:     https://{} (VPS)", domains.api));
    }

    note("Domains", lines.join("\n"))?;
    Ok(())
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
    note("Database", "Configure PostgreSQL credentials.")?;
    if confirm("Auto-generate secure database configuration?")
        .initial_value(true)
        .interact()?
    {
        let password = generate_secret(32);
        note("Database password", secret_preview(&password, "generated"))?;
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
        note("Database password", secret_preview(&password, "generated"))?;
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

    note(
        "Email",
        "Dokuru uses Resend for transactional emails.\nGet your API key at: https://resend.com/api-keys",
    )?;
    input("Resend API key")
        .placeholder("re_xxxxxxxxxxxxx")
        .interact()
        .map_err(Into::into)
}

fn resolve_jwt_secrets(is_interactive: bool) -> Result<JwtSecrets> {
    if !is_interactive {
        return Ok(generated_jwt_secrets());
    }

    note("Security", "Configure JWT signing secrets.")?;
    if confirm("Auto-generate JWT secrets?")
        .initial_value(true)
        .interact()?
    {
        note(
            "JWT secrets",
            "Generated secure access and refresh secrets.",
        )?;
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

    print_config_summary(config)?;
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

fn print_config_summary(config: &DeployConfig) -> Result<()> {
    note(
        "Configuration summary",
        format!(
            "Domains\n  Landing: https://{}\n  App:     https://{}\n  API:     https://{}\n\nDatabase\n  Name:     {}\n  User:     {}\n  Password: {}\n\nSecurity\n  JWT Access:  {}\n  JWT Refresh: {}\n\nEmail\n  Provider: Resend\n  From:     noreply@{}",
            config.landing_domain,
            config.www_domain,
            config.api_domain,
            config.db_name,
            config.db_user,
            secret_preview(&config.db_password, "••••••••"),
            secret_preview(&config.jwt_access_secret, "••••••••"),
            secret_preview(&config.jwt_refresh_secret, "••••••••"),
            config.base_domain,
        ),
    )?;
    Ok(())
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
    generate_env_file(&project_dir.join("dokuru-server/.env"))?;
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

    note(
        "Generated files",
        "dokuru-server/config/local.toml\ndokuru-server/config/secrets.toml\ndokuru-server/.env (PORT only)\ndocker-compose.override.yaml",
    )?;

    // Show deployment-specific instructions
    match strategy {
        DeployStrategy::FullVps | DeployStrategy::LandingVercel | DeployStrategy::AppVercel => {
            let repository = std::env::var("GITHUB_REPOSITORY")
                .unwrap_or_else(|_| "your-username/dokuru".to_string());
            let mut github_steps = vec![
                format!("Open: https://github.com/{repository}/settings/variables/actions"),
                format!("Variable: API_DOMAIN=https://{}", config.api_domain),
                "Variables: DOKURU_DEPLOY_HOST, DOKURU_DEPLOY_USER, DOKURU_DEPLOY_PATH".to_string(),
                "Optional variable: DOKURU_DEPLOY_PORT".to_string(),
                "Secret: DOKURU_DEPLOY_SSH_KEY".to_string(),
                "Optional secret: DOKURU_GHCR_TOKEN for private GHCR images".to_string(),
            ];
            if !matches!(strategy, DeployStrategy::AppVercel) {
                github_steps.push("Needed for building the dokuru-www Docker image".to_string());
            }
            note("GitHub Actions", github_steps.join("\n"))?;
        }
        DeployStrategy::BothVercel => {
            note(
                "GitHub Actions",
                "All frontend services are on Vercel; no VPS frontend setup needed.",
            )?;
        }
        DeployStrategy::Custom => {}
    }

    note(
        "Next steps",
        "Review generated files\nSet GitHub Actions variables/secrets for production\nPush to main or run the Build & Deploy workflow manually\nCI/CD will pull images, run migrations, then roll out services",
    )?;

    Ok(())
}
