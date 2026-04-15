use super::super::helpers::{
    collect_preflight, enable_service, install_binary, install_docker, offer_docker_installation,
    prompt_for_config, reload_systemd, resolve_config, restart_service, run_command, run_step,
    runtime_config_path, service_unit_path, setup_dokuru_user, setup_log_directory, show_preflight,
    user_in_docker_group, write_config_file, write_systemd_unit,
};
use super::super::types::{SetupArgs, SetupMode};
use cliclack::{confirm, intro, note, outro, outro_cancel};
use eyre::{Result, WrapErr, bail};
use std::io::{IsTerminal, stderr};
use std::path::PathBuf;

#[allow(clippy::cognitive_complexity, clippy::too_many_lines)]
pub fn run(mode: SetupMode, args: SetupArgs) -> Result<()> {
    let mut config = resolve_config(args);
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
    #[allow(clippy::collapsible_if)]
    if preflight.docker_group_exists && !config.yes {
        if let Ok(current_user) = std::env::var("SUDO_USER").or_else(|_| std::env::var("USER")) {
            if !current_user.is_empty() && current_user != "root" {
                let in_group = user_in_docker_group(&current_user)?;
                if !in_group
                    && confirm(format!(
                        "Add user '{current_user}' to docker group? (recommended)"
                    ))
                    .initial_value(true)
                    .interact()?
                {
                    run_command("usermod", &["-aG", "docker", &current_user])?;
                    cliclack::log::success(format!("User '{current_user}' added to docker group"))?;
                    cliclack::log::warning(
                        "Log out and back in (or run 'newgrp docker') for group changes to take effect",
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
    }

    // Final success message in a box
    let mut next_steps = Vec::new();
    if !config.skip_service {
        next_steps.push(format!(
            "Logs:      journalctl -u {} -f",
            config.service_name
        ));
    }
    let host_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |a| a.ip().to_string());
    next_steps.push(format!(
        "Agent URL: {host_ip}:{}\n           → Add this as a new environment in your Dokuru dashboard",
        config.port
    ));

    note("Next steps", next_steps.join("\n"))?;
    outro("Dokuru is ready.")?;

    Ok(())
}

// ─── Doctor ──────────────────────────────────────────────────────────────────
