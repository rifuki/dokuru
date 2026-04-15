mod protocol;
mod ws_client;

use eyre::Result;
use tokio::time::{Duration, interval};
use tracing::{error, info};

use self::{
    protocol::{AgentMessage, ServerMessage},
    ws_client::WsClient,
};

pub async fn run_agent(server_url: String, token: String) -> Result<()> {
    info!("Starting agent mode");
    info!("Server: {}", server_url);

    // Get system info
    let hostname = hostname::get().ok().and_then(|h| h.into_string().ok());

    let docker_version = get_docker_version().await;

    // Connect to server
    let client = WsClient::new(server_url, token);
    let (tx, mut rx) = client.connect().await?;

    // Send agent info
    let agent_info = AgentMessage::AgentInfo {
        hostname: hostname.clone(),
        docker_version: docker_version.clone(),
    };
    tx.send(agent_info)?;

    info!(
        "Agent info sent: hostname={:?}, docker_version={:?}",
        hostname, docker_version
    );

    // Heartbeat task
    let tx_heartbeat = tx.clone();
    tokio::spawn(async move {
        let mut heartbeat_interval = interval(Duration::from_secs(30));
        loop {
            heartbeat_interval.tick().await;
            if tx_heartbeat.send(AgentMessage::Heartbeat).is_err() {
                break;
            }
        }
    });

    // Handle server messages
    while let Some(msg) = rx.recv().await {
        match msg {
            ServerMessage::AuditStart { audit_id } => {
                info!("Received audit request: {}", audit_id);

                // Run audit in background
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    if let Err(e) = run_audit(audit_id, tx_clone).await {
                        error!("Audit failed: {}", e);
                    }
                });
            }
            ServerMessage::Ping => {
                // Respond with heartbeat
                let _ = tx.send(AgentMessage::Heartbeat);
            }
        }
    }

    info!("Agent disconnected");
    Ok(())
}

async fn get_docker_version() -> Option<String> {
    use bollard::Docker;

    let docker = Docker::connect_with_local_defaults().ok()?;
    let version = docker.version().await.ok()?;
    Some(version.version.unwrap_or_default())
}

async fn run_audit(
    audit_id: uuid::Uuid,
    tx: tokio::sync::mpsc::UnboundedSender<AgentMessage>,
) -> Result<()> {
    info!("Running audit: {}", audit_id);

    // Run setup to get audit results
    let results = crate::audit::run_audit_report().await?;

    // Calculate score (percentage of passed checks)
    let total = results.len();
    let passed = results
        .iter()
        .filter(|r| r.status == crate::audit::CheckStatus::Pass)
        .count();
    let score = if total > 0 {
        ((passed as f64 / total as f64) * 100.0) as i32
    } else {
        0
    };

    info!(
        "Audit completed: score={}, total={}, passed={}",
        score, total, passed
    );

    // Send results to server
    let results_json = serde_json::to_value(&results)?;
    let message = AgentMessage::AuditResult {
        audit_id,
        score,
        results: results_json,
    };

    tx.send(message)?;

    Ok(())
}
