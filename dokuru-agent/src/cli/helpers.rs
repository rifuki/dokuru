use super::types::{SetupArgs, SetupMode, SharedArgs};
use crate::api::{AuthConfig, Config as RuntimeConfig, DockerConfig, ServerConfig, config_path_in};
use cliclack::{confirm, input, note, select, spinner};
use eyre::{Result, WrapErr, bail};
use reqwest::blocking::Client;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{IsTerminal, stderr};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

pub const REPO_URL: &str = "https://github.com/rifuki/dokuru";
pub const RELEASE_DOWNLOAD_BASE_URL: &str = "https://github.com/rifuki/dokuru/releases/download";
const DOKURU_GROUP: &str = "dokuru";
const DOWNLOAD_ATTEMPTS: u8 = 5;

#[derive(Debug)]
pub struct InstallerConfig {
    pub yes: bool,
    pub install_path: PathBuf,
    pub config_dir: PathBuf,
    pub systemd_dir: PathBuf,
    pub service_name: String,
    pub port: u16,
    pub host: String,
    pub docker_socket: String,
    pub cors_origins: String,
    pub skip_service: bool,
    pub install_docker: bool,
}

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy)]
    pub struct PreflightChecks: u8 {
        const RUNNING_AS_ROOT = 1 << 0;
        const HAS_SYSTEMD = 1 << 1;
        const DOCKER_INSTALLED = 1 << 2;
        const DOCKER_GROUP_EXISTS = 1 << 3;
        const DOCKER_SOCKET_EXISTS = 1 << 4;
        const DOCKER_SERVICE_EXISTS = 1 << 5;
    }
}

#[derive(Debug)]
pub struct Preflight {
    pub distro: String,
    pub arch: &'static str,
    checks: PreflightChecks,
}

impl Preflight {
    pub const fn new(distro: String, arch: &'static str, checks: PreflightChecks) -> Self {
        Self {
            distro,
            arch,
            checks,
        }
    }

    pub const fn running_as_root(&self) -> bool {
        self.checks.contains(PreflightChecks::RUNNING_AS_ROOT)
    }

    pub const fn has_systemd(&self) -> bool {
        self.checks.contains(PreflightChecks::HAS_SYSTEMD)
    }

    pub const fn docker_installed(&self) -> bool {
        self.checks.contains(PreflightChecks::DOCKER_INSTALLED)
    }

    pub const fn docker_group_exists(&self) -> bool {
        self.checks.contains(PreflightChecks::DOCKER_GROUP_EXISTS)
    }

    pub const fn docker_socket_exists(&self) -> bool {
        self.checks.contains(PreflightChecks::DOCKER_SOCKET_EXISTS)
    }

    pub const fn docker_service_exists(&self) -> bool {
        self.checks.contains(PreflightChecks::DOCKER_SERVICE_EXISTS)
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ChecksumTool {
    Sha256sum,
    Shasum,
}

pub fn resolve_config(args: SetupArgs) -> InstallerConfig {
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

    let port = args.port.unwrap_or_else(|| {
        std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(3939)
    });

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

    InstallerConfig {
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
        install_docker: args.install_docker,
    }
}

pub fn resolve_shared_config(
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
        install_docker: false,
    })
}

pub fn load_saved_runtime_config(config_dir: &Path) -> Result<RuntimeConfig> {
    RuntimeConfig::load_from_path(config_path_in(config_dir))
}

#[derive(Clone, Eq, PartialEq)]
enum DockerChoice {
    Install,
    Manual,
    Skip,
}

pub fn offer_docker_installation(config: &InstallerConfig) -> Result<bool> {
    cliclack::log::warning("Docker is not installed")?;

    if config.yes {
        cliclack::log::info("Non-interactive mode: skipping Docker installation")?;
        return Ok(false);
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

pub fn install_docker() -> Result<()> {
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

pub fn user_in_docker_group(username: &str) -> Result<bool> {
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

pub fn collect_preflight(config: &InstallerConfig) -> Preflight {
    let mut checks = PreflightChecks::empty();

    if nix_like_is_root() {
        checks |= PreflightChecks::RUNNING_AS_ROOT;
    }
    if command_exists("systemctl") {
        checks |= PreflightChecks::HAS_SYSTEMD;
    }
    if command_exists("docker") {
        checks |= PreflightChecks::DOCKER_INSTALLED;
    }
    if command_success("getent", &["group", "docker"]) {
        checks |= PreflightChecks::DOCKER_GROUP_EXISTS;
    }
    if is_socket(Path::new(&config.docker_socket)) {
        checks |= PreflightChecks::DOCKER_SOCKET_EXISTS;
    }
    if command_exists("systemctl") && has_systemd_unit("docker.service") {
        checks |= PreflightChecks::DOCKER_SERVICE_EXISTS;
    }

    Preflight::new(detect_distro(), std::env::consts::ARCH, checks)
}

// ─── Interactive Prompts ──────────────────────────────────────────────────────

pub fn prompt_for_config(
    mode: SetupMode,
    mut config: InstallerConfig,
) -> Result<(InstallerConfig, bool)> {
    if config.yes || !stderr().is_terminal() {
        return Ok((config, false));
    }

    // Only used for Onboard mode now
    if mode == SetupMode::Onboard {
        configure_server_section(&mut config)?;
        configure_docker_section(&mut config)?;
        configure_service_section(&mut config)?;
    }

    Ok((config, false))
}

#[derive(Clone, Eq, PartialEq)]
enum ConfigSection {
    Server,
    Docker,
    Service,
    Access,
    Token,
    Done,
}

pub fn run_configure_sections(config: &mut InstallerConfig) -> Result<()> {
    // Show existing config
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

    loop {
        let section = select("Select section to configure")
            .item(
                ConfigSection::Server,
                "Server",
                "bind address, port, and CORS",
            )
            .item(ConfigSection::Docker, "Docker", "socket path")
            .item(ConfigSection::Service, "Service", "systemd service")
            .item(
                ConfigSection::Access,
                "Access",
                "access mode (Cloudflare/Direct)",
            )
            .item(ConfigSection::Token, "Token", "rotate agent token")
            .item(ConfigSection::Done, "Exit", "finish configuration")
            .interact()?;

        match section {
            ConfigSection::Server => {
                configure_server_section(config)?;
                // Write config immediately
                write_config_file_preserve_token(config)?;
                note(
                    "Server Updated",
                    format!(
                        "Port:  {}\nBind:  {}\nCORS:  {}\n\n✓ Config saved & service restarted",
                        config.port, config.host, config.cors_origins
                    ),
                )?;
                // Restart service
                let _ = run_command("systemctl", &["restart", &config.service_name]);
            }
            ConfigSection::Docker => {
                configure_docker_section(config)?;
                // Write config immediately
                write_config_file_preserve_token(config)?;
                note(
                    "Docker Updated",
                    format!(
                        "Socket: {}\n\n✓ Config saved & service restarted",
                        config.docker_socket
                    ),
                )?;
                // Restart service
                let _ = run_command("systemctl", &["restart", &config.service_name]);
            }
            ConfigSection::Service => {
                configure_service_section(config)?;
                note(
                    "Service Updated",
                    format!(
                        "Systemd: {}\n\n✓ Config saved",
                        if config.skip_service {
                            "disabled"
                        } else {
                            "enabled"
                        }
                    ),
                )?;
            }
            ConfigSection::Access => {
                configure_access_section(config)?;
                // Loop back like other sections
            }
            ConfigSection::Token => {
                configure_token_section(config)?;
            }
            ConfigSection::Done => return Ok(()), // Exit
        }
    }
}

pub fn configure_server_section(config: &mut InstallerConfig) -> Result<()> {
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

pub fn configure_docker_section(config: &mut InstallerConfig) -> Result<()> {
    let socket_default = config.docker_socket.clone();
    config.docker_socket = input("Docker socket path")
        .default_input(&socket_default)
        .interact()?;
    Ok(())
}

pub fn configure_service_section(config: &mut InstallerConfig) -> Result<()> {
    let want_service = confirm("Install and manage Dokuru as a systemd service?")
        .initial_value(!config.skip_service)
        .interact()?;
    config.skip_service = !want_service;
    Ok(())
}

pub fn configure_token_section(config: &InstallerConfig) -> Result<()> {
    use crate::cli::commands::token::rotate_token_impl;

    let confirmed = confirm("Rotate agent token? This will invalidate the old token.")
        .initial_value(false)
        .interact()?;

    if !confirmed {
        note("Token Rotation", "Cancelled")?;
        return Ok(());
    }

    // Call the token rotation implementation
    rotate_token_impl(config)?;

    Ok(())
}

pub fn configure_access_section(config: &InstallerConfig) -> Result<()> {
    match prompt_access_mode(config)? {
        "cloudflare" => configure_cloudflare_access(config),
        "direct" => configure_direct_access(config),
        "relay" => configure_relay_access(config),
        _ => unreachable!(),
    }
}

fn prompt_access_mode(config: &InstallerConfig) -> Result<&'static str> {
    select("How should this agent be accessible?")
        .item(
            "cloudflare",
            "Cloudflare Tunnel",
            "Auto HTTPS, no domain needed (recommended)",
        )
        .item(
            "direct",
            "Direct HTTP",
            "Use your own reverse proxy for HTTPS",
        )
        .item("relay", "Relay Mode", "Through dokuru-server via WebSocket")
        .initial_value(current_access_mode_value(config))
        .interact()
        .map_err(Into::into)
}

fn current_access_mode_value(config: &InstallerConfig) -> &'static str {
    let config_path = runtime_config_path(config);
    std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|content| toml::from_str::<crate::api::Config>(&content).ok())
        .map_or("cloudflare", |runtime_config| {
            match runtime_config.access.mode {
                crate::api::AccessMode::Cloudflare => "cloudflare",
                crate::api::AccessMode::Direct => "direct",
                crate::api::AccessMode::Relay => "relay",
                crate::api::AccessMode::Domain => "domain",
            }
        })
}

fn configure_cloudflare_access(config: &InstallerConfig) -> Result<()> {
    use crate::cli::CloudflareTunnel;

    if !CloudflareTunnel::is_installed() {
        let spinner = cliclack::spinner();
        spinner.start("Installing cloudflared...");
        CloudflareTunnel::install()?;
        spinner.stop("✓ cloudflared installed");
    }

    let spinner = cliclack::spinner();
    spinner.start("Restarting tunnel...");
    CloudflareTunnel::create_systemd_service(config.port)?;
    let _ = run_command("systemctl", &["stop", "dokuru-tunnel"]);
    let tunnel_started_after = CloudflareTunnel::journal_timestamp_now();
    CloudflareTunnel::start_service()?;

    match CloudflareTunnel::wait_for_url_since(&tunnel_started_after, 30) {
        Ok(url) => save_cloudflare_url(config, &url, &spinner),
        Err(e) => {
            spinner.stop("✗ Tunnel started but URL not found");
            cliclack::log::warning(format!("Could not get URL: {e}"))?;
            cliclack::log::info("Run: sudo journalctl -u dokuru-tunnel -n 50 | grep https://")?;
            Ok(())
        }
    }
}

fn save_cloudflare_url(
    config: &InstallerConfig,
    url: &str,
    spinner: &cliclack::ProgressBar,
) -> Result<()> {
    crate::cli::CloudflareTunnel::wait_for_health(url, 60)?;
    spinner.stop(format!("✓ Tunnel restarted: {url}"));
    update_config_access_mode(config, crate::api::AccessMode::Cloudflare, url)?;
    note(
        "Access Updated",
        format!(
            "Mode:    Cloudflare Tunnel\nURL:     {url}\n\n✓ Config saved & service restarted\n→ Update in dashboard"
        ),
    )?;
    restart_agent_service(config)
}

fn configure_direct_access(config: &InstallerConfig) -> Result<()> {
    let url = format!("http://{}:{}", host_ip(), config.port);
    update_config_access_mode(config, crate::api::AccessMode::Direct, &url)?;
    note(
        "Access Updated",
        format!(
            "Mode:    Direct HTTP\nURL:     {url}\n\n✓ Config saved & service restarted\nSetup reverse proxy for HTTPS"
        ),
    )?;
    restart_agent_service(config)
}

fn configure_relay_access(config: &InstallerConfig) -> Result<()> {
    update_config_access_mode(config, crate::api::AccessMode::Relay, "relay")?;
    note(
        "Access Updated",
        "Mode:    Relay Mode\n\
         \n\
         Agent will connect to: wss://api.dokuru.rifuki.dev/ws/agent\n\
         No public URL needed - works behind firewall/NAT\n\
         \n\
         ✓ Config saved & service restarted",
    )?;
    restart_agent_service(config)
}

fn host_ip() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |addr| addr.ip().to_string())
}

fn restart_agent_service(config: &InstallerConfig) -> Result<()> {
    run_command("systemctl", &["restart", &config.service_name])
}

pub fn confirm_action(yes: bool, prompt: &str) -> Result<bool> {
    if yes || !stderr().is_terminal() {
        return Ok(true);
    }

    confirm(prompt)
        .initial_value(true)
        .interact()
        .map_err(Into::into)
}

pub fn update_config_access_mode(
    config: &InstallerConfig,
    mode: crate::api::AccessMode,
    url: &str,
) -> Result<()> {
    use crate::api::{AccessConfig, Config as RuntimeConfig};

    let config_path = runtime_config_path(config);

    // Read existing config
    let mut runtime_config: RuntimeConfig = {
        let content =
            std::fs::read_to_string(&config_path).wrap_err("Failed to read config file")?;
        toml::from_str(&content).wrap_err("Failed to parse config file")?
    };

    // Update access config
    runtime_config.access = AccessConfig {
        mode,
        url: url.to_string(),
        cloudflare_tunnel_id: None,
    };

    // Write back
    let toml_content =
        toml::to_string_pretty(&runtime_config).wrap_err("Failed to serialize config")?;
    std::fs::write(&config_path, toml_content).wrap_err("Failed to write config file")?;

    Ok(())
}

// ─── Display Helpers ──────────────────────────────────────────────────────────

pub fn show_preflight(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    let lines = [
        format!("Distribution:   {}", preflight.distro),
        format!("Architecture:   {}", preflight.arch),
        format!(
            "Privileges:     {}",
            if preflight.running_as_root() {
                "root ✓"
            } else {
                "not root ✗"
            }
        ),
        format!(
            "Init system:    {}",
            if preflight.has_systemd() {
                "systemd ✓"
            } else {
                "systemd not found"
            }
        ),
        format!(
            "Docker:         {}",
            if preflight.docker_installed() {
                "installed ✓"
            } else {
                "not installed ✗"
            }
        ),
        format!(
            "Docker group:   {}",
            if preflight.docker_group_exists() {
                "exists ✓"
            } else {
                "not found ✗"
            }
        ),
        format!(
            "Docker socket:  {} {}",
            config.docker_socket,
            if preflight.docker_installed() && preflight.docker_socket_exists() {
                "✓"
            } else {
                "(not found)"
            }
        ),
        format!(
            "docker.service: {}",
            if preflight.docker_service_exists() {
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

pub fn run_step<T, F>(label: &str, action: F) -> Result<T>
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

pub fn install_binary(source: &Path, destination: &Path) -> Result<()> {
    if source == destination {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| eyre::eyre!("Install path must include a parent directory"))?;

    fs::create_dir_all(parent)
        .wrap_err_with(|| format!("Failed to create {}", parent.display()))?;

    // Write to a temp file in the same directory, then atomically rename.
    // This avoids "Text file busy" (ETXTBSY) when the destination is currently
    // executing — rename replaces the directory entry without touching the
    // running inode, so the live process is unaffected.
    let tmp = destination.with_extension("tmp");
    fs::copy(source, &tmp).wrap_err_with(|| {
        format!(
            "Failed to copy Dokuru binary from {} to {}",
            source.display(),
            tmp.display()
        )
    })?;

    let mut permissions = fs::metadata(&tmp)
        .wrap_err_with(|| format!("Failed to stat {}", tmp.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&tmp, permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", tmp.display()))?;

    fs::rename(&tmp, destination).wrap_err_with(|| {
        format!(
            "Failed to replace {} with updated binary",
            destination.display()
        )
    })?;

    Ok(())
}

pub fn write_config_file(
    config: &InstallerConfig,
    token_hash: Option<String>,
    relay_token: Option<String>,
) -> Result<()> {
    let use_dokuru_group = should_use_dokuru_group_permissions();
    if use_dokuru_group {
        ensure_dokuru_group()?;
    }

    fs::create_dir_all(&config.config_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.config_dir.display()))?;

    // Root-only VPS installs do not need an extra writable admin group.
    let mut dir_permissions = fs::metadata(&config.config_dir)
        .wrap_err_with(|| format!("Failed to stat {}", config.config_dir.display()))?
        .permissions();
    dir_permissions.set_mode(if use_dokuru_group { 0o775 } else { 0o700 });
    fs::set_permissions(&config.config_dir, dir_permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", config.config_dir.display()))?;

    if use_dokuru_group {
        chgrp_dokuru(&config.config_dir)?;
    }

    let config_path = runtime_config_path(config);

    // Preserve existing token and access config when not explicitly replaced
    let existing = crate::api::Config::load().ok();
    let resolved_token = token_hash
        .or_else(|| existing.as_ref().map(|c| c.auth.token_hash.clone()))
        .unwrap_or_default();
    let existing_access = existing
        .as_ref()
        .map(|c| c.access.clone())
        .unwrap_or_default();
    let resolved_relay_token =
        relay_token.or_else(|| existing.as_ref().and_then(|c| c.auth.token.clone()));

    let runtime_config = RuntimeConfig {
        server: ServerConfig {
            port: config.port,
            host: config.host.clone(),
            cors_origins: parse_cors_origins(&config.cors_origins),
        },
        docker: DockerConfig {
            socket: config.docker_socket.clone(),
        },
        auth: AuthConfig {
            token_hash: resolved_token,
            token: resolved_relay_token,
        },
        access: existing_access,
    };
    let toml_content = toml::to_string_pretty(&runtime_config)
        .wrap_err("Failed to serialize Dokuru config to TOML")?;

    fs::write(&config_path, toml_content)
        .wrap_err_with(|| format!("Failed to write {}", config_path.display()))?;

    // Keep group-writable config for sudo-based admin installs; use root-only on root VPSes.
    let mut file_permissions = fs::metadata(&config_path)
        .wrap_err_with(|| format!("Failed to stat {}", config_path.display()))?
        .permissions();
    file_permissions.set_mode(if use_dokuru_group { 0o664 } else { 0o600 });
    fs::set_permissions(&config_path, file_permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", config_path.display()))?;

    if use_dokuru_group {
        chgrp_dokuru(&config_path)?;
    }

    Ok(())
}

fn should_use_dokuru_group_permissions() -> bool {
    should_use_dokuru_group_permissions_for(
        nix_like_is_root(),
        std::env::var("SUDO_USER").ok().as_deref(),
        std::env::var("DOAS_USER").ok().as_deref(),
        std::env::var("USER").ok().as_deref(),
    )
}

fn should_use_dokuru_group_permissions_for(
    running_as_root: bool,
    sudo_user: Option<&str>,
    doas_user: Option<&str>,
    user: Option<&str>,
) -> bool {
    if non_root_env_user(sudo_user).is_some() || non_root_env_user(doas_user).is_some() {
        return true;
    }

    if running_as_root {
        return false;
    }

    non_root_env_user(user).is_some()
}

fn non_root_env_user(user: Option<&str>) -> Option<&str> {
    user.map(str::trim)
        .filter(|user| !user.is_empty() && *user != "root")
}

fn ensure_dokuru_group() -> Result<()> {
    if command_success("getent", &["group", DOKURU_GROUP]) {
        return Ok(());
    }

    if command_success("groupadd", &["--system", DOKURU_GROUP])
        || command_success("groupadd", &[DOKURU_GROUP])
    {
        return Ok(());
    }

    bail!("failed to create required system group '{DOKURU_GROUP}'")
}

fn chgrp_dokuru(path: &Path) -> Result<()> {
    run_command("chgrp", &[DOKURU_GROUP, &path.display().to_string()])
}

/// Write config file preserving existing token
pub fn write_config_file_preserve_token(config: &InstallerConfig) -> Result<()> {
    write_config_file(config, None, None)
}

pub fn write_systemd_unit(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    fs::create_dir_all(&config.systemd_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.systemd_dir.display()))?;

    let after_targets = if preflight.docker_service_exists() {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let wants_targets = if preflight.docker_service_exists() {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let unit_path = config
        .systemd_dir
        .join(format!("{}.service", config.service_name));

    let unit_content = format!(
        "[Unit]\nDescription=Dokuru Docker Hardening Agent\nDocumentation={}\nAfter={}\nWants={}\n\n[Service]\nType=simple\nUser=root\nLogsDirectory=dokuru\nEnvironment=DOKURU_CONFIG={}\nExecStart={} serve\nRestart=on-failure\nRestartSec=5s\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier={}\n\n[Install]\nWantedBy=multi-user.target\n",
        REPO_URL,
        after_targets,
        wants_targets,
        runtime_config_path(config).display(),
        config.install_path.display(),
        config.service_name,
    );

    fs::write(&unit_path, unit_content)
        .wrap_err_with(|| format!("Failed to write {}", unit_path.display()))
}

pub fn setup_log_directory() -> Result<()> {
    let log_dir = Path::new("/var/log/dokuru");

    // Create log directory if it doesn't exist
    if !log_dir.exists() {
        run_command("mkdir", &["-p", "/var/log/dokuru"])?;
    }

    // Set permissions to 755 (root owned, world readable)
    run_command("chmod", &["755", "/var/log/dokuru"])?;

    Ok(())
}

pub fn reload_systemd() -> Result<()> {
    run_command("systemctl", &["daemon-reload"])
}

pub fn enable_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["enable", service_name])
}

pub fn restart_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["restart", service_name])
}

pub fn stop_service_if_present(service_name: &str) -> Result<()> {
    if command_success("systemctl", &["is-active", service_name]) {
        run_command("systemctl", &["stop", service_name])?;
    }
    Ok(())
}

pub fn disable_service_if_present(service_name: &str) -> Result<()> {
    if command_success("systemctl", &["is-enabled", service_name]) {
        run_command("systemctl", &["disable", service_name])?;
    }
    Ok(())
}

pub fn remove_file_if_present(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_file(path).wrap_err_with(|| format!("Failed to remove {}", path.display()))?;
    }
    Ok(())
}

pub fn remove_dir_if_present(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)
            .wrap_err_with(|| format!("Failed to remove {}", path.display()))?;
    }
    Ok(())
}

pub fn detect_checksum_tool() -> Result<ChecksumTool> {
    if command_exists("sha256sum") {
        return Ok(ChecksumTool::Sha256sum);
    }
    if command_exists("shasum") {
        return Ok(ChecksumTool::Shasum);
    }
    bail!("Neither sha256sum nor shasum is available")
}

pub fn normalize_release_tag(release: &str) -> Result<String> {
    let release = release.trim();
    if release.is_empty() {
        bail!("release tag cannot be empty");
    }

    if release == "latest" || release.starts_with('v') {
        return Ok(release.to_string());
    }

    if release
        .chars()
        .next()
        .is_some_and(|character| character.is_ascii_digit())
    {
        return Ok(format!("v{release}"));
    }

    bail!("release must be 'latest' or a version tag like v0.1.0")
}

pub fn release_base_url(release: &str) -> String {
    format!("{RELEASE_DOWNLOAD_BASE_URL}/{release}")
}

pub fn release_asset_name_for(release: &str) -> Result<String> {
    let base_name = release_asset_base_name()?;
    if release == "latest" {
        Ok(base_name.to_string())
    } else {
        Ok(format!("{base_name}-{release}"))
    }
}

fn release_asset_base_name() -> Result<&'static str> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("dokuru-linux-amd64"),
        "aarch64" => Ok("dokuru-linux-arm64"),
        arch => bail!(
            "Unsupported architecture for rolling release update: {}",
            arch
        ),
    }
}

pub fn create_temp_dir(prefix: &str) -> Result<PathBuf> {
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

pub fn download_file(url: &str, output: &Path) -> Result<()> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_mins(3))
        .user_agent(format!("dokuru/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .wrap_err("Failed to build HTTP client")?;
    let partial = partial_download_path(output);
    let mut last_error = String::new();

    for attempt in 1..=DOWNLOAD_ATTEMPTS {
        let _ = fs::remove_file(&partial);
        match download_file_once(&client, url, &partial, output) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                if attempt < DOWNLOAD_ATTEMPTS {
                    std::thread::sleep(Duration::from_secs(u64::from(attempt)));
                }
            }
        }
    }

    let _ = fs::remove_file(&partial);
    bail!(
        "failed to download {} after {} attempt(s): {}",
        url,
        DOWNLOAD_ATTEMPTS,
        last_error
    );
}

fn download_file_once(client: &Client, url: &str, partial: &Path, output: &Path) -> Result<()> {
    let mut response = client
        .get(url)
        .send()
        .wrap_err_with(|| format!("Failed to request {url}"))?
        .error_for_status()
        .wrap_err_with(|| format!("Download returned an error status for {url}"))?;
    let mut file = fs::File::create(partial)
        .wrap_err_with(|| format!("Failed to create {}", partial.display()))?;
    let bytes = std::io::copy(&mut response, &mut file)
        .wrap_err_with(|| format!("Failed to write {}", partial.display()))?;

    if bytes == 0 {
        bail!("downloaded empty response from {url}");
    }

    file.sync_all()
        .wrap_err_with(|| format!("Failed to sync {}", partial.display()))?;
    fs::rename(partial, output).wrap_err_with(|| {
        format!(
            "Failed to move {} to {}",
            partial.display(),
            output.display()
        )
    })
}

fn partial_download_path(output: &Path) -> PathBuf {
    output.with_extension("part")
}

pub fn verify_download_checksum(
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

pub fn command_output(program: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .wrap_err_with(|| format!("Failed to execute {program}"))?;
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

pub fn binary_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn command_success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

pub fn run_command(program: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .wrap_err_with(|| format!("Failed to execute {program}"))?;

    if !status.success() {
        bail!("{} {:?} exited with status {}", program, args, status);
    }

    Ok(())
}

// ─── Utility ──────────────────────────────────────────────────────────────────

pub fn command_exists(program: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {program} >/dev/null 2>&1")])
        .status()
        .is_ok_and(|status| status.success())
}

pub fn has_systemd_unit(unit: &str) -> bool {
    Command::new("systemctl")
        .args(["cat", unit])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

pub fn is_socket(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|metadata| metadata.file_type().is_socket())
}

pub fn nix_like_is_root() -> bool {
    // Use libc geteuid() - most reliable way to check root
    #[cfg(unix)]
    {
        unsafe { libc::geteuid() == 0 }
    }

    #[cfg(not(unix))]
    {
        // Fallback for non-Unix systems
        matches!(std::env::var("USER"), Ok(user) if user == "root")
    }
}

pub fn detect_distro() -> String {
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

pub fn default_install_path() -> PathBuf {
    PathBuf::from("/usr/local/bin/dokuru")
}

pub fn default_config_dir() -> PathBuf {
    PathBuf::from("/etc/dokuru")
}

pub fn default_systemd_dir() -> PathBuf {
    PathBuf::from("/etc/systemd/system")
}

pub fn service_unit_path(config: &InstallerConfig) -> PathBuf {
    config
        .systemd_dir
        .join(format!("{}.service", config.service_name))
}

pub fn runtime_config_path(config: &InstallerConfig) -> PathBuf {
    config_path_in(&config.config_dir)
}

pub fn parse_cors_origins(cors_origins: &str) -> Vec<String> {
    cors_origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>()
}

// ─── Token Generation ────────────────────────────────────────────────────────

/// Generate a new agent token: dok_<64 hex chars>
pub fn generate_agent_token() -> String {
    let random_bytes: [u8; 32] = rand::random();
    format!("dok_{}", hex::encode(random_bytes))
}

/// Hash a token with SHA-256
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::should_use_dokuru_group_permissions_for;

    #[test]
    fn root_login_uses_root_only_permissions() {
        assert!(!should_use_dokuru_group_permissions_for(
            true,
            None,
            None,
            Some("root")
        ));
    }

    #[test]
    fn root_login_with_sudo_root_uses_root_only_permissions() {
        assert!(!should_use_dokuru_group_permissions_for(
            true,
            Some("root"),
            None,
            Some("root")
        ));
    }

    #[test]
    fn sudo_from_non_root_user_uses_group_permissions() {
        assert!(should_use_dokuru_group_permissions_for(
            true,
            Some("rifuki"),
            None,
            Some("root")
        ));
    }

    #[test]
    fn root_process_ignores_stale_user_without_sudo_context() {
        assert!(!should_use_dokuru_group_permissions_for(
            true,
            None,
            None,
            Some("rifuki")
        ));
    }

    #[test]
    fn non_root_process_uses_group_permissions() {
        assert!(should_use_dokuru_group_permissions_for(
            false,
            None,
            None,
            Some("rifuki")
        ));
    }
}
