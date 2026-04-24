use axum::{
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};
use dashmap::DashMap;
use futures::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::{sync::mpsc, task::JoinHandle};
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
    let (sender, mut receiver) = socket.split();
    let (tx, rx) = mpsc::unbounded_channel::<String>();

    let Some((agent_id, token, sender)) = authenticate_socket(sender, &mut receiver, &state).await
    else {
        return;
    };

    let registry = state.agent_registry.clone();
    register_agent_connection(&state, &registry, agent_id, &token, tx.clone()).await;

    let heartbeat_task = spawn_heartbeat(state.db.pool().clone(), agent_id);
    let mut send_task = spawn_agent_sender(sender, rx);
    let mut recv_task = spawn_agent_receiver(receiver, tx);

    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
            heartbeat_task.abort();
        },
        _ = &mut recv_task => {
            send_task.abort();
            heartbeat_task.abort();
        },
    }

    unregister_agent_connection(&state, &registry, agent_id, &token);
}

async fn authenticate_socket(
    mut sender: SplitSink<WebSocket, Message>,
    receiver: &mut SplitStream<WebSocket>,
    state: &AppState,
) -> Option<(Uuid, String, SplitSink<WebSocket, Message>)> {
    let token = match receiver.next().await {
        Some(Ok(Message::Text(text))) => auth_message_token(&text),
        Some(Err(_)) | None => {
            warn!("Agent connection closed before auth");
            return None;
        }
        Some(_) => Err("First message must be text auth"),
    };

    let Ok(token) = token else {
        send_ws_message(
            &mut sender,
            WsMessage::AuthFailed {
                reason: "First message must be auth".to_string(),
            },
        )
        .await;
        return None;
    };

    let Some((agent_id, token)) = authenticate_agent(state, &token).await else {
        send_ws_message(
            &mut sender,
            WsMessage::AuthFailed {
                reason: "Invalid token".to_string(),
            },
        )
        .await;
        return None;
    };

    send_ws_message(
        &mut sender,
        WsMessage::AuthSuccess {
            agent_id: agent_id.to_string(),
        },
    )
    .await;

    Some((agent_id, token, sender))
}

fn auth_message_token(text: &str) -> Result<String, &'static str> {
    match serde_json::from_str::<WsMessage>(text) {
        Ok(WsMessage::Auth { token }) => Ok(token),
        _ => Err("First message must be auth"),
    }
}

async fn send_ws_message(sender: &mut SplitSink<WebSocket, Message>, message: WsMessage) {
    match serde_json::to_string(&message) {
        Ok(text) => {
            let _ = sender.send(Message::Text(text.into())).await;
        }
        Err(error) => warn!("Failed to serialize websocket message: {error}"),
    }
}

async fn register_agent_connection(
    state: &AppState,
    registry: &AgentRegistry,
    agent_id: Uuid,
    token: &str,
    tx: mpsc::UnboundedSender<String>,
) {
    let _ = sqlx::query!(
        "UPDATE agents SET last_seen = NOW() WHERE id = $1",
        agent_id
    )
    .execute(state.db.pool())
    .await;

    registry.insert(
        token.to_string(),
        AgentConnection {
            agent_id,
            token: token.to_string(),
            tx,
        },
    );

    info!("Agent {} connected via relay", agent_id);
    state.ws_manager.broadcast_agent_connected(agent_id);
}

fn unregister_agent_connection(
    state: &AppState,
    registry: &AgentRegistry,
    agent_id: Uuid,
    token: &str,
) {
    registry.remove(token);
    info!("Agent {} disconnected", agent_id);
    state.ws_manager.broadcast_agent_disconnected(agent_id);
}

fn spawn_heartbeat(db_pool: sqlx::PgPool, agent_id: Uuid) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            let result = sqlx::query!(
                "UPDATE agents SET last_seen = NOW() WHERE id = $1",
                agent_id
            )
            .execute(&db_pool)
            .await;

            if result.is_err() {
                break;
            }
        }
    })
}

fn spawn_agent_sender(
    mut sender: SplitSink<WebSocket, Message>,
    mut rx: mpsc::UnboundedReceiver<String>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    })
}

fn spawn_agent_receiver(
    mut receiver: SplitStream<WebSocket>,
    tx: mpsc::UnboundedSender<String>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            handle_agent_message(&tx, &text);
        }
    })
}

fn handle_agent_message(tx: &mpsc::UnboundedSender<String>, text: &str) {
    let Ok(msg) = serde_json::from_str::<WsMessage>(text) else {
        return;
    };

    match msg {
        WsMessage::Response { .. } => {
            // TODO: Forward response to waiting request.
            info!("Received response from agent: {:?}", msg);
        }
        WsMessage::Ping => {
            if let Ok(pong) = serde_json::to_string(&WsMessage::Pong) {
                let _ = tx.send(pong);
            }
        }
        _ => {}
    }
}

/// Authenticate agent by token
async fn authenticate_agent(state: &AppState, token: &str) -> Option<(Uuid, String)> {
    // Query database for agent with this token (runtime query)
    let result = sqlx::query_as::<_, (Uuid,)>("SELECT id FROM agents WHERE token_hash = $1")
        .bind(hash_token(token))
        .fetch_optional(state.db.pool())
        .await;

    match result {
        Ok(Some((id,))) => Some((id, token.to_string())),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_message_token_accepts_auth_payload() {
        let token = auth_message_token(r#"{"type":"auth","token":"agent-token"}"#);

        assert_eq!(token, Ok("agent-token".to_string()));
    }

    #[test]
    fn auth_message_token_rejects_non_auth_payload() {
        let token = auth_message_token(r#"{"type":"ping"}"#);

        assert_eq!(token, Err("First message must be auth"));
    }

    #[test]
    fn hash_token_is_sha256_hex() {
        let hash = hash_token("agent-token");

        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|ch| ch.is_ascii_hexdigit()));
    }
}
