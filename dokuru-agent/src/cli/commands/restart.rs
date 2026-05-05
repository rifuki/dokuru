use super::super::helpers::{command_success, default_config_dir, run_command};
use crate::api::{AccessMode, Config as RuntimeConfig, config_path_in};
use cliclack::{intro, outro, outro_cancel};
use eyre::{Result, WrapErr};
use std::path::Path;

pub fn run_restart(service_only: bool) -> Result<()> {
    intro("🐳 Dokuru  restart")?;

    let service_active = command_success("systemctl", &["is-active", "dokuru"]);
    if !service_active {
        cliclack::log::warning("dokuru service is not running — starting it instead")?;
    }

    run_command("systemctl", &["restart", "dokuru"])
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
            run_command("systemctl", &["restart", "dokuru-tunnel"])
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
    use super::persist_cloudflare_url_at;
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

    fn temp_config_path(test_name: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        std::env::temp_dir()
            .join(format!("dokuru-{test_name}-{nonce}"))
            .join("config.toml")
    }
}
