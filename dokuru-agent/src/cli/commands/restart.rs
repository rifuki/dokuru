use super::super::helpers::{command_success, default_config_dir, nix_like_is_root};
use crate::api::{AccessMode, Config as RuntimeConfig, config_path_in};
use cliclack::{intro, outro, outro_cancel};
use eyre::{Result, WrapErr, bail};
use std::{
    io::{IsTerminal, stderr, stdin},
    path::Path,
    process::{Command, Stdio},
};

pub fn run_restart(service_only: bool) -> Result<()> {
    intro("🐳 Dokuru  restart")?;

    let service_active = command_success("systemctl", &["is-active", "dokuru"]);
    if !service_active {
        cliclack::log::warning("dokuru service is not running — starting it instead")?;
    }

    restart_systemd_unit("dokuru")
        .map_err(|e| eyre::eyre!("Failed to restart dokuru service: {e}"))?;

    let now_active = command_success("systemctl", &["is-active", "dokuru"]);
    if now_active {
        cliclack::log::success("✓ dokuru restarted")?;
    } else {
        outro_cancel("dokuru failed to start — check: journalctl -u dokuru -n 20")?;
        return Ok(());
    }

    if !service_only {
        let tunnel_exists = command_success("systemctl", &["cat", "dokuru-tunnel"]);
        if tunnel_exists {
            let tunnel_started_after = crate::cli::CloudflareTunnel::journal_timestamp_now();
            restart_systemd_unit("dokuru-tunnel")
                .map_err(|e| eyre::eyre!("Failed to restart tunnel: {e}"))?;
            cliclack::log::success("✓ dokuru-tunnel restarted")?;

            match crate::cli::CloudflareTunnel::wait_for_url_since(&tunnel_started_after, 30) {
                Ok(url) => {
                    if let Err(error) = persist_cloudflare_url(&url) {
                        cliclack::log::warning(format!("Tunnel URL not saved to config: {error}"))?;
                    }
                    cliclack::log::info(format!("Tunnel URL: {url}"))?;
                    match crate::cli::CloudflareTunnel::wait_for_health(&url, 60) {
                        Ok(()) => cliclack::log::success("✓ tunnel reachable")?,
                        Err(error) => cliclack::log::warning(format!(
                            "Tunnel URL saved but not reachable yet: {error}"
                        ))?,
                    }
                }
                Err(_) => cliclack::log::warning(
                    "Tunnel URL not ready yet — check: journalctl -u dokuru-tunnel -n 20 | grep https",
                )?,
            }
        }
    }

    outro("Restart complete.")?;
    Ok(())
}

fn restart_systemd_unit(unit: &str) -> Result<()> {
    let command = systemd_restart_command(unit);
    run_systemd_command(&command).map_err(|error| {
        if command.program == "sudo" && !command.interactive {
            eyre::eyre!(
                "{error}. Passwordless sudo is required in non-interactive sessions; run `sudo dokuru restart` from a terminal or allow this user to run systemctl via sudo without a password"
            )
        } else {
            error
        }
    })
}

fn systemd_restart_command(unit: &str) -> SystemdCommand {
    systemd_restart_command_for_context(unit, nix_like_is_root(), can_prompt_for_sudo_password())
}

fn systemd_restart_command_for_context(
    unit: &str,
    is_root: bool,
    can_prompt_for_password: bool,
) -> SystemdCommand {
    if is_root {
        return SystemdCommand {
            program: "systemctl".to_string(),
            args: vec!["restart".to_string(), unit.to_string()],
            interactive: false,
        };
    }

    if can_prompt_for_password {
        return SystemdCommand {
            program: "sudo".to_string(),
            args: vec![
                "systemctl".to_string(),
                "restart".to_string(),
                unit.to_string(),
            ],
            interactive: true,
        };
    }

    SystemdCommand {
        program: "sudo".to_string(),
        args: vec![
            "-n".to_string(),
            "systemctl".to_string(),
            "restart".to_string(),
            unit.to_string(),
        ],
        interactive: false,
    }
}

fn can_prompt_for_sudo_password() -> bool {
    stdin().is_terminal() && stderr().is_terminal()
}

fn run_systemd_command(command: &SystemdCommand) -> Result<()> {
    let mut process = Command::new(&command.program);
    process.args(&command.args);

    if command.interactive {
        process
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
    } else {
        process.stdout(Stdio::null()).stderr(Stdio::null());
    }

    let status = process
        .status()
        .wrap_err_with(|| format!("Failed to execute {}", command.program))?;

    if !status.success() {
        bail!(
            "{} {:?} exited with status {}",
            command.program,
            command.args,
            status
        );
    }

    Ok(())
}

#[derive(Debug, Eq, PartialEq)]
struct SystemdCommand {
    program: String,
    args: Vec<String>,
    interactive: bool,
}

fn persist_cloudflare_url(url: &str) -> Result<()> {
    let config_path = config_path_in(&default_config_dir());
    persist_cloudflare_url_at(&config_path, url)
}

fn persist_cloudflare_url_at(config_path: &Path, url: &str) -> Result<()> {
    let content = std::fs::read_to_string(config_path)
        .wrap_err_with(|| format!("Failed to read {}", config_path.display()))?;
    let mut config: RuntimeConfig = toml::from_str(&content)
        .wrap_err_with(|| format!("Failed to parse {}", config_path.display()))?;

    if config.access.mode != AccessMode::Cloudflare || config.access.url == url {
        return Ok(());
    }

    config.access.url = url.to_string();
    let content = toml::to_string_pretty(&config).wrap_err("Failed to serialize config")?;
    std::fs::write(config_path, content)
        .wrap_err_with(|| format!("Failed to write {}", config_path.display()))
}

#[cfg(test)]
mod tests {
    use super::{persist_cloudflare_url_at, systemd_restart_command_for_context};
    use crate::api::{AccessMode, Config as RuntimeConfig};

    #[test]
    fn updates_saved_cloudflare_url() {
        let config_path = temp_config_path("updates_saved_cloudflare_url");
        let mut config = RuntimeConfig::default();
        config.access.mode = AccessMode::Cloudflare;
        config.access.url = "https://old.trycloudflare.com".to_string();

        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(&config_path, toml::to_string_pretty(&config).unwrap()).unwrap();

        persist_cloudflare_url_at(&config_path, "https://new.trycloudflare.com").unwrap();

        let saved: RuntimeConfig =
            toml::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(saved.access.url, "https://new.trycloudflare.com");

        std::fs::remove_dir_all(config_path.parent().unwrap()).unwrap();
    }

    #[test]
    fn does_not_change_non_cloudflare_url() {
        let config_path = temp_config_path("does_not_change_non_cloudflare_url");
        let mut config = RuntimeConfig::default();
        config.access.mode = AccessMode::Direct;
        config.access.url = "http://10.0.0.1:3939".to_string();

        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(&config_path, toml::to_string_pretty(&config).unwrap()).unwrap();

        persist_cloudflare_url_at(&config_path, "https://new.trycloudflare.com").unwrap();

        let saved: RuntimeConfig =
            toml::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(saved.access.url, "http://10.0.0.1:3939");

        std::fs::remove_dir_all(config_path.parent().unwrap()).unwrap();
    }

    #[test]
    fn non_root_interactive_restart_uses_sudo_password_prompt() {
        let command = systemd_restart_command_for_context("dokuru", false, true);

        assert_eq!(command.program, "sudo");
        assert_eq!(command.args, ["systemctl", "restart", "dokuru"]);
        assert!(command.interactive);
    }

    #[test]
    fn non_root_non_interactive_restart_requires_passwordless_sudo() {
        let command = systemd_restart_command_for_context("dokuru", false, false);

        assert_eq!(command.program, "sudo");
        assert_eq!(command.args, ["-n", "systemctl", "restart", "dokuru"]);
        assert!(!command.interactive);
    }

    #[test]
    fn root_restart_uses_systemctl_directly() {
        let command = systemd_restart_command_for_context("dokuru", true, false);

        assert_eq!(command.program, "systemctl");
        assert_eq!(command.args, ["restart", "dokuru"]);
        assert!(!command.interactive);
    }

    fn temp_config_path(test_name: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        std::env::temp_dir()
            .join(format!("dokuru-{test_name}-{nonce}"))
            .join("config.toml")
    }
}
