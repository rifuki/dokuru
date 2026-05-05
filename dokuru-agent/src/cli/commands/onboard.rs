use super::super::helpers::{
    InstallerConfig, Preflight, collect_preflight, enable_service, generate_agent_token,
    hash_token, install_binary, install_docker, offer_docker_installation, prompt_for_config,
    reload_systemd, resolve_config, restart_service, run_command, run_step, runtime_config_path,
    service_unit_path, setup_log_directory, show_preflight, update_config_access_mode,
    user_in_docker_group, write_config_file, write_systemd_unit,
};
use super::super::types::{SetupArgs, SetupMode};
use crate::api::AccessMode;
use crate::cli::CloudflareTunnel;
use cliclack::{confirm, intro, note, outro, outro_cancel, select};
use eyre::{Result, WrapErr, bail};
use std::io::{IsTerminal, stderr};
use std::path::PathBuf;
use std::process::Command;

fn current_non_root_user() -> Option<String> {
    std::env::var("SUDO_USER")
        .or_else(|_| std::env::var("USER"))
        .ok()
        .filter(|user| !user.is_empty() && user != "root")
}

fn offer_docker_group_membership(preflight: &Preflight, assume_yes: bool) -> Result<()> {
    if !preflight.docker_group_exists() || assume_yes {
        return Ok(());
    }

    let Some(current_user) = current_non_root_user() else {
        return Ok(());
    };

    let in_group = user_in_docker_group(&current_user)?;
    if in_group
        || !confirm(format!(
            "Add user '{current_user}' to docker group? (recommended)"
        ))
        .initial_value(true)
        .interact()?
    {
        return Ok(());
    }

    run_command("usermod", &["-aG", "docker", &current_user])?;
    cliclack::log::success(format!("User '{current_user}' added to docker group"))?;
    cliclack::log::warning(
        "Log out and back in (or run 'newgrp docker') for group changes to take effect",
    )?;

    Ok(())
}

pub fn run(mode: SetupMode, args: SetupArgs) -> Result<()> {
    let SetupPlan {
        mut config,
        source_binary,
        mut preflight,
    } = prepare_setup(mode, args)?;

    ensure_docker_ready(&mut config, &mut preflight)?;
    offer_docker_group_membership(&preflight, config.yes)?;

    let (mut config, _) = prompt_for_config(mode, config)?;
    disable_service_without_systemd(&mut config, &preflight)?;

    let access = select_access(mode)?;
    show_configuration_summary(&config, &preflight, access)?;
    confirm_apply(mode, &config, &source_binary)?;

    install_runtime_files(mode, &config, &source_binary)?;
    let credentials = write_runtime_config(mode, &config)?;

    if apply_service(mode, &config, &preflight)? == ServiceOutcome::Finished {
        return Ok(());
    }

    let access_url = resolve_access_url(mode, access, &config)?;
    persist_access_mode(mode, &config, access, &access_url)?;
    show_next_steps(&config, &credentials, access, &access_url)?;
    outro("Dokuru is ready.")?;

    Ok(())
}

struct SetupPlan {
    config: InstallerConfig,
    source_binary: PathBuf,
    preflight: Preflight,
}

fn prepare_setup(mode: SetupMode, args: SetupArgs) -> Result<SetupPlan> {
    let config = resolve_config(args);
    let source_binary =
        std::env::current_exe().wrap_err("Failed to resolve current Dokuru binary path")?;
    let preflight = collect_preflight(&config);

    intro(format!("🐳 Dokuru  {}", mode.heading()))?;
    warn_existing_config(mode, &config)?;

    if mode == SetupMode::Onboard {
        show_preflight(&config, &preflight)?;
    }
    ensure_root(&preflight, mode)?;

    Ok(SetupPlan {
        config,
        source_binary,
        preflight,
    })
}

fn warn_existing_config(mode: SetupMode, config: &InstallerConfig) -> Result<()> {
    if mode == SetupMode::Onboard && runtime_config_path(config).exists() {
        cliclack::log::warning(
            "Existing configuration found — onboarding will replace it and generate a new token",
        )?;
    }
    Ok(())
}

fn ensure_root(preflight: &Preflight, mode: SetupMode) -> Result<()> {
    if preflight.running_as_root() {
        return Ok(());
    }

    outro_cancel(format!(
        "Root privileges required. Re-run with: sudo dokuru {}",
        mode.command_name()
    ))?;
    bail!("root privileges required");
}

fn ensure_docker_ready(config: &mut InstallerConfig, preflight: &mut Preflight) -> Result<()> {
    if preflight.docker_installed() {
        return Ok(());
    }

    if should_install_docker(config)? {
        install_and_verify_docker(config, preflight)
    } else {
        config.skip_service = true;
        cliclack::log::warning("Continuing without Docker - service will not start")?;
        Ok(())
    }
}

fn should_install_docker(config: &InstallerConfig) -> Result<bool> {
    if config.install_docker && config.yes {
        Ok(true)
    } else {
        offer_docker_installation(config)
    }
}

fn install_and_verify_docker(config: &InstallerConfig, preflight: &mut Preflight) -> Result<()> {
    run_step("Installing Docker", install_docker)?;
    show_docker_versions()?;
    run_step("Starting Docker service", || {
        run_command("systemctl", &["start", "docker"])
    })?;
    log_terminal_info("→ systemctl start docker")?;

    *preflight = collect_preflight(config);
    if !preflight.docker_installed() || !preflight.docker_group_exists() {
        outro_cancel("Docker installation verification failed")?;
        bail!("Docker installation failed");
    }

    cliclack::log::success("Docker is ready")?;
    Ok(())
}

fn show_docker_versions() -> Result<()> {
    if !stderr().is_terminal() {
        return Ok(());
    }

    cliclack::note(
        "Docker installed",
        format!(
            "Engine:  {}\nClient:  {}",
            docker_version("{{.Server.Version}}"),
            docker_version("{{.Client.Version}}")
        ),
    )?;
    Ok(())
}

fn docker_version(format: &str) -> String {
    Command::new("docker")
        .args(["version", "--format", format])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn disable_service_without_systemd(
    config: &mut InstallerConfig,
    preflight: &Preflight,
) -> Result<()> {
    if !config.skip_service && !preflight.has_systemd() {
        cliclack::log::warning("systemd not detected — continuing without a managed service")?;
        config.skip_service = true;
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AccessChoice {
    Cloudflare,
    Direct,
    Relay,
    Domain,
}

impl AccessChoice {
    const fn label(self) -> &'static str {
        match self {
            Self::Cloudflare => "Cloudflare Tunnel",
            Self::Direct => "Direct HTTP",
            Self::Relay => "Relay Mode",
            Self::Domain => "Custom Domain",
        }
    }

    const fn mode(self) -> AccessMode {
        match self {
            Self::Cloudflare => AccessMode::Cloudflare,
            Self::Direct => AccessMode::Direct,
            Self::Relay => AccessMode::Relay,
            Self::Domain => AccessMode::Domain,
        }
    }

    const fn from_mode(mode: &AccessMode) -> Self {
        match mode {
            AccessMode::Cloudflare => Self::Cloudflare,
            AccessMode::Direct => Self::Direct,
            AccessMode::Relay => Self::Relay,
            AccessMode::Domain => Self::Domain,
        }
    }
}

fn select_access(mode: SetupMode) -> Result<AccessChoice> {
    if mode == SetupMode::Configure {
        let existing_config = crate::api::Config::load().unwrap_or_default();
        return Ok(AccessChoice::from_mode(&existing_config.access.mode));
    }

    select("How should this agent be accessible?")
        .item(
            AccessChoice::Cloudflare,
            "Cloudflare Tunnel",
            "Auto HTTPS, no domain needed (recommended)",
        )
        .item(
            AccessChoice::Direct,
            "Direct HTTP",
            "Use your own reverse proxy for HTTPS",
        )
        .item(
            AccessChoice::Relay,
            "Relay Mode",
            "Through dokuru-server via WebSocket",
        )
        .item(
            AccessChoice::Domain,
            "Custom Domain",
            "Auto SSL with your domain (coming soon)",
        )
        .initial_value(AccessChoice::Cloudflare)
        .interact()
        .map_err(Into::into)
}

fn show_configuration_summary(
    config: &InstallerConfig,
    preflight: &Preflight,
    access: AccessChoice,
) -> Result<()> {
    let mut summary_lines = vec![
        format!("Binary:  {}", config.install_path.display()),
        format!("Config:  {}", runtime_config_path(config).display()),
        format!("Port:    {}", config.port),
        format!("Bind:    {}", config.host),
        format!("Docker:  {}", config.docker_socket),
        format!("CORS:    {}", config.cors_origins),
        format!("Access:  {}", access.label()),
    ];

    if let Some(service_line) = service_summary(config, preflight) {
        summary_lines.push(service_line);
    }

    note("Configuration", summary_lines.join("\n"))?;
    Ok(())
}

fn service_summary(config: &InstallerConfig, preflight: &Preflight) -> Option<String> {
    if config.skip_service {
        return Some("Service: skipped".to_string());
    }

    preflight.has_systemd().then(|| {
        format!(
            "Service: {}",
            config
                .systemd_dir
                .join(format!("{}.service", config.service_name))
                .display()
        )
    })
}

fn confirm_apply(mode: SetupMode, config: &InstallerConfig, source_binary: &PathBuf) -> Result<()> {
    if config.yes || !stderr().is_terminal() {
        return Ok(());
    }

    if confirm(apply_prompt(mode, config, source_binary))
        .initial_value(true)
        .interact()?
    {
        Ok(())
    } else {
        outro_cancel("Configuration cancelled.")?;
        bail!("cancelled");
    }
}

fn apply_prompt(mode: SetupMode, config: &InstallerConfig, source_binary: &PathBuf) -> String {
    match mode {
        SetupMode::Onboard if source_binary == &config.install_path => {
            "Apply these settings?".to_string()
        }
        SetupMode::Onboard => format!(
            "Apply these settings and install Dokuru to {}?",
            config.install_path.display()
        ),
        SetupMode::Configure => format!("Apply changes to {}?", config.config_dir.display()),
    }
}

fn install_runtime_files(
    mode: SetupMode,
    config: &InstallerConfig,
    source_binary: &PathBuf,
) -> Result<()> {
    if mode.should_install_binary() && source_binary != &config.install_path {
        run_step("Installing Dokuru binary", || {
            install_binary(source_binary, &config.install_path)
        })?;
    }

    if mode == SetupMode::Onboard {
        run_step("Creating log directory", setup_log_directory)?;
        log_terminal_info("→ /var/log/dokuru")?;
    }

    Ok(())
}

#[derive(Debug)]
struct SetupCredentials {
    agent_token: Option<String>,
    token_hash: Option<String>,
    relay_token: Option<String>,
}

impl SetupCredentials {
    fn for_mode(mode: SetupMode) -> Self {
        let agent_token = (mode == SetupMode::Onboard).then(generate_agent_token);
        let token_hash = agent_token.as_deref().map(hash_token);
        let relay_token = agent_token.clone();

        Self {
            agent_token,
            token_hash,
            relay_token,
        }
    }
}

fn write_runtime_config(mode: SetupMode, config: &InstallerConfig) -> Result<SetupCredentials> {
    let credentials = SetupCredentials::for_mode(mode);
    run_step("Writing Dokuru configuration", || {
        write_config_file(
            config,
            credentials.token_hash.clone(),
            credentials.relay_token.clone(),
        )
    })?;
    log_terminal_info(format!("→ {}", runtime_config_path(config).display()))?;
    Ok(credentials)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ServiceOutcome {
    Continue,
    Finished,
}

fn apply_service(
    mode: SetupMode,
    config: &InstallerConfig,
    preflight: &Preflight,
) -> Result<ServiceOutcome> {
    if !config.skip_service && mode == SetupMode::Onboard {
        install_systemd_service(config, preflight)
    } else if mode == SetupMode::Configure {
        restart_configured_service(config)
    } else {
        Ok(ServiceOutcome::Continue)
    }
}

fn install_systemd_service(
    config: &InstallerConfig,
    preflight: &Preflight,
) -> Result<ServiceOutcome> {
    write_service_files(config, preflight)?;
    reload_and_enable_service(config)?;

    if !preflight.docker_socket_exists() {
        warn_docker_not_ready(config)?;
        return Ok(ServiceOutcome::Finished);
    }

    start_service(config)
}

fn write_service_files(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    run_step("Writing systemd unit", || {
        write_systemd_unit(config, preflight)
    })?;
    log_terminal_info(format!("→ {}", service_unit_path(config).display()))?;

    note(
        "Files written",
        format!(
            "Config:   {}\nService:  {}\nLogs:     /var/log/dokuru",
            runtime_config_path(config).display(),
            service_unit_path(config).display(),
        ),
    )?;
    Ok(())
}

fn reload_and_enable_service(config: &InstallerConfig) -> Result<()> {
    run_step("Reloading systemd", reload_systemd)?;
    log_terminal_info("→ systemctl daemon-reload")?;

    run_step("Enabling Dokuru service", || {
        enable_service(&config.service_name)
    })?;
    log_terminal_info(format!("→ systemctl enable {}", config.service_name))?;
    Ok(())
}

fn warn_docker_not_ready(config: &InstallerConfig) -> Result<()> {
    cliclack::log::warning(format!("Docker is not ready on {}", config.docker_socket))?;
    cliclack::log::info(format!(
        "Start Docker first, then: systemctl restart {}",
        config.service_name
    ))?;
    outro("Dokuru configured. Start Docker to run the service.")?;
    Ok(())
}

fn start_service(config: &InstallerConfig) -> Result<ServiceOutcome> {
    match run_step("Starting Dokuru service", || {
        restart_service(&config.service_name)
    }) {
        Ok(()) => {
            log_terminal_info(format!("→ systemctl start {}", config.service_name))?;
            if stderr().is_terminal() {
                cliclack::log::success("✓ Active and running")?;
            }
            Ok(ServiceOutcome::Continue)
        }
        Err(err) => {
            cliclack::log::warning(format!("Service installed but failed to start: {err}"))?;
            cliclack::log::info(format!(
                "Inspect logs: journalctl -u {} -f",
                config.service_name
            ))?;
            outro("Dokuru configured but service failed to start.")?;
            Ok(ServiceOutcome::Finished)
        }
    }
}

fn restart_configured_service(config: &InstallerConfig) -> Result<ServiceOutcome> {
    note(
        "Configuration Updated",
        format!("Config: {}", runtime_config_path(config).display()),
    )?;
    run_step("Restarting Dokuru service", || {
        run_command("systemctl", &["restart", &config.service_name])
    })?;
    Ok(ServiceOutcome::Continue)
}

fn resolve_access_url(
    mode: SetupMode,
    access: AccessChoice,
    config: &InstallerConfig,
) -> Result<String> {
    if mode == SetupMode::Configure {
        return Ok(crate::api::Config::load().unwrap_or_default().access.url);
    }

    match access {
        AccessChoice::Cloudflare => setup_cloudflare_access(config.port),
        AccessChoice::Direct => Ok(direct_access_url(config.port)),
        AccessChoice::Relay => Ok("wss://api.dokuru.rifuki.dev/ws/agent".to_string()),
        AccessChoice::Domain => Err(eyre::eyre!("Custom domain not yet implemented")),
    }
}

fn setup_cloudflare_access(port: u16) -> Result<String> {
    if !CloudflareTunnel::is_installed() {
        let spinner = cliclack::spinner();
        spinner.start("Installing cloudflared...");
        CloudflareTunnel::install().wrap_err("Failed to install cloudflared")?;
        spinner.stop("✓ cloudflared installed");
    }

    let spinner = cliclack::spinner();
    spinner.start("Starting Cloudflare Tunnel...");

    CloudflareTunnel::create_systemd_service(port).wrap_err("Failed to create systemd service")?;
    let tunnel_started_after = CloudflareTunnel::journal_timestamp_now();
    CloudflareTunnel::start_service().wrap_err("Failed to start tunnel service")?;
    let url = CloudflareTunnel::wait_for_url_since(&tunnel_started_after, 30)
        .wrap_err("Timed out waiting for Cloudflare Tunnel URL")?;
    CloudflareTunnel::wait_for_health(&url, 30)
        .wrap_err("Timed out waiting for Cloudflare Tunnel health")?;

    spinner.stop(format!("✓ Tunnel started: {url}"));
    Ok(url)
}

fn direct_access_url(port: u16) -> String {
    let host = if is_cloud_environment() {
        public_ip()
    } else {
        local_ip()
    };
    format!("http://{host}:{port}")
}

fn is_cloud_environment() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build()
        .is_ok_and(|client| {
            metadata_url_reachable(&client, "http://169.254.169.254/latest/meta-data/")
                || gcp_metadata_reachable(&client)
                || azure_metadata_reachable(&client)
        })
}

fn metadata_url_reachable(client: &reqwest::blocking::Client, url: &str) -> bool {
    client.get(url).send().is_ok()
}

fn gcp_metadata_reachable(client: &reqwest::blocking::Client) -> bool {
    client
        .get("http://metadata.google.internal/computeMetadata/v1/")
        .header("Metadata-Flavor", "Google")
        .send()
        .is_ok()
}

fn azure_metadata_reachable(client: &reqwest::blocking::Client) -> bool {
    client
        .get("http://169.254.169.254/metadata/instance?api-version=2021-02-01")
        .header("Metadata", "true")
        .send()
        .is_ok()
}

fn public_ip() -> String {
    reqwest::blocking::get("https://api.ipify.org")
        .and_then(reqwest::blocking::Response::text)
        .unwrap_or_else(|_| "localhost".to_string())
}

fn local_ip() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |addr| addr.ip().to_string())
}

fn persist_access_mode(
    mode: SetupMode,
    config: &InstallerConfig,
    access: AccessChoice,
    access_url: &str,
) -> Result<()> {
    if mode == SetupMode::Onboard {
        update_config_access_mode(config, access.mode(), access_url)?;
    }
    Ok(())
}

fn show_next_steps(
    config: &InstallerConfig,
    credentials: &SetupCredentials,
    access: AccessChoice,
    access_url: &str,
) -> Result<()> {
    let mut next_steps = Vec::new();
    if !config.skip_service {
        next_steps.push(format!(
            "Logs:      journalctl -u {} -f",
            config.service_name
        ));
    }

    if access == AccessChoice::Relay {
        add_relay_next_steps(&mut next_steps, credentials);
    } else {
        add_url_next_steps(&mut next_steps, credentials, access_url);
    }

    note("Next steps", next_steps.join("\n"))?;
    Ok(())
}

fn add_relay_next_steps(next_steps: &mut Vec<String>, credentials: &SetupCredentials) {
    next_steps.push(
        "Mode:      Relay Mode (No Public URL Needed)\n           → Agent connects to: wss://api.dokuru.rifuki.dev/ws/agent".to_string(),
    );
    if let Some(token) = credentials.agent_token.as_ref() {
        next_steps.push(format!(
            "Token:     {token}\n           → Use this token when adding agent in dashboard"
        ));
    }
}

fn add_url_next_steps(
    next_steps: &mut Vec<String>,
    credentials: &SetupCredentials,
    access_url: &str,
) {
    next_steps.push(format!(
        "Agent URL: {access_url}\n           → Add this as a new environment in your Dokuru dashboard"
    ));
    if let Some(token) = credentials.agent_token.as_ref() {
        next_steps.push(format!(
            "Token:     {token}\n           → Copy this token (shown once only)"
        ));
    }
}

fn log_terminal_info(message: impl std::fmt::Display) -> Result<()> {
    if stderr().is_terminal() {
        cliclack::log::info(message)?;
    }
    Ok(())
}

// ─── Doctor ──────────────────────────────────────────────────────────────────
