use eyre::{Result, WrapErr};
use std::process::{Command, Stdio};

pub struct CloudflareTunnel;

impl CloudflareTunnel {
    /// Check if cloudflared is installed
    pub fn is_installed() -> bool {
        Command::new("cloudflared")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    /// Install cloudflared binary
    pub fn install() -> Result<()> {
        let arch = std::env::consts::ARCH;

        let download_url = match arch {
            "x86_64" => {
                "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
            }
            "aarch64" => {
                "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
            }
            _ => return Err(eyre::eyre!("Unsupported architecture: {}", arch)),
        };

        // Download
        let output = Command::new("curl")
            .args(["-L", "-o", "/tmp/cloudflared", download_url])
            .output()
            .wrap_err("Failed to download cloudflared")?;

        if !output.status.success() {
            return Err(eyre::eyre!("Failed to download cloudflared"));
        }

        // Make executable
        Command::new("chmod")
            .args(["+x", "/tmp/cloudflared"])
            .status()
            .wrap_err("Failed to make cloudflared executable")?;

        // Move to /usr/local/bin
        Command::new("sudo")
            .args(["mv", "/tmp/cloudflared", "/usr/local/bin/cloudflared"])
            .status()
            .wrap_err("Failed to install cloudflared to /usr/local/bin")?;

        Ok(())
    }

    /// Create systemd service for cloudflared
    pub fn create_systemd_service(port: u16) -> Result<()> {
        let service_content = format!(
            r"[Unit]
Description=Cloudflare Tunnel for Dokuru Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:{port}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"
        );

        eprintln!("→ Creating systemd service file");
        std::fs::write("/tmp/dokuru-tunnel.service", &service_content)
            .wrap_err("Failed to write service file")?;

        // Move to systemd directory
        Command::new("sudo")
            .args([
                "mv",
                "/tmp/dokuru-tunnel.service",
                "/etc/systemd/system/dokuru-tunnel.service",
            ])
            .status()
            .wrap_err("Failed to install systemd service")?;

        // Reload systemd
        Command::new("sudo")
            .args(["systemctl", "daemon-reload"])
            .output()
            .wrap_err("Failed to reload systemd")?;

        Ok(())
    }

    /// Start (or restart if already running) the tunnel service
    pub fn start_service() -> Result<()> {
        Command::new("sudo")
            .args(["systemctl", "enable", "dokuru-tunnel"])
            .output()
            .wrap_err("Failed to enable dokuru-tunnel service")?;

        // Use restart so a stale running instance is replaced
        let output = Command::new("sudo")
            .args(["systemctl", "restart", "dokuru-tunnel"])
            .output()
            .wrap_err("Failed to restart dokuru-tunnel service")?;

        if !output.status.success() {
            return Err(eyre::eyre!(
                "Failed to restart service: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(())
    }

    /// Get the tunnel URL from journal entries within the given time window.
    fn get_tunnel_url_since(since: &str) -> Result<String> {
        let output = Command::new("journalctl")
            .args(["-u", "dokuru-tunnel", "--since", since, "--no-pager"])
            .output()
            .wrap_err("Failed to read tunnel logs")?;

        let logs = String::from_utf8_lossy(&output.stdout);

        for line in logs.lines().rev() {
            if let Some(url) = extract_url(line) {
                return Ok(url);
            }
        }

        Err(eyre::eyre!("Tunnel URL not found in logs."))
    }

    /// Get the tunnel URL from the last 60 seconds (after a fresh restart).
    pub fn get_tunnel_url() -> Result<String> {
        Self::get_tunnel_url_since("60 seconds ago").map_err(|_| {
            eyre::eyre!("Tunnel URL not found in recent logs. Service may still be starting.")
        })
    }

    /// Get the tunnel URL from the currently running session (up to 24 h back).
    /// Use this when the tunnel has been running for a while and you just want
    /// to know its current URL without restarting it.
    pub fn get_current_url() -> Result<String> {
        Self::get_tunnel_url_since("24 hours ago").map_err(|_| {
            eyre::eyre!(
                "Tunnel URL not found in logs. \
                 Try restarting the tunnel: sudo systemctl restart dokuru-tunnel"
            )
        })
    }

    /// Poll journal until a fresh tunnel URL appears, up to `timeout_secs`.
    pub fn wait_for_url(timeout_secs: u64) -> Result<String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

        while std::time::Instant::now() < deadline {
            if let Ok(url) = Self::get_tunnel_url() {
                return Ok(url);
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }

        Err(eyre::eyre!(
            "Timed out after {timeout_secs}s waiting for tunnel URL. \
             Check: journalctl -u dokuru-tunnel -f"
        ))
    }

    /// Check if tunnel service is running
    pub fn is_service_running() -> bool {
        Command::new("systemctl")
            .args(["is-active", "dokuru-tunnel"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }
}

/// Extract URL from cloudflared output
fn extract_url(line: &str) -> Option<String> {
    // Look for https://xxx.trycloudflare.com
    if let Some(start) = line.find("https://") {
        let url_part = &line[start..];

        // Find end of URL (whitespace or end of line)
        let end = url_part.find(char::is_whitespace).unwrap_or(url_part.len());

        let url = url_part[..end].trim();

        // Validate it's a trycloudflare.com URL
        if url.contains("trycloudflare.com") {
            return Some(url.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_url() {
        let line = "2024-04-18T14:00:00Z INF |  https://abc-123.trycloudflare.com";
        assert_eq!(
            extract_url(line),
            Some("https://abc-123.trycloudflare.com".to_string())
        );

        let line2 =
            "Your quick Tunnel has been created! Visit it at: https://test.trycloudflare.com";
        assert_eq!(
            extract_url(line2),
            Some("https://test.trycloudflare.com".to_string())
        );

        let line3 = "No URL here";
        assert_eq!(extract_url(line3), None);
    }
}
