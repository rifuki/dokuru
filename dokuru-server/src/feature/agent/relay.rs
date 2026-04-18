use axum::{
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{info, warn};
use uuid::Uuid;

use crate::state::AppState;

/// Global registry of connected agents
pub type AgentRegistry = Arc<DashMap<String, AgentConnection>>;

/// Agent connection info
#[derive(Clone)]
pub struct AgentConnection {
    pub agent_id: Uuid,
    pub token: String,
    pub tx: mpsc::UnboundedSender<String>,
}

/// WebSocket message types
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
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

/// WebSocket upgrade handler
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle WebSocket connection
async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Wait for auth message
    let auth_result = match receiver.next().await {
        Some(Ok(Message::Text(text))) => match serde_json::from_str::<WsMessage>(&text) {
            Ok(WsMessage::Auth { token }) => authenticate_agent(&state, &token).await,
            _ => {
                let _ = sender
                    .send(Message::Text(
                        serde_json::to_string(&WsMessage::AuthFailed {
                            reason: "First message must be auth".to_string(),
                        })
                        .unwrap()
                        .into(),
                    ))
                    .await;
                return;
            }
        },
        _ => {
            warn!("Agent connection closed before auth");
            return;
        }
    };

    let (agent_id, token) = match auth_result {
        Some((id, tok)) => (id, tok),
        None => {
            let _ = sender
                .send(Message::Text(
                    serde_json::to_string(&WsMessage::AuthFailed {
                        reason: "Invalid token".to_string(),
                    })
                    .unwrap()
                    .into(),
                ))
                .await;
            return;
        }
    };

    // Send auth success
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&WsMessage::AuthSuccess {
                agent_id: agent_id.to_string(),
            })
            .unwrap()
            .into(),
        ))
        .await;

    // Register connection
    let registry = state.agent_registry.clone();
    registry.insert(
        token.clone(),
        AgentConnection {
            agent_id,
            token: token.clone(),
            tx: tx.clone(),
        },
    );

    info!("Agent {} connected via relay", agent_id);

    // Spawn task to send messages to agent
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages from agent
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(msg) = serde_json::from_str::<WsMessage>(&text) {
                match msg {
                    WsMessage::Response { .. } => {
                        // TODO: Forward response to waiting request
                        info!("Received response from agent: {:?}", msg);
                    }
                    WsMessage::Ping => {
                        let _ = tx.send(serde_json::to_string(&WsMessage::Pong).unwrap());
                    }
                    _ => {}
                }
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // Cleanup
    registry.remove(&token);
    info!("Agent {} disconnected", agent_id);
}

/// Authenticate agent by token
async fn authenticate_agent(state: &AppState, token: &str) -> Option<(Uuid, String)> {
    // Query database for agent with this token
    let result = sqlx::query!(
        "SELECT id FROM agents WHERE token_hash = $1",
        hash_token(token)
    )
    .fetch_optional(state.db.pool())
    .await;

    match result {
        Ok(Some(row)) => Some((row.id, token.to_string())),
        _ => None,
    }
}

/// Hash token for comparison
fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
