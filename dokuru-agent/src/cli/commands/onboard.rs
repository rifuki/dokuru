use cliclack::{confirm, intro, note, outro, outro_cancel};
use super::super::types::*;
use super::super::helpers::*;
use eyre::{Result, WrapErr, bail};
use std::io::{IsTerminal, stderr};
use std::path::PathBuf;

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
        next_steps.push(format!(
            "Logs:      journalctl -u {} -f",
            config.service_name
        ));
    }
    next_steps.push(format!("Dashboard: http://<your-host>:{}", config.port));

    note("Next steps", next_steps.join("\n"))?;
    outro("Dokuru is ready.")?;

    Ok(())
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

