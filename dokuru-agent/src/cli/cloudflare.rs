use chrono::Local;
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

    /// Return a journalctl timestamp suitable for filtering future tunnel logs.
    pub fn journal_timestamp_now() -> String {
        Local::now().format("%Y-%m-%d %H:%M:%S%.6f").to_string()
    }

    /// Poll journal until a tunnel URL appears after `since`, up to `timeout_secs`.
    pub fn wait_for_url_since(since: &str, timeout_secs: u64) -> Result<String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

        while std::time::Instant::now() < deadline {
            if let Ok(url) = Self::get_tunnel_url_since(since) {
                return Ok(url);
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }

        Err(eyre::eyre!(
            "Timed out after {timeout_secs}s waiting for tunnel URL. \
             Check: journalctl -u dokuru-tunnel -f"
        ))
    }

    /// Poll cloudflared's local readiness until the active tunnel matches `url`.
    pub fn wait_for_health(url: &str, timeout_secs: u64) -> Result<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

        while std::time::Instant::now() < deadline {
            if Self::is_ready_for_url(url) {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }

        Err(eyre::eyre!(
            "Timed out after {timeout_secs}s waiting for cloudflared readiness"
        ))
    }

    pub fn is_ready_for_url(url: &str) -> bool {
        Self::ready_connections() > 0
            && Self::active_url().is_some_and(|active| normalize_url(&active) == normalize_url(url))
    }

    fn active_url() -> Option<String> {
        Self::metrics_url().or_else(|| Self::get_tunnel_url_since("24 hours ago").ok())
    }

    fn metrics_url() -> Option<String> {
        let body = curl_output("http://127.0.0.1:20241/metrics", 3)?;
        body.lines().find_map(parse_metrics_hostname)
    }

    fn ready_connections() -> u64 {
        let Some(body) = curl_output("http://127.0.0.1:20241/ready", 3) else {
            return 0;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) else {
            return 0;
        };
        let status = value
            .get("status")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default();
        if status != 200 {
            return 0;
        }
        value
            .get("readyConnections")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default()
    }
}

fn curl_output(url: &str, timeout_secs: u64) -> Option<String> {
    let timeout = timeout_secs.to_string();
    let output = Command::new("curl")
        .args(["-fsS", "--max-time", &timeout, url])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn normalize_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn parse_metrics_hostname(line: &str) -> Option<String> {
    let hostname = line
        .strip_prefix("cloudflared_tunnel_user_hostnames_counts{userHostname=\"")?
        .split('"')
        .next()?;
    if hostname.contains("trycloudflare.com") {
        Some(hostname.to_string())
    } else {
        None
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

    #[test]
    fn test_parse_metrics_hostname() {
        let line = "cloudflared_tunnel_user_hostnames_counts{userHostname=\"https://abc.trycloudflare.com\"} 1";
        assert_eq!(
            parse_metrics_hostname(line),
            Some("https://abc.trycloudflare.com".to_string())
        );

        assert_eq!(parse_metrics_hostname("go_goroutines 12"), None);
    }
}
