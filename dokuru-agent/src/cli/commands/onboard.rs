use super::super::helpers::{
    Preflight, collect_preflight, enable_service, generate_agent_token, hash_token, install_binary,
    install_docker, offer_docker_installation, prompt_for_config, reload_systemd, resolve_config,
    restart_service, run_command, run_step, runtime_config_path, service_unit_path,
    setup_log_directory, show_preflight, update_config_access_mode, user_in_docker_group,
    write_config_file, write_systemd_unit,
};
use super::super::types::{SetupArgs, SetupMode};
use cliclack::{confirm, intro, note, outro, outro_cancel, select};
use eyre::{Result, WrapErr, bail};
use std::io::{IsTerminal, stderr};
use std::path::PathBuf;

fn current_non_root_user() -> Option<String> {
    std::env::var("SUDO_USER")
        .or_else(|_| std::env::var("USER"))
        .ok()
        .filter(|user| !user.is_empty() && user != "root")
}

fn offer_docker_group_membership(preflight: &Preflight, assume_yes: bool) -> Result<()> {
    if !preflight.docker_group_exists || assume_yes {
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

#[allow(clippy::cognitive_complexity, clippy::too_many_lines)]
pub fn run(mode: SetupMode, args: SetupArgs) -> Result<()> {
    let mut config = resolve_config(args);
    let source_binary =
        std::env::current_exe().wrap_err("Failed to resolve current Dokuru binary path")?;

    let mut preflight = collect_preflight(&config);

    intro(format!("🐳 Dokuru  {}", mode.heading()))?;

    if matches!(mode, SetupMode::Onboard) && runtime_config_path(&config).exists() {
        cliclack::log::warning(
            "Existing configuration found — onboarding will replace it and generate a new token",
        )?;
    }

    if matches!(mode, SetupMode::Onboard) {
        show_preflight(&config, &preflight)?;
    }

    if !preflight.running_as_root {
        outro_cancel(format!(
            "Root privileges required. Re-run with: sudo dokuru {}",
            mode.command_name()
        ))?;
        bail!("root privileges required");
    }

    // Validate Docker installation
    if !preflight.docker_installed {
        let should_install = if config.install_docker && config.yes {
            // Auto-install in non-interactive mode with flag
            true
        } else {
            offer_docker_installation(&config)?
        };

        if should_install {
            run_step("Installing Docker", install_docker)?;
            if stderr().is_terminal() {
                use std::process::Command;
                let engine = Command::new("docker")
                    .args(["version", "--format", "{{.Server.Version}}"])
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "unknown".to_string());
                let client = Command::new("docker")
                    .args(["version", "--format", "{{.Client.Version}}"])
                    .output()
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "unknown".to_string());
                cliclack::note(
                    "Docker installed",
                    format!("Engine:  {engine}\nClient:  {client}"),
                )?;
            }
            run_step("Starting Docker service", || {
                run_command("systemctl", &["start", "docker"])
            })?;
            if stderr().is_terminal() {
                cliclack::log::info("→ systemctl start docker")?;
            }

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
    offer_docker_group_membership(&preflight, config.yes)?;

    let (mut config, _) = prompt_for_config(mode, config)?;

    if !config.skip_service && !preflight.has_systemd {
        cliclack::log::warning("systemd not detected — continuing without a managed service")?;
        config.skip_service = true;
    }

    // ─── Access Mode Selection (Onboard only) ────────────────────────────────
    // Ask for access mode BEFORE showing summary, but don't execute yet
    let (access_mode_choice, access_mode_enum) = if mode == SetupMode::Onboard {
        let choice = select("How should this agent be accessible?")
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
            .item(
                "domain",
                "Custom Domain",
                "Auto SSL with your domain (coming soon)",
            )
            .initial_value("cloudflare")
            .interact()?;

        let mode_enum = match choice {
            "cloudflare" => crate::api::AccessMode::Cloudflare,
            "direct" => crate::api::AccessMode::Direct,
            "relay" => crate::api::AccessMode::Relay,
            "domain" => crate::api::AccessMode::Domain,
            _ => unreachable!(),
        };

        (choice, mode_enum)
    } else {
        // Configure mode: keep existing
        let existing_config = crate::api::Config::load().unwrap_or_default();
        let choice = match existing_config.access.mode {
            crate::api::AccessMode::Cloudflare => "cloudflare",
            crate::api::AccessMode::Direct => "direct",
            crate::api::AccessMode::Relay => "relay",
            crate::api::AccessMode::Domain => "domain",
        };
        (choice, existing_config.access.mode)
    };

    // Show summary before applying
    let mut summary_lines = vec![
        format!("Binary:  {}", config.install_path.display()),
        format!("Config:  {}", runtime_config_path(&config).display()),
        format!("Port:    {}", config.port),
        format!("Bind:    {}", config.host),
        format!("Docker:  {}", config.docker_socket),
        format!("CORS:    {}", config.cors_origins),
        format!(
            "Access:  {}",
            match access_mode_choice {
                "cloudflare" => "Cloudflare Tunnel",
                "direct" => "Direct HTTP",
                "relay" => "Relay Mode",
                "domain" => "Custom Domain",
                _ => "Unknown",
            }
        ),
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
    let prompt = match mode {
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

    if mode.should_install_binary() && source_binary != config.install_path {
        run_step("Installing Dokuru binary", || {
            install_binary(&source_binary, &config.install_path)
        })?;
    }

    // Setup log, systemd only for onboard (not configure)
    if mode == SetupMode::Onboard {
        run_step("Creating log directory", setup_log_directory)?;
        if stderr().is_terminal() {
            cliclack::log::info("→ /var/log/dokuru")?;
        }
    }

    // Generate token only for fresh onboard; configure preserves the existing token
    let agent_token = if matches!(mode, SetupMode::Onboard) {
        Some(generate_agent_token())
    } else {
        None
    };
    let token_hash = agent_token.as_deref().map(hash_token);
    let relay_token = agent_token.clone(); // Save actual token for relay mode

    run_step("Writing Dokuru configuration", || {
        write_config_file(&config, token_hash.clone(), relay_token.clone())
    })?;
    if stderr().is_terminal() {
        cliclack::log::info(format!("→ {}", runtime_config_path(&config).display()))?;
    }

    // Write systemd unit only for onboard or if service doesn't exist
    if !config.skip_service && mode == SetupMode::Onboard {
        run_step("Writing systemd unit", || {
            write_systemd_unit(&config, &preflight)
        })?;
        if stderr().is_terminal() {
            cliclack::log::info(format!("→ {}", service_unit_path(&config).display()))?;
        }

        note(
            "Files written",
            format!(
                "Config:   {}\nService:  {}\nLogs:     /var/log/dokuru",
                runtime_config_path(&config).display(),
                service_unit_path(&config).display(),
            ),
        )?;

        run_step("Reloading systemd", reload_systemd)?;
        if stderr().is_terminal() {
            cliclack::log::info("→ systemctl daemon-reload")?;
        }

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
            Ok(()) => {
                if stderr().is_terminal() {
                    cliclack::log::info(format!("→ systemctl start {}", config.service_name))?;
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
    } else if mode == SetupMode::Configure {
        // Configure mode - just show config updated
        note(
            "Configuration Updated",
            format!("Config: {}", runtime_config_path(&config).display()),
        )?;

        // Restart service to apply changes
        run_step("Restarting Dokuru service", || {
            run_command("systemctl", &["restart", &config.service_name])
        })?;
    }

    // Final success message in a box
    let mut next_steps = Vec::new();
    if !config.skip_service {
        next_steps.push(format!(
            "Logs:      journalctl -u {} -f",
            config.service_name
        ));
    }
    let is_cloud = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(1))
        .build()
        .ok()
        .and_then(|c| {
            // AWS/DigitalOcean
            if c.get("http://169.254.169.254/latest/meta-data/")
                .send()
                .is_ok()
            {
                return Some(());
            }
            // GCP
            if c.get("http://metadata.google.internal/computeMetadata/v1/")
                .header("Metadata-Flavor", "Google")
                .send()
                .is_ok()
            {
                return Some(());
            }
            // Azure
            if c.get("http://169.254.169.254/metadata/instance?api-version=2021-02-01")
                .header("Metadata", "true")
                .send()
                .is_ok()
            {
                return Some(());
            }
            None
        })
        .is_some();

    // ─── Access Mode Execution (Onboard only) ────────────────────────────────
    // Execute the chosen access mode setup
    let access_url = if mode == SetupMode::Onboard {
        match access_mode_choice {
            "cloudflare" => {
                use crate::cli::CloudflareTunnel;

                if !CloudflareTunnel::is_installed() {
                    let spinner = cliclack::spinner();
                    spinner.start("Installing cloudflared...");
                    CloudflareTunnel::install().wrap_err("Failed to install cloudflared")?;
                    spinner.stop("✓ cloudflared installed");
                }

                let spinner = cliclack::spinner();
                spinner.start("Starting Cloudflare Tunnel...");

                CloudflareTunnel::create_systemd_service(config.port)
                    .wrap_err("Failed to create systemd service")?;
                CloudflareTunnel::start_service().wrap_err("Failed to start tunnel service")?;

                let url = CloudflareTunnel::wait_for_url(30)
                    .wrap_err("Timed out waiting for Cloudflare Tunnel URL")?;

                spinner.stop(format!("✓ Tunnel started: {url}"));
                url
            }

            "direct" => {
                let host_ip = if is_cloud {
                    reqwest::blocking::get("https://api.ipify.org")
                        .and_then(reqwest::blocking::Response::text)
                        .unwrap_or_else(|_| "localhost".to_string())
                } else {
                    std::net::UdpSocket::bind("0.0.0.0:0")
                        .and_then(|s| {
                            s.connect("8.8.8.8:80")?;
                            s.local_addr()
                        })
                        .map_or_else(|_| "localhost".to_string(), |a| a.ip().to_string())
                };

                format!("http://{}:{}", host_ip, config.port)
            }

            "relay" => "wss://api.dokuru.rifuki.dev/ws/agent".to_string(),

            "domain" => {
                return Err(eyre::eyre!("Custom domain not yet implemented"));
            }

            _ => unreachable!(),
        }
    } else {
        // Configure mode: keep existing URL
        let existing_config = crate::api::Config::load().unwrap_or_default();
        existing_config.access.url
    };

    // Update config with access mode
    if mode == SetupMode::Onboard {
        update_config_access_mode(&config, access_mode_enum, &access_url)?;
    }

    // ─── Next Steps ──────────────────────────────────────────────────────────

    if access_url == "relay" {
        next_steps.push(
            "Mode:      Relay Mode (No Public URL Needed)\n           → Agent connects to: wss://api.dokuru.rifuki.dev/ws/agent".to_string()
        );
        if let Some(token) = agent_token {
            next_steps.push(format!(
                "Token:     {token}\n           → Use this token when adding agent in dashboard"
            ));
        }
    } else {
        next_steps.push(format!(
            "Agent URL: {access_url}\n           → Add this as a new environment in your Dokuru dashboard"
        ));
        if let Some(token) = agent_token {
            next_steps.push(format!(
                "Token:     {token}\n           → Copy this token (shown once only)"
            ));
        }
    }

    note("Next steps", next_steps.join("\n"))?;
    outro("Dokuru is ready.")?;

    Ok(())
}

// ─── Doctor ──────────────────────────────────────────────────────────────────
