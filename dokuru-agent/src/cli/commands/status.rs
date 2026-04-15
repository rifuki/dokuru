use super::super::helpers::{
    binary_version, command_success, default_config_dir, load_saved_runtime_config,
};
use cliclack::{intro, log, note, outro};
use eyre::Result;
use std::path::Path;

pub fn run_status() -> Result<()> {
    let config_dir = default_config_dir();
    let saved = load_saved_runtime_config(&config_dir);
    let port = saved.as_ref().map(|c| c.server.port).unwrap_or(3939);
    let docker_socket = saved.as_ref().map_or_else(
        |_| "/var/run/docker.sock".to_string(),
        |c| c.docker.socket.clone(),
    );

    let binary_path = Path::new("/usr/local/bin/dokuru");
    let version = binary_version(binary_path).unwrap_or_else(|| "unknown".to_string());

    let service_active = command_success("systemctl", &["is-active", "dokuru"]);
    let service_enabled = command_success("systemctl", &["is-enabled", "dokuru"]);
    let docker_running = Path::new(&docker_socket).exists();
    let api_base = format!("http://localhost:{port}");
    let api_healthy = reqwest::blocking::Client::new()
        .get(format!("{api_base}/health"))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .is_ok();

    let host_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |a| a.ip().to_string());

    intro("🐳 Dokuru  status")?;

    let service_status = if service_active && service_enabled {
        "active (enabled)"
    } else if service_active {
        "active (disabled)"
    } else {
        "inactive"
    };
    let docker_status = if docker_running {
        "running"
    } else {
        "not running"
    };
    let api_status = if api_healthy {
        "healthy"
    } else {
        "unreachable"
    };

    note(
        "Status",
        format!(
            "Version   {version}\nService   {service_status}\nDocker    {docker_status}\nAPI       {api_status}"
        ),
    )?;

    if api_healthy
        && let Ok(resp) = reqwest::blocking::Client::new()
            .get(format!("{api_base}/api/v1/audit"))
            .timeout(std::time::Duration::from_secs(5))
            .send()
        && let Ok(text) = resp.text()
        && let Ok(json) = serde_json::from_str::<serde_json::Value>(&text)
        && let Some(summary) = json.get("data").and_then(|d| d.get("summary"))
    {
        let score = summary
            .get("score")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        let passed = summary
            .get("passed")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        let failed = summary
            .get("failed")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        note(
            "Last Audit",
            format!("Score   {score}%\nPassed  {passed}\nFailed  {failed}"),
        )?;
    }

    log::info(format!("Agent: {host_ip}:{port}"))?;
    outro("Done.")?;
    Ok(())
}
