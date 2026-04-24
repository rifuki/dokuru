use eyre::{Result, WrapErr};
use futures_util::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::{Deserialize, Serialize};
use tokio::{net::TcpStream, sync::mpsc, task::JoinHandle};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::api::Config;

const RELAY_SERVER: &str = "wss://api.dokuru.rifuki.dev/ws/agent";

type RelaySocket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type RelayWriter = SplitSink<RelaySocket, Message>;
type RelayReader = SplitStream<RelaySocket>;

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
pub async fn start_relay_mode(config: Config) -> Result<()> {
    info!("Starting relay mode, connecting to {}", RELAY_SERVER);
    let token = relay_token(config)?;

    reconnect_loop(&token).await
}

fn relay_token(config: Config) -> Result<String> {
    config.auth.relay_token.ok_or_else(|| {
        eyre::eyre!(
            "No relay token configured. Please set relay_token in config or run onboarding."
        )
    })
}

async fn reconnect_loop(token: &str) -> Result<()> {
    loop {
        match connect_and_run(token).await {
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

async fn connect_and_run(token: &str) -> Result<()> {
    let (ws_stream, _) = connect_async(RELAY_SERVER)
        .await
        .wrap_err("Failed to connect to relay server")?;

    info!("Connected to relay server");

    let (mut write, mut read) = ws_stream.split();
    authenticate_relay(&mut write, &mut read, token).await?;

    let (tx, rx) = mpsc::unbounded_channel::<Message>();
    let write_task = spawn_writer(write, rx);
    let keepalive_task = spawn_keepalive(tx.clone());

    relay_read_loop(&mut read, &tx).await;

    keepalive_task.abort();
    write_task.abort();
    Ok(())
}

async fn authenticate_relay(
    write: &mut RelayWriter,
    read: &mut RelayReader,
    token: &str,
) -> Result<()> {
    let auth_msg = serde_json::to_string(&WsMessage::Auth {
        token: token.to_string(),
    })?;
    write.send(Message::Text(auth_msg)).await?;

    match read.next().await {
        Some(Ok(Message::Text(text))) => {
            let agent_id = parse_auth_response(&text)?;
            info!("Authenticated as agent {}", agent_id);
            Ok(())
        }
        _ => Err(eyre::eyre!("Connection closed during auth")),
    }
}

fn parse_auth_response(text: &str) -> Result<String> {
    match serde_json::from_str(text)? {
        WsMessage::AuthSuccess { agent_id } => Ok(agent_id),
        WsMessage::AuthFailed { reason } => Err(eyre::eyre!("Authentication failed: {reason}")),
        _ => Err(eyre::eyre!("Unexpected auth response")),
    }
}

fn spawn_writer(
    mut write: RelayWriter,
    mut rx: mpsc::UnboundedReceiver<Message>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    })
}

fn spawn_keepalive(tx: mpsc::UnboundedSender<Message>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            if tx.send(Message::Ping(vec![])).is_err() {
                break;
            }
        }
    })
}

async fn relay_read_loop(read: &mut RelayReader, tx: &mpsc::UnboundedSender<Message>) {
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_message(&text, tx) {
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
}

fn handle_message(text: &str, tx: &mpsc::UnboundedSender<Message>) -> Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_auth_response_accepts_success() {
        let agent_id = parse_auth_response(r#"{"type":"auth_success","agent_id":"agent-1"}"#);

        assert_eq!(agent_id.unwrap(), "agent-1");
    }

    #[test]
    fn parse_auth_response_rejects_auth_failure() {
        let error = parse_auth_response(r#"{"type":"auth_failed","reason":"bad token"}"#)
            .unwrap_err()
            .to_string();

        assert!(error.contains("bad token"));
    }
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
