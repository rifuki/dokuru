use super::super::helpers::{binary_version, command_success};
use std::path::Path;

pub fn run_status() {
    let binary_path = Path::new("/usr/local/bin/dokuru");
    let version = binary_version(binary_path).unwrap_or_else(|| "unknown".to_string());

    // Check service status
    let service_active = command_success("systemctl", &["is-active", "dokuru"]);
    let service_enabled = command_success("systemctl", &["is-enabled", "dokuru"]);

    // Check Docker
    let docker_running = command_success("docker", &["info"]);

    // Check API health
    let api_healthy = reqwest::blocking::Client::new()
        .get("http://localhost:3939/health")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .is_ok();

    // Print status
    println!("🐳 Dokuru Status\n");
    println!("Version:  {version}");
    println!(
        "Service:  {} {}",
        if service_active {
            "✓ active"
        } else {
            "✗ inactive"
        },
        if service_enabled {
            "(enabled)"
        } else {
            "(disabled)"
        }
    );
    println!(
        "Docker:   {}",
        if docker_running {
            "✓ running"
        } else {
            "✗ not running"
        }
    );
    println!(
        "API:      {}",
        if api_healthy {
            "✓ healthy"
        } else {
            "✗ unreachable"
        }
    );

    if api_healthy {
        // Try to get audit summary
        if let Ok(resp) = reqwest::blocking::Client::new()
            .get("http://localhost:3939/api/v1/audit")
            .timeout(std::time::Duration::from_secs(5))
            .send()
            && let Ok(text) = resp.text()
            && let Ok(json) = serde_json::from_str::<serde_json::Value>(&text)
            && let Some(data) = json.get("data")
            && let Some(summary) = data.get("summary")
        {
            println!("\nLast Audit:");
            println!(
                "  Score:  {}%",
                summary
                    .get("score")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0)
            );
            println!(
                "  Passed: {}",
                summary
                    .get("passed")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0)
            );
            println!(
                "  Failed: {}",
                summary
                    .get("failed")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0)
            );
        }
    }
}
