use super::super::helpers::{
    binary_version, command_success, default_config_dir, load_saved_runtime_config,
};
use crate::api::{AccessMode, Config as RuntimeConfig};
use cliclack::{intro, log, note, outro};
use eyre::Result;
use std::path::Path;

pub fn run_status() -> Result<()> {
    let config_dir = default_config_dir();
    let saved = load_saved_runtime_config(&config_dir);
    let settings = StatusSettings::from_runtime(saved.as_ref().ok());
    let status = collect_status(&settings);

    display_status(&status)?;
    display_audit_summary(&status)?;
    log::info(format!(
        "Local: {}:{}",
        status.host_ip, status.settings.port
    ))?;
    outro("Done.")?;
    Ok(())
}

#[derive(Debug)]
struct StatusSettings {
    port: u16,
    docker_socket: String,
    access_mode: Option<AccessMode>,
    access_url: String,
}

impl StatusSettings {
    fn from_runtime(config: Option<&RuntimeConfig>) -> Self {
        config.map_or_else(Self::default, |runtime| Self {
            port: runtime.server.port,
            docker_socket: runtime.docker.socket.clone(),
            access_mode: Some(runtime.access.mode.clone()),
            access_url: runtime.access.url.clone(),
        })
    }

    fn access_mode_label(&self) -> String {
        self.access_mode
            .as_ref()
            .map_or_else(|| "Unknown".to_string(), |mode| format!("{mode:?}"))
    }

    fn is_cloudflare(&self) -> bool {
        self.access_mode == Some(AccessMode::Cloudflare)
    }
}

impl Default for StatusSettings {
    fn default() -> Self {
        Self {
            port: 3939,
            docker_socket: "/var/run/docker.sock".to_string(),
            access_mode: None,
            access_url: "Not configured".to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ServiceStatus {
    ActiveEnabled,
    ActiveDisabled,
    Inactive,
}

impl ServiceStatus {
    fn detect() -> Self {
        let active = command_success("systemctl", &["is-active", "dokuru"]);
        let enabled = command_success("systemctl", &["is-enabled", "dokuru"]);

        match (active, enabled) {
            (true, true) => Self::ActiveEnabled,
            (true, false) => Self::ActiveDisabled,
            (false, _) => Self::Inactive,
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::ActiveEnabled => "active (enabled)",
            Self::ActiveDisabled => "active (disabled)",
            Self::Inactive => "inactive",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HealthStatus {
    Healthy,
    Unreachable,
}

impl HealthStatus {
    const fn from_reachable(reachable: bool) -> Self {
        if reachable {
            Self::Healthy
        } else {
            Self::Unreachable
        }
    }

    const fn is_healthy(self) -> bool {
        matches!(self, Self::Healthy)
    }

    const fn api_label(self) -> &'static str {
        match self {
            Self::Healthy => "healthy",
            Self::Unreachable => "unreachable",
        }
    }
}

#[derive(Debug)]
struct StatusReport {
    settings: StatusSettings,
    version: String,
    service: ServiceStatus,
    docker_running: bool,
    api: HealthStatus,
    tunnel: HealthStatus,
    host_ip: String,
}

impl StatusReport {
    fn overall_healthy(&self) -> bool {
        self.api.is_healthy() && (!self.settings.is_cloudflare() || self.tunnel.is_healthy())
    }

    const fn docker_label(&self) -> &'static str {
        if self.docker_running {
            "running"
        } else {
            "not running"
        }
    }

    const fn access_status_label(&self) -> &'static str {
        match self.settings.access_mode {
            Some(AccessMode::Cloudflare) if self.tunnel.is_healthy() => "✓ Tunnel healthy",
            Some(AccessMode::Cloudflare) => "✗ Tunnel DOWN - Cannot reach endpoint",
            Some(AccessMode::Relay) => "WebSocket relay mode",
            _ => "Direct mode",
        }
    }
}

fn collect_status(settings: &StatusSettings) -> StatusReport {
    let version =
        binary_version(Path::new("/usr/local/bin/dokuru")).unwrap_or_else(|| "unknown".to_string());

    StatusReport {
        settings: StatusSettings {
            port: settings.port,
            docker_socket: settings.docker_socket.clone(),
            access_mode: settings.access_mode.clone(),
            access_url: settings.access_url.clone(),
        },
        version,
        service: ServiceStatus::detect(),
        docker_running: Path::new(&settings.docker_socket).exists(),
        api: HealthStatus::from_reachable(is_url_reachable(
            &format!("http://localhost:{}/health", settings.port),
            2,
        )),
        tunnel: HealthStatus::from_reachable(tunnel_is_reachable(settings)),
        host_ip: host_ip(),
    }
}

fn tunnel_is_reachable(settings: &StatusSettings) -> bool {
    settings.is_cloudflare()
        && settings.access_url.starts_with("https://")
        && is_url_reachable(&format!("{}/health", settings.access_url), 5)
}

fn is_url_reachable(url: &str, timeout_secs: u64) -> bool {
    reqwest::blocking::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .send()
        .is_ok_and(|response| response.status().is_success())
}

fn host_ip() -> String {
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |addr| addr.ip().to_string())
}

fn display_status(status: &StatusReport) -> Result<()> {
    intro("🐳 Dokuru  status")?;

    note(
        "Status",
        format!(
            "Version   {version}\nService   {service_status}\nDocker    {docker_status}\nAPI       {api_status}\nOverall   {overall}",
            version = status.version,
            service_status = status.service.label(),
            docker_status = status.docker_label(),
            api_status = status.api.api_label(),
            overall = if status.overall_healthy() {
                "✓ Healthy"
            } else {
                "✗ Issues detected"
            }
        ),
    )?;

    note(
        "Access",
        format!(
            "Mode      {}\nURL       {}\nStatus    {}",
            status.settings.access_mode_label(),
            status.settings.access_url,
            status.access_status_label()
        ),
    )?;

    if status.settings.is_cloudflare() && !status.tunnel.is_healthy() {
        log::error(
            "❌ Cloudflare Tunnel is DOWN! Agent is NOT accessible from outside.\n   → Refresh tunnel URL: sudo dokuru restart\n   → Or switch to Relay mode: sudo dokuru configure",
        )?;
    }

    Ok(())
}

#[derive(Debug, Eq, PartialEq)]
struct AuditSummary {
    score: u64,
    passed: u64,
    failed: u64,
}

fn display_audit_summary(status: &StatusReport) -> Result<()> {
    if status.api.is_healthy()
        && let Some(summary) = fetch_audit_summary(status.settings.port)
    {
        note(
            "Last Audit",
            format!(
                "Score   {}%\nPassed  {}\nFailed  {}",
                summary.score, summary.passed, summary.failed
            ),
        )?;
    }

    Ok(())
}

fn fetch_audit_summary(port: u16) -> Option<AuditSummary> {
    let response = reqwest::blocking::Client::new()
        .get(format!("http://localhost:{port}/api/v1/audit"))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .ok()?;
    let text = response.text().ok()?;
    let json = serde_json::from_str::<serde_json::Value>(&text).ok()?;
    let summary = json.get("data")?.get("summary")?;
    Some(parse_audit_summary(summary))
}

fn parse_audit_summary(summary: &serde_json::Value) -> AuditSummary {
    AuditSummary {
        score: summary
            .get("score")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default(),
        passed: summary
            .get("passed")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default(),
        failed: summary
            .get("failed")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::{AuditSummary, parse_audit_summary};

    #[test]
    fn parses_audit_summary_with_defaults() {
        let input = serde_json::json!({
            "score": 82,
            "passed": 12
        });

        assert_eq!(
            parse_audit_summary(&input),
            AuditSummary {
                score: 82,
                passed: 12,
                failed: 0,
            }
        );
    }
}
