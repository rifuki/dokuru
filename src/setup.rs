use clap::Args;
use cliclack::{confirm, input, intro, note, outro, outro_cancel, select, spinner};
use dokuru_server::infrastructure::config::{
    Config as RuntimeConfig, DockerConfig, ServerConfig, config_path_in,
};
use eyre::{Result, WrapErr, bail};
use std::fs;
use std::io::{IsTerminal, stderr};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const REPO_URL: &str = "https://github.com/rifuki/dokuru";
const LATEST_RELEASE_BASE_URL: &str = "https://github.com/rifuki/dokuru/releases/download/latest";

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

#[derive(Clone, Copy, Debug)]
pub enum SetupMode {
    Onboard,
    Configure,
}

#[derive(Debug)]
struct InstallerConfig {
    yes: bool,
    install_path: PathBuf,
    config_dir: PathBuf,
    systemd_dir: PathBuf,
    service_name: String,
    port: u16,
    host: String,
    docker_socket: String,
    cors_origins: String,
    skip_service: bool,
}

#[derive(Debug)]
struct Preflight {
    distro: String,
    arch: &'static str,
    running_as_root: bool,
    has_systemd: bool,
    docker_installed: bool,
    docker_group_exists: bool,
    docker_socket_exists: bool,
    docker_service_exists: bool,
}

#[derive(Clone, Copy, Debug)]
enum ChecksumTool {
    Sha256sum,
    Shasum,
}

// ─── Setup / Onboard / Configure ─────────────────────────────────────────────

pub fn run(mode: SetupMode, args: SetupArgs) -> Result<()> {
    let mut config = resolve_config(args)?;
    let source_binary =
        std::env::current_exe().wrap_err("Failed to resolve current Dokuru binary path")?;

    // Only switch to Configure mode if config already exists
    // Binary existence alone doesn't mean it's configured
    let has_config = runtime_config_path(&config).exists();
    let effective_mode = if matches!(mode, SetupMode::Onboard) && has_config {
        SetupMode::Configure
    } else {
        mode
    };
    let mut preflight = collect_preflight(&config);

    intro(format!("🐳 Dokuru  {}", effective_mode.heading()))?;

    if matches!(mode, SetupMode::Onboard) && matches!(effective_mode, SetupMode::Configure) {
        cliclack::log::warning("Existing configuration found — switching to configure mode")?;
    }

    if matches!(effective_mode, SetupMode::Onboard) {
        show_preflight(&config, &preflight)?;
    }

    if !preflight.running_as_root {
        outro_cancel(format!(
            "Root privileges required. Re-run with: sudo dokuru {}",
            effective_mode.command_name()
        ))?;
        bail!("root privileges required");
    }

    // Validate Docker installation
    if !preflight.docker_installed {
        if offer_docker_installation(&config)? {
            run_step("Installing Docker", install_docker)?;
            run_step("Starting Docker service", || {
                run_command("systemctl", &["start", "docker"])
            })?;

            // Re-collect preflight after Docker installation
            preflight = collect_preflight(&config);
            if !preflight.docker_installed || !preflight.docker_group_exists {
                outro_cancel("Docker installation verification failed")?;
                bail!("Docker installation failed");
            }
            cliclack::log::success("Docker is ready")?;
        } else {
            config.skip_service = true;
            cliclack::log::warning("Continuing without Docker - service will not start")?;
        }
    }

    // Offer to add current user to docker group
    #[allow(clippy::collapsible_if)]
    if preflight.docker_group_exists && !config.yes {
        if let Ok(current_user) = std::env::var("SUDO_USER").or_else(|_| std::env::var("USER")) {
            if !current_user.is_empty() && current_user != "root" {
                let in_group = user_in_docker_group(&current_user)?;
                if !in_group
                    && confirm(format!(
                        "Add user '{}' to docker group? (recommended)",
                        current_user
                    ))
                    .initial_value(true)
                    .interact()?
                {
                    run_command("usermod", &["-aG", "docker", &current_user])?;
                    cliclack::log::success(format!(
                        "User '{}' added to docker group",
                        current_user
                    ))?;
                    cliclack::log::warning(
                        "Log out and back in (or run 'newgrp docker') for group changes to take effect"
                    )?;
                }
            }
        }
    }

    config = prompt_for_config(effective_mode, config)?;

    if !config.skip_service && !preflight.has_systemd {
        cliclack::log::warning("systemd not detected — continuing without a managed service")?;
        config.skip_service = true;
    }

    // Show summary before applying
    let mut summary_lines = vec![
        format!("Binary:  {}", config.install_path.display()),
        format!("Config:  {}", runtime_config_path(&config).display()),
        format!("Port:    {}", config.port),
        format!("Bind:    {}", config.host),
        format!("Docker:  {}", config.docker_socket),
        format!("CORS:    {}", config.cors_origins),
    ];

    if config.skip_service {
        summary_lines.push("Service: skipped".to_string());
    } else if preflight.has_systemd {
        summary_lines.push(format!(
            "Service: {}",
            config
                .systemd_dir
                .join(format!("{}.service", config.service_name))
                .display()
        ));
    }

    note("Configuration", summary_lines.join("\n"))?;

    // Confirm before applying
    let prompt = match effective_mode {
        SetupMode::Onboard => {
            let source_binary = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("dokuru"));
            if source_binary == config.install_path {
                "Apply these settings?".to_string()
            } else {
                format!(
                    "Apply these settings and install Dokuru to {}?",
                    config.install_path.display()
                )
            }
        }
        SetupMode::Configure => format!("Apply changes to {}?", config.config_dir.display()),
    };

    if !config.yes && stderr().is_terminal() && !confirm(prompt).initial_value(true).interact()? {
        outro_cancel("Configuration cancelled.")?;
        bail!("cancelled");
    }

    if effective_mode.should_install_binary() && source_binary != config.install_path {
        run_step("Installing Dokuru binary", || {
            install_binary(&source_binary, &config.install_path)
        })?;
    }

    run_step("Setting up dokuru user and group", setup_dokuru_user)?;
    if stderr().is_terminal() {
        cliclack::log::info("→ Created system user 'dokuru' for service isolation")?;
    }

    run_step("Creating log directory", setup_log_directory)?;
    if stderr().is_terminal() {
        cliclack::log::info("→ /var/log/dokuru")?;
    }

    run_step("Writing Dokuru configuration", || {
        write_config_file(&config)
    })?;
    if stderr().is_terminal() {
        cliclack::log::info(format!("→ {}", runtime_config_path(&config).display()))?;
    }

    if !config.skip_service {
        run_step("Writing systemd unit", || {
            write_systemd_unit(&config, &preflight)
        })?;
        if stderr().is_terminal() {
            cliclack::log::info(format!("→ {}", service_unit_path(&config).display()))?;
        }

        run_step("Reloading systemd", reload_systemd)?;

        run_step("Enabling Dokuru service", || {
            enable_service(&config.service_name)
        })?;
        if stderr().is_terminal() {
            cliclack::log::info(format!("→ systemctl enable {}", config.service_name))?;
        }

        if !preflight.docker_socket_exists {
            cliclack::log::warning(format!("Docker is not ready on {}", config.docker_socket))?;
            cliclack::log::info(format!(
                "Start Docker first, then: systemctl restart {}",
                config.service_name
            ))?;
            outro("Dokuru configured. Start Docker to run the service.")?;
            return Ok(());
        }

        match run_step("Starting Dokuru service", || {
            restart_service(&config.service_name)
        }) {
            Ok(_) => {
                if stderr().is_terminal() {
                    cliclack::log::success("✓ Active and running")?;
                }
            }
            Err(err) => {
                cliclack::log::warning(format!("Service installed but failed to start: {err}"))?;
                cliclack::log::info(format!(
                    "Inspect logs: journalctl -u {} -f",
                    config.service_name
                ))?;
                outro("Dokuru configured but service failed to start.")?;
                return Ok(());
            }
        }
    }

    // Final success message in a box
    let mut next_steps = Vec::new();
    if !config.skip_service {
        next_steps.push(format!("Logs:      journalctl -u {} -f", config.service_name));
    }
    next_steps.push(format!("Dashboard: http://<your-host>:{}", config.port));
    
    note("Next steps", next_steps.join("\n"))?;
    outro("Dokuru is ready.")?;

    Ok(())
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

pub fn run_doctor(args: DoctorArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, args.docker_socket)?;
    let preflight = collect_preflight(&config);
    let config_path = runtime_config_path(&config);
    let service_path = service_unit_path(&config);
    let binary_exists = config.install_path.exists();
    let config_exists = config_path.exists();
    let service_exists = service_path.exists();
    let service_enabled =
        service_exists && command_success("systemctl", &["is-enabled", &config.service_name]);
    let service_active =
        service_exists && command_success("systemctl", &["is-active", &config.service_name]);

    intro("🐳 Dokuru  host diagnostics")?;

    // Status section
    let log_item = |ok: bool, label: &str, value: &str| -> Result<()> {
        if ok {
            cliclack::log::success(format!("{:<16} {}", label, value))?;
        } else {
            cliclack::log::warning(format!("{:<16} {}", label, value))?;
        }
        Ok(())
    };

    log_item(
        binary_exists,
        "Binary",
        &config.install_path.display().to_string(),
    )?;
    log_item(config_exists, "Config", &config_path.display().to_string())?;
    log_item(
        preflight.docker_socket_exists,
        "Docker socket",
        &config.docker_socket,
    )?;
    log_item(
        preflight.has_systemd,
        "Systemd",
        if preflight.has_systemd {
            "detected"
        } else {
            "not detected"
        },
    )?;
    log_item(
        service_exists,
        "Service unit",
        &service_path.display().to_string(),
    )?;
    if service_exists {
        log_item(
            service_enabled,
            "Service enabled",
            if service_enabled { "yes" } else { "no" },
        )?;
        log_item(
            service_active,
            "Service active",
            if service_active { "yes" } else { "no" },
        )?;
    }

    // Config note
    let mut config_lines = vec![
        format!("Port:           {}", config.port),
        format!("Host:           {}", config.host),
        format!("CORS:           {}", config.cors_origins),
        format!(
            "docker.service: {}",
            if preflight.docker_service_exists {
                "detected"
            } else {
                "not detected"
            }
        ),
    ];
    if binary_exists && let Some(version) = binary_version(&config.install_path) {
        config_lines.push(format!("Version:        {}", version));
    }
    note("Configuration", config_lines.join("\n"))?;

    cliclack::log::info(format!(
        "Run `dokuru update --install-path {}` to refresh the binary.",
        config.install_path.display()
    ))?;

    outro("Diagnostics complete.")?;
    Ok(())
}

// ─── Update ──────────────────────────────────────────────────────────────────

pub fn run_update(args: UpdateArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, None)?;
    let preflight = collect_preflight(&config);

    intro("🐳 Dokuru  rolling latest updater")?;

    if !preflight.running_as_root {
        outro_cancel("Root privileges required. Re-run with: sudo dokuru update")?;
        bail!("root privileges required");
    }

    ensure_command("curl")?;
    let checksum_tool = detect_checksum_tool()?;
    let asset_name = release_asset_name()?;
    let temp_dir = create_temp_dir("dokuru-update")?;
    let binary_path = temp_dir.join(asset_name);
    let checksum_path = temp_dir.join("SHA256SUMS");

    note(
        "Update plan",
        format!(
            "Target:  {}\nAsset:   {}\nService: {}",
            config.install_path.display(),
            asset_name,
            config.service_name,
        ),
    )?;

    if !confirm_action(
        args.shared.yes,
        &format!("Update Dokuru at {}?", config.install_path.display()),
    )? {
        outro_cancel("Update cancelled.")?;
        bail!("cancelled");
    }

    run_step("Downloading latest Dokuru binary", || {
        download_file(
            &format!("{LATEST_RELEASE_BASE_URL}/{asset_name}"),
            &binary_path,
        )
    })?;
    run_step("Downloading release checksums", || {
        download_file(
            &format!("{LATEST_RELEASE_BASE_URL}/SHA256SUMS"),
            &checksum_path,
        )
    })?;
    run_step("Verifying release checksum", || {
        verify_download_checksum(&checksum_path, &binary_path, asset_name, checksum_tool)
    })?;
    run_step("Installing updated Dokuru binary", || {
        install_binary(&binary_path, &config.install_path)
    })?;

    if service_unit_path(&config).exists() && preflight.has_systemd {
        run_step("Restarting Dokuru service", || {
            restart_service(&config.service_name)
        })?;
    }

    let mut result_lines = vec![format!("Binary:  {}", config.install_path.display())];
    if let Some(version) = binary_version(&config.install_path) {
        result_lines.push(format!("Version: {}", version));
    }
    note("Update complete", result_lines.join("\n"))?;

    cliclack::log::info(format!("Dashboard: http://<your-host>:{}", config.port))?;
    outro("Dokuru updated successfully.")?;
    Ok(())
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

pub fn run_uninstall(args: UninstallArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, None)?;
    let preflight = collect_preflight(&config);
    let unit_path = service_unit_path(&config);
    let config_path = runtime_config_path(&config);

    intro("🐳 Dokuru  uninstall")?;

    if !preflight.running_as_root {
        outro_cancel("Root privileges required. Re-run with: sudo dokuru uninstall")?;
        bail!("root privileges required");
    }

    note(
        "Will remove",
        format!(
            "Binary:  {}\nConfig:  {}\nService: {}",
            config.install_path.display(),
            config_path.display(),
            unit_path.display(),
        ),
    )?;

    if !confirm_action(
        args.shared.yes,
        &format!("Uninstall Dokuru from {}?", config.install_path.display()),
    )? {
        outro_cancel("Uninstall cancelled.")?;
        bail!("cancelled");
    }

    if preflight.has_systemd && unit_path.exists() {
        run_step("Stopping Dokuru service", || {
            stop_service_if_present(&config.service_name)
        })?;
        run_step("Disabling Dokuru service", || {
            disable_service_if_present(&config.service_name)
        })?;
        run_step("Removing systemd unit", || {
            remove_file_if_present(&unit_path)
        })?;
        run_step("Reloading systemd", reload_systemd)?;
    }

    run_step("Removing Dokuru binary", || {
        remove_file_if_present(&config.install_path)
    })?;
    run_step("Removing Dokuru config", || {
        remove_dir_if_present(&config.config_dir)
    })?;

    let mut removed = vec![
        "Binary:  removed".to_string(),
        "Config:  removed".to_string(),
    ];
    if preflight.has_systemd {
        removed.push("Service: removed".to_string());
    }
    note("Uninstall complete", removed.join("\n"))?;

    outro("Dokuru has been removed from this host.")?;
    Ok(())
}

// ─── SetupMode ───────────────────────────────────────────────────────────────

impl SetupMode {
    fn command_name(self) -> &'static str {
        match self {
            Self::Onboard => "onboard",
            Self::Configure => "configure",
        }
    }

    fn heading(self) -> &'static str {
        match self {
            Self::Onboard => "",
            Self::Configure => "Interactive reconfiguration",
        }
    }

    fn should_install_binary(self) -> bool {
        matches!(self, Self::Onboard)
    }
}

// ─── Config Resolution ───────────────────────────────────────────────────────

fn resolve_config(args: SetupArgs) -> Result<InstallerConfig> {
    let install_path = args
        .shared
        .install_path
        .unwrap_or_else(default_install_path);
    let config_dir = args.shared.config_dir.unwrap_or_else(default_config_dir);
    let systemd_dir = args.shared.systemd_dir.unwrap_or_else(default_systemd_dir);
    let service_name = args
        .shared
        .service_name
        .unwrap_or_else(|| "dokuru".to_string());

    let port = match args.port {
        Some(port) => port,
        None => std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(3939),
    };

    let host = args
        .host
        .or_else(|| std::env::var("HOST").ok())
        .unwrap_or_else(|| "0.0.0.0".to_string());

    let docker_socket = args
        .docker_socket
        .or_else(|| std::env::var("DOCKER_SOCKET").ok())
        .unwrap_or_else(|| "/var/run/docker.sock".to_string());

    let cors_origins = args
        .cors_origins
        .or_else(|| std::env::var("CORS_ORIGINS").ok())
        .unwrap_or_else(|| "*".to_string());

    Ok(InstallerConfig {
        yes: args.shared.yes,
        install_path,
        config_dir,
        systemd_dir,
        service_name,
        port,
        host,
        docker_socket,
        cors_origins,
        skip_service: args.skip_service,
    })
}

fn resolve_shared_config(
    shared: &SharedArgs,
    docker_socket_override: Option<String>,
) -> Result<InstallerConfig> {
    let install_path = shared
        .install_path
        .clone()
        .unwrap_or_else(default_install_path);
    let config_dir = shared.config_dir.clone().unwrap_or_else(default_config_dir);
    let systemd_dir = shared
        .systemd_dir
        .clone()
        .unwrap_or_else(default_systemd_dir);
    let service_name = shared
        .service_name
        .clone()
        .unwrap_or_else(|| "dokuru".to_string());
    let saved_config = load_saved_runtime_config(&config_dir)?;

    let port = saved_config.server.port;
    let host = saved_config.server.host;
    let docker_socket = docker_socket_override.unwrap_or(saved_config.docker.socket);
    let cors_origins = saved_config.server.cors_origins.join(",");

    Ok(InstallerConfig {
        yes: shared.yes,
        install_path,
        config_dir,
        systemd_dir,
        service_name,
        port,
        host,
        docker_socket,
        cors_origins,
        skip_service: false,
    })
}

fn load_saved_runtime_config(config_dir: &Path) -> Result<RuntimeConfig> {
    RuntimeConfig::load_from_path(config_path_in(config_dir))
}

fn offer_docker_installation(config: &InstallerConfig) -> Result<bool> {
    cliclack::log::warning("Docker is not installed")?;

    if config.yes {
        cliclack::log::info("Non-interactive mode: skipping Docker installation")?;
        return Ok(false);
    }

    #[derive(Clone, Eq, PartialEq)]
    enum DockerChoice {
        Install,
        Manual,
        Skip,
    }

    let choice = select("What would you like to do?")
        .item(
            DockerChoice::Install,
            "Install Docker now",
            "Run official Docker install script",
        )
        .item(
            DockerChoice::Manual,
            "Install manually",
            "Exit and install Docker yourself",
        )
        .item(
            DockerChoice::Skip,
            "Skip (dev mode)",
            "Continue without Docker",
        )
        .interact()?;

    match choice {
        DockerChoice::Install => {
            note(
                "Docker Installation",
                "Dokuru will run the official Docker installation script:\n\
                 curl -fsSL https://get.docker.com | sh\n\n\
                 This script will:\n\
                 • Detect your Linux distribution\n\
                 • Add Docker's official repository\n\
                 • Install Docker Engine\n\
                 • Start and enable the Docker service",
            )?;
            Ok(true)
        }
        DockerChoice::Manual => {
            note(
                "Manual installation",
                "Install Docker using:\n\
                 curl -fsSL https://get.docker.com | sh\n\n\
                 Then re-run: dokuru onboard",
            )?;
            bail!("Docker installation required");
        }
        DockerChoice::Skip => Ok(false),
    }
}

fn install_docker() -> Result<()> {
    let script_path = "/tmp/get-docker.sh";

    // Download script
    run_command(
        "curl",
        &["-fsSL", "https://get.docker.com", "-o", script_path],
    )?;

    // Show script size for transparency
    if let Ok(metadata) = fs::metadata(script_path) {
        cliclack::log::info(format!("Downloaded script: {} bytes", metadata.len()))?;
    }

    // Execute with suppressed output (only show errors)
    let status = Command::new("sh")
        .arg(script_path)
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .status()
        .wrap_err("Failed to execute Docker install script")?;

    if !status.success() {
        bail!("Docker installation script failed");
    }

    // Cleanup
    fs::remove_file(script_path).ok();

    Ok(())
}

fn user_in_docker_group(username: &str) -> Result<bool> {
    let output = Command::new("groups")
        .arg(username)
        .output()
        .wrap_err("Failed to check user groups")?;

    if !output.status.success() {
        return Ok(false);
    }

    let groups = String::from_utf8_lossy(&output.stdout);
    Ok(groups.contains("docker"))
}

fn collect_preflight(config: &InstallerConfig) -> Preflight {
    let docker_installed = command_exists("docker");
    let docker_group_exists = command_success("getent", &["group", "docker"]);

    Preflight {
        distro: detect_distro(),
        arch: std::env::consts::ARCH,
        running_as_root: nix_like_is_root(),
        has_systemd: command_exists("systemctl"),
        docker_installed,
        docker_group_exists,
        docker_socket_exists: is_socket(Path::new(&config.docker_socket)),
        docker_service_exists: command_exists("systemctl") && has_systemd_unit("docker.service"),
    }
}

// ─── Interactive Prompts ──────────────────────────────────────────────────────

fn prompt_for_config(mode: SetupMode, mut config: InstallerConfig) -> Result<InstallerConfig> {
    if config.yes || !stderr().is_terminal() {
        return Ok(config);
    }

    match mode {
        SetupMode::Onboard => {
            configure_server_section(&mut config)?;
            configure_docker_section(&mut config)?;
            configure_service_section(&mut config)?;
        }
        SetupMode::Configure => {
            note(
                "Existing config",
                format!(
                    "Server:  {}:{}\nDocker:  {}\nService: {}",
                    config.host,
                    config.port,
                    config.docker_socket,
                    if config.skip_service {
                        "disabled"
                    } else {
                        &config.service_name
                    },
                ),
            )?;
            run_configure_sections(&mut config)?;
        }
    }

    Ok(config)
}

#[derive(Clone, Eq, PartialEq)]
enum ConfigSection {
    Server,
    Docker,
    Service,
    Done,
}

fn run_configure_sections(config: &mut InstallerConfig) -> Result<()> {
    loop {
        let section = select("Select section to configure")
            .item(
                ConfigSection::Server,
                "Server",
                "bind address, port, and CORS",
            )
            .item(ConfigSection::Docker, "Docker", "socket path")
            .item(ConfigSection::Service, "Service", "systemd service")
            .item(ConfigSection::Done, "Continue", "finish and apply")
            .interact()?;

        match section {
            ConfigSection::Server => configure_server_section(config)?,
            ConfigSection::Docker => configure_docker_section(config)?,
            ConfigSection::Service => configure_service_section(config)?,
            ConfigSection::Done => break,
        }
    }
    Ok(())
}

fn configure_server_section(config: &mut InstallerConfig) -> Result<()> {
    let port_default = config.port.to_string();
    config.port = input("Dokuru port")
        .default_input(&port_default)
        .interact()?;

    let host_default = config.host.clone();
    config.host = input("Bind address")
        .placeholder("0.0.0.0")
        .default_input(&host_default)
        .interact()?;

    let cors_default = config.cors_origins.clone();
    config.cors_origins = input("CORS origins")
        .placeholder("* or https://example.com")
        .default_input(&cors_default)
        .interact()?;

    Ok(())
}

fn configure_docker_section(config: &mut InstallerConfig) -> Result<()> {
    let socket_default = config.docker_socket.clone();
    config.docker_socket = input("Docker socket path")
        .default_input(&socket_default)
        .interact()?;
    Ok(())
}

fn configure_service_section(config: &mut InstallerConfig) -> Result<()> {
    let want_service = confirm("Install and manage Dokuru as a systemd service?")
        .initial_value(!config.skip_service)
        .interact()?;
    config.skip_service = !want_service;
    Ok(())
}

fn confirm_action(yes: bool, prompt: &str) -> Result<bool> {
    if yes || !stderr().is_terminal() {
        return Ok(true);
    }

    confirm(prompt)
        .initial_value(true)
        .interact()
        .map_err(Into::into)
}

// ─── Display Helpers ──────────────────────────────────────────────────────────

fn show_preflight(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    let lines = [
        format!("Distribution:   {}", preflight.distro),
        format!("Architecture:   {}", preflight.arch),
        format!(
            "Privileges:     {}",
            if preflight.running_as_root {
                "root ✓"
            } else {
                "not root ✗"
            }
        ),
        format!(
            "Init system:    {}",
            if preflight.has_systemd {
                "systemd ✓"
            } else {
                "systemd not found"
            }
        ),
        format!(
            "Docker:         {}",
            if preflight.docker_installed {
                "installed ✓"
            } else {
                "not installed ✗"
            }
        ),
        format!(
            "Docker group:   {}",
            if preflight.docker_group_exists {
                "exists ✓"
            } else {
                "not found ✗"
            }
        ),
        format!(
            "Docker socket:  {} {}",
            config.docker_socket,
            if preflight.docker_installed && preflight.docker_socket_exists {
                "✓"
            } else {
                "(not found)"
            }
        ),
        format!(
            "docker.service: {}",
            if preflight.docker_service_exists {
                "detected ✓"
            } else {
                "not detected"
            }
        ),
    ];
    note("Preflight", lines.join("\n"))?;
    Ok(())
}

// ─── Step Runner ─────────────────────────────────────────────────────────────

fn run_step<T, F>(label: &str, action: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    if stderr().is_terminal() {
        let sp = spinner();
        sp.start(label);
        match action() {
            Ok(value) => {
                sp.stop(label);
                Ok(value)
            }
            Err(err) => {
                sp.error(err.to_string());
                Err(err)
            }
        }
    } else {
        action()
    }
}

// ─── System Operations ────────────────────────────────────────────────────────

fn install_binary(source: &Path, destination: &Path) -> Result<()> {
    if source == destination {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| eyre::eyre!("Install path must include a parent directory"))?;

    fs::create_dir_all(parent)
        .wrap_err_with(|| format!("Failed to create {}", parent.display()))?;
    fs::copy(source, destination).wrap_err_with(|| {
        format!(
            "Failed to copy Dokuru binary from {} to {}",
            source.display(),
            destination.display()
        )
    })?;

    let mut permissions = fs::metadata(destination)
        .wrap_err_with(|| format!("Failed to stat {}", destination.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(destination, permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", destination.display()))?;

    Ok(())
}

fn write_config_file(config: &InstallerConfig) -> Result<()> {
    fs::create_dir_all(&config.config_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.config_dir.display()))?;

    // Set directory permission to 775 with dokuru group
    let mut dir_permissions = fs::metadata(&config.config_dir)
        .wrap_err_with(|| format!("Failed to stat {}", config.config_dir.display()))?
        .permissions();
    dir_permissions.set_mode(0o775);
    fs::set_permissions(&config.config_dir, dir_permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", config.config_dir.display()))?;

    // Set group ownership to dokuru
    run_command(
        "chgrp",
        &["dokuru", &config.config_dir.display().to_string()],
    )?;

    let config_path = runtime_config_path(config);
    let runtime_config = RuntimeConfig {
        server: ServerConfig {
            port: config.port,
            host: config.host.clone(),
            cors_origins: parse_cors_origins(&config.cors_origins),
        },
        docker: DockerConfig {
            socket: config.docker_socket.clone(),
        },
    };
    let toml_content = toml::to_string_pretty(&runtime_config)
        .wrap_err("Failed to serialize Dokuru config to TOML")?;

    fs::write(&config_path, toml_content)
        .wrap_err_with(|| format!("Failed to write {}", config_path.display()))?;

    // Set file permission to 664 (group writable)
    let mut file_permissions = fs::metadata(&config_path)
        .wrap_err_with(|| format!("Failed to stat {}", config_path.display()))?
        .permissions();
    file_permissions.set_mode(0o664);
    fs::set_permissions(&config_path, file_permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", config_path.display()))?;

    // Set group ownership to dokuru
    run_command("chgrp", &["dokuru", &config_path.display().to_string()])?;

    Ok(())
}

fn write_systemd_unit(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    fs::create_dir_all(&config.systemd_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.systemd_dir.display()))?;

    let after_targets = if preflight.docker_service_exists {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let wants_targets = if preflight.docker_service_exists {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let unit_path = config
        .systemd_dir
        .join(format!("{}.service", config.service_name));

    let unit_content = format!(
        "[Unit]\nDescription=Dokuru Docker Hardening Agent\nDocumentation={}\nAfter={}\nWants={}\n\n[Service]\nType=simple\nUser=dokuru\nGroup=dokuru\nSupplementaryGroups=docker\nEnvironment=DOKURU_CONFIG={}\nExecStart={} serve\nRestart=on-failure\nRestartSec=5s\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier={}\nNoNewPrivileges=yes\nProtectSystem=strict\nReadWritePaths={} /etc/docker /var/log/dokuru\n\n[Install]\nWantedBy=multi-user.target\n",
        REPO_URL,
        after_targets,
        wants_targets,
        runtime_config_path(config).display(),
        config.install_path.display(),
        config.service_name,
        config.config_dir.display(),
    );

    fs::write(&unit_path, unit_content)
        .wrap_err_with(|| format!("Failed to write {}", unit_path.display()))
}

fn setup_dokuru_user() -> Result<()> {
    // Create dokuru group if it doesn't exist
    if !command_success("getent", &["group", "dokuru"]) {
        run_command("groupadd", &["--system", "dokuru"])?;
    }

    // Check if docker group exists before adding user
    let has_docker_group = command_success("getent", &["group", "docker"]);

    // Create dokuru user if it doesn't exist
    if !command_success("getent", &["passwd", "dokuru"]) {
        let mut args = vec![
            "--system",
            "--gid",
            "dokuru",
            "--no-create-home",
            "--shell",
            "/usr/sbin/nologin",
            "--comment",
            "Dokuru service account",
        ];

        // Only add to docker group if it exists
        if has_docker_group {
            args.insert(3, "docker");
            args.insert(3, "--groups");
        }

        args.push("dokuru");
        run_command("useradd", &args)?;
    } else {
        // User exists, add to docker group if it exists
        if has_docker_group {
            run_command("usermod", &["-aG", "docker", "dokuru"])?;
        }
    }

    // Add current user to dokuru group for config access
    if let Ok(current_user) = std::env::var("SUDO_USER").or_else(|_| std::env::var("USER"))
        && !current_user.is_empty()
        && current_user != "root"
    {
        run_command("usermod", &["-aG", "dokuru", &current_user])?;
    }

    Ok(())
}

fn setup_log_directory() -> Result<()> {
    let log_dir = Path::new("/var/log/dokuru");

    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        run_command("mkdir", &["-p", "/var/log/dokuru"])?;
    }

    // Set ownership to dokuru:dokuru
    run_command("chown", &["dokuru:dokuru", "/var/log/dokuru"])?;

    // Set permissions to 755
    run_command("chmod", &["755", "/var/log/dokuru"])?;

    Ok(())
}

fn reload_systemd() -> Result<()> {
    run_command("systemctl", &["daemon-reload"])
}

fn enable_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["enable", service_name])
}

fn restart_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["restart", service_name])
}

fn stop_service_if_present(service_name: &str) -> Result<()> {
    if command_success("systemctl", &["is-active", service_name]) {
        run_command("systemctl", &["stop", service_name])?;
    }
    Ok(())
}

fn disable_service_if_present(service_name: &str) -> Result<()> {
    if command_success("systemctl", &["is-enabled", service_name]) {
        run_command("systemctl", &["disable", service_name])?;
    }
    Ok(())
}

fn remove_file_if_present(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_file(path).wrap_err_with(|| format!("Failed to remove {}", path.display()))?;
    }
    Ok(())
}

fn remove_dir_if_present(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)
            .wrap_err_with(|| format!("Failed to remove {}", path.display()))?;
    }
    Ok(())
}

fn ensure_command(program: &str) -> Result<()> {
    if command_exists(program) {
        Ok(())
    } else {
        bail!("Required command '{}' not found", program);
    }
}

fn detect_checksum_tool() -> Result<ChecksumTool> {
    if command_exists("sha256sum") {
        return Ok(ChecksumTool::Sha256sum);
    }
    if command_exists("shasum") {
        return Ok(ChecksumTool::Shasum);
    }
    bail!("Neither sha256sum nor shasum is available")
}

fn release_asset_name() -> Result<&'static str> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("dokuru-linux-amd64"),
        "aarch64" => Ok("dokuru-linux-arm64"),
        arch => bail!(
            "Unsupported architecture for rolling release update: {}",
            arch
        ),
    }
}

fn create_temp_dir(prefix: &str) -> Result<PathBuf> {
    let unique = format!(
        "{}-{}-{}",
        prefix,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|err| eyre::eyre!(err))?
            .as_millis()
    );
    let path = std::env::temp_dir().join(unique);
    fs::create_dir_all(&path).wrap_err_with(|| format!("Failed to create {}", path.display()))?;
    Ok(path)
}

fn download_file(url: &str, output: &Path) -> Result<()> {
    let mut command = Command::new("curl");
    command.args(["--fail", "--location", "--retry", "3", "--retry-delay", "1"]);
    if stderr().is_terminal() {
        command.arg("--progress-bar");
    } else {
        command.arg("--silent");
    }
    let status = command
        .arg("-o")
        .arg(output)
        .arg(url)
        .status()
        .wrap_err("Failed to execute curl")?;
    if !status.success() {
        bail!("curl failed while downloading {}", url);
    }
    Ok(())
}

fn verify_download_checksum(
    checksum_path: &Path,
    binary_path: &Path,
    asset_name: &str,
    tool: ChecksumTool,
) -> Result<()> {
    let checksums = fs::read_to_string(checksum_path)
        .wrap_err_with(|| format!("Failed to read {}", checksum_path.display()))?;
    let expected = checksums
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.ends_with(asset_name) {
                trimmed.split_whitespace().next().map(str::to_string)
            } else {
                None
            }
        })
        .ok_or_else(|| eyre::eyre!("Checksum entry for {} not found", asset_name))?;

    let actual = match tool {
        ChecksumTool::Sha256sum => {
            command_output("sha256sum", &[binary_path.to_string_lossy().as_ref()])?
        }
        ChecksumTool::Shasum => command_output(
            "shasum",
            &["-a", "256", binary_path.to_string_lossy().as_ref()],
        )?,
    };
    let actual = actual
        .split_whitespace()
        .next()
        .ok_or_else(|| eyre::eyre!("Failed to parse checksum for {}", binary_path.display()))?;

    if actual != expected {
        bail!("Checksum mismatch for {}", asset_name);
    }

    Ok(())
}

fn command_output(program: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .wrap_err_with(|| format!("Failed to execute {}", program))?;
    if !output.status.success() {
        bail!(
            "{} {:?} exited with status {}",
            program,
            args,
            output.status
        );
    }
    String::from_utf8(output.stdout)
        .map(|text| text.trim().to_string())
        .map_err(|err| eyre::eyre!(err))
}

fn binary_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn command_success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn run_command(program: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .wrap_err_with(|| format!("Failed to execute {}", program))?;

    if !status.success() {
        bail!("{} {:?} exited with status {}", program, args, status);
    }

    Ok(())
}

// ─── Utility ──────────────────────────────────────────────────────────────────

fn command_exists(program: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {} >/dev/null 2>&1", program)])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn has_systemd_unit(unit: &str) -> bool {
    Command::new("systemctl")
        .args(["cat", unit])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn is_socket(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.file_type().is_socket())
        .unwrap_or(false)
}

fn nix_like_is_root() -> bool {
    matches!(std::env::var("USER"), Ok(user) if user == "root") || uid_via_id() == Some(0)
}

fn uid_via_id() -> Option<u32> {
    let output = Command::new("id").arg("-u").output().ok()?;
    if !output.status.success() {
        return None;
    }
    std::str::from_utf8(&output.stdout)
        .ok()?
        .trim()
        .parse()
        .ok()
}

fn detect_distro() -> String {
    // Try /etc/os-release first (standard)
    if let Ok(content) = fs::read_to_string("/etc/os-release") {
        for line in content.lines() {
            if let Some(pretty_name) = line.strip_prefix("PRETTY_NAME=") {
                return pretty_name.trim_matches('"').to_string();
            }
        }
    }

    // Fallback to generic
    format!("{} (unknown distro)", std::env::consts::OS)
}

fn default_install_path() -> PathBuf {
    PathBuf::from("/usr/local/bin/dokuru")
}

fn default_config_dir() -> PathBuf {
    PathBuf::from("/etc/dokuru")
}

fn default_systemd_dir() -> PathBuf {
    PathBuf::from("/etc/systemd/system")
}

fn service_unit_path(config: &InstallerConfig) -> PathBuf {
    config
        .systemd_dir
        .join(format!("{}.service", config.service_name))
}

fn runtime_config_path(config: &InstallerConfig) -> PathBuf {
    config_path_in(&config.config_dir)
}

fn parse_cors_origins(cors_origins: &str) -> Vec<String> {
    cors_origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>()
}
