use eyre::{Result, WrapErr};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::api::Config;

const RELAY_SERVER: &str = "wss://api.dokuru.rifuki.dev/ws/agent";

/// WebSocket message types (must match server)
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsMessage {
    Auth {
        token: String,
    },
    AuthSuccess {
        agent_id: String,
    },
    AuthFailed {
        reason: String,
    },
    Command {
        id: String,
        command: String,
        payload: serde_json::Value,
    },
    Response {
        id: String,
        success: bool,
        data: serde_json::Value,
    },
    Ping,
    Pong,
}

/// Start relay mode - connect to server via WebSocket
#[allow(clippy::cognitive_complexity)]
pub async fn start_relay_mode(config: Config) -> Result<()> {
    info!("Starting relay mode, connecting to {}", RELAY_SERVER);

    // Get agent token from config
    let token = config.auth.relay_token.ok_or_else(|| {
        eyre::eyre!(
            "No relay token configured. Please set relay_token in config or run onboarding."
        )
    })?;

    loop {
        match connect_and_run(&token).await {
            Ok(()) => {
                info!("Relay connection closed normally");
                break;
            }
            Err(e) => {
                error!("Relay connection error: {}", e);
                warn!("Reconnecting in 2 seconds...");
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
    }

    Ok(())
}

#[allow(clippy::cognitive_complexity)]
async fn connect_and_run(token: &str) -> Result<()> {
    // Connect to relay server
    let (ws_stream, _) = connect_async(RELAY_SERVER)
        .await
        .wrap_err("Failed to connect to relay server")?;

    info!("Connected to relay server");

    let (mut write, mut read) = ws_stream.split();

    // Send auth message
    let auth_msg = serde_json::to_string(&WsMessage::Auth {
        token: token.to_string(),
    })?;
    write.send(Message::Text(auth_msg)).await?;

    // Wait for auth response
    match read.next().await {
        Some(Ok(Message::Text(text))) => {
            let msg: WsMessage = serde_json::from_str(&text)?;
            match msg {
                WsMessage::AuthSuccess { agent_id } => {
                    info!("Authenticated as agent {}", agent_id);
                }
                WsMessage::AuthFailed { reason } => {
                    return Err(eyre::eyre!("Authentication failed: {}", reason));
                }
                _ => {
                    return Err(eyre::eyre!("Unexpected auth response"));
                }
            }
        }
        _ => {
            return Err(eyre::eyre!("Connection closed during auth"));
        }
    }

    // Create channel for sending messages
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

    // Spawn write task
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Spawn keepalive task
    let tx_keepalive = tx.clone();
    let keepalive_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            if tx_keepalive.send(Message::Ping(vec![])).is_err() {
                break;
            }
        }
    });

    // Handle messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_message(&text, &tx) {
                    error!("Error handling message: {}", e);
                }
            }
            Ok(Message::Ping(_)) => {
                let _ = tx.send(Message::Pong(vec![]));
            }
            Ok(Message::Close(_)) => {
                info!("Server closed connection");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    keepalive_task.abort();
    write_task.abort();
    Ok(())
}

fn handle_message(text: &str, tx: &tokio::sync::mpsc::UnboundedSender<Message>) -> Result<()> {
    let msg: WsMessage = serde_json::from_str(text)?;

    match msg {
        WsMessage::Command {
            id,
            command,
            payload,
        } => {
            info!("Received command: {} (id: {})", command, id);

            // Execute command
            let result = execute_command(&command, payload);

            // Send response
            let response = WsMessage::Response {
                id,
                success: result.is_ok(),
                data: result.unwrap_or_else(|e| serde_json::json!({ "error": e.to_string() })),
            };

            tx.send(Message::Text(serde_json::to_string(&response)?))?;
        }
        WsMessage::Ping => {
            tx.send(Message::Text(serde_json::to_string(&WsMessage::Pong)?))?;
        }
        _ => {}
    }

    Ok(())
}

fn execute_command(command: &str, _payload: serde_json::Value) -> Result<serde_json::Value> {
    match command {
        "health" => Ok(serde_json::json!({ "status": "healthy" })),
        "audit" => {
            // TODO: Run actual audit
            Ok(serde_json::json!({ "status": "not_implemented" }))
        }
        _ => Err(eyre::eyre!("Unknown command: {}", command)),
    }
}
