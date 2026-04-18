use super::super::helpers::{command_success, run_command};
use cliclack::{intro, outro, outro_cancel};
use eyre::Result;

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
            run_command("systemctl", &["restart", "dokuru-tunnel"])
                .map_err(|e| eyre::eyre!("Failed to restart tunnel: {e}"))?;
            cliclack::log::success("✓ dokuru-tunnel restarted")?;

            // Wait briefly then show the new URL
            std::thread::sleep(std::time::Duration::from_secs(8));
            match crate::cli::CloudflareTunnel::get_tunnel_url() {
                Ok(url) => cliclack::log::info(format!("Tunnel URL: {url}"))?,
                Err(_) => cliclack::log::warning(
                    "Tunnel URL not ready yet — check: journalctl -u dokuru-tunnel -n 20 | grep https",
                )?,
            }
        }
    }

    outro("Restart complete.")?;
    Ok(())
}
