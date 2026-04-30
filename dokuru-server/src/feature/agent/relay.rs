use axum::{
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};
use base64::{Engine as _, engine::general_purpose};
use chrono::{Duration, Utc};
use dashmap::DashMap;
use futures::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration as StdDuration};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
};
use tracing::{info, warn};
use uuid::Uuid;

use super::entity::Agent;
use crate::state::AppState;

/// Global registry of connected agents
pub type AgentRegistry = Arc<DashMap<String, AgentConnection>>;

/// Agent connection info
#[derive(Clone)]
pub struct AgentConnection {
    pub agent_id: Uuid,
    pub token: String,
    pub tx: mpsc::UnboundedSender<String>,
    pending: Arc<DashMap<String, oneshot::Sender<RelayResponse>>>,
    streams: Arc<DashMap<String, mpsc::UnboundedSender<RelayStreamEvent>>>,
}

#[derive(Debug)]
struct RelayResponse {
    success: bool,
    data: serde_json::Value,
}

#[derive(Debug)]
enum RelayStreamEvent {
    Data(Vec<u8>),
    Close(Option<String>),
}

#[derive(Clone, Copy)]
pub enum RelayStreamMode {
    Binary,
    Text,
}

#[derive(Debug, thiserror::Error)]
pub enum RelayCommandError {
    #[error("Agent is not connected via relay")]
    AgentOffline,
    #[error("Failed to serialize relay command: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("Relay connection closed before command could be sent")]
    Send,
    #[error("Relay command timed out")]
    Timeout,
    #[error("Relay command response channel closed")]
    Dropped,
    #[error("Relay command failed: {0}")]
    Command(String),
}

const RELAY_COMMAND_TIMEOUT: StdDuration = StdDuration::from_mins(3);

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
    StreamOpen {
        id: String,
        stream: String,
        payload: serde_json::Value,
    },
    StreamData {
        id: String,
        data: String,
    },
    StreamClose {
        id: String,
        reason: Option<String>,
    },
    Ping,
    Pong,
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn send_command(
    registry: &AgentRegistry,
    agent_id: Uuid,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, RelayCommandError> {
    send_command_with_timeout(registry, agent_id, command, payload, RELAY_COMMAND_TIMEOUT).await
}

async fn send_command_with_timeout(
    registry: &AgentRegistry,
    agent_id: Uuid,
    command: &str,
    payload: serde_json::Value,
    timeout: StdDuration,
) -> Result<serde_json::Value, RelayCommandError> {
    let connection = registry
        .iter()
        .find_map(|entry| (entry.agent_id == agent_id).then(|| entry.clone()))
        .ok_or(RelayCommandError::AgentOffline)?;

    let id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    connection.pending.insert(id.clone(), tx);

    let message = serde_json::to_string(&WsMessage::Command {
        id: id.clone(),
        command: command.to_string(),
        payload,
    })?;

    if connection.tx.send(message).is_err() {
        connection.pending.remove(&id);
        return Err(RelayCommandError::Send);
    }

    let response = match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(response)) => response,
        Ok(Err(_)) => return Err(RelayCommandError::Dropped),
        Err(_) => {
            connection.pending.remove(&id);
            return Err(RelayCommandError::Timeout);
        }
    };

    if response.success {
        Ok(response.data)
    } else {
        Err(RelayCommandError::Command(
            response
                .data
                .get("error")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Agent command failed")
                .to_string(),
        ))
    }
}

pub async fn proxy_stream_to_websocket(
    socket: WebSocket,
    registry: AgentRegistry,
    agent_id: Uuid,
    stream: &str,
    payload: serde_json::Value,
    mode: RelayStreamMode,
) {
    let relay_stream = match open_stream(&registry, agent_id, stream, payload) {
        Ok(stream) => stream,
        Err(error) => {
            close_socket_with_error(socket, error.to_string()).await;
            return;
        }
    };

    bridge_browser_and_agent(socket, relay_stream, mode).await;
}

struct RelayStream {
    id: String,
    tx: mpsc::UnboundedSender<String>,
    rx: mpsc::UnboundedReceiver<RelayStreamEvent>,
    streams: Arc<DashMap<String, mpsc::UnboundedSender<RelayStreamEvent>>>,
}

fn open_stream(
    registry: &AgentRegistry,
    agent_id: Uuid,
    stream: &str,
    payload: serde_json::Value,
) -> Result<RelayStream, RelayCommandError> {
    let connection = find_connection(registry, agent_id).ok_or(RelayCommandError::AgentOffline)?;
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::unbounded_channel();
    connection.streams.insert(id.clone(), tx);

    let message = serde_json::to_string(&WsMessage::StreamOpen {
        id: id.clone(),
        stream: stream.to_string(),
        payload,
    })?;

    if connection.tx.send(message).is_err() {
        connection.streams.remove(&id);
        return Err(RelayCommandError::Send);
    }

    Ok(RelayStream {
        id,
        tx: connection.tx.clone(),
        rx,
        streams: connection.streams,
    })
}

fn find_connection(registry: &AgentRegistry, agent_id: Uuid) -> Option<AgentConnection> {
    registry
        .iter()
        .find_map(|entry| (entry.agent_id == agent_id).then(|| entry.clone()))
}

async fn close_socket_with_error(mut socket: WebSocket, error: String) {
    let _ = socket.send(Message::Text(error.into())).await;
    let _ = socket.close().await;
}

async fn bridge_browser_and_agent(
    socket: WebSocket,
    mut relay_stream: RelayStream,
    mode: RelayStreamMode,
) {
    let (mut browser_tx, mut browser_rx) = socket.split();
    let mut keepalive = tokio::time::interval(tokio::time::Duration::from_secs(15));
    keepalive.tick().await;

    loop {
        tokio::select! {
            _ = keepalive.tick() => {
                if browser_tx.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            relay_event = relay_stream.rx.recv() => {
                match relay_event {
                    Some(RelayStreamEvent::Data(data)) => {
                        let message = match mode {
                            RelayStreamMode::Binary => Message::Binary(data.into()),
                            RelayStreamMode::Text => Message::Text(String::from_utf8_lossy(&data).into_owned().into()),
                        };
                        if browser_tx.send(message).await.is_err() {
                            break;
                        }
                    }
                    Some(RelayStreamEvent::Close(reason)) => {
                        if let Some(reason) = reason {
                            let _ = browser_tx.send(Message::Text(reason.into())).await;
                        }
                        break;
                    }
                    None => break,
                }
            }
            browser_message = browser_rx.next() => {
                match browser_message {
                    Some(Ok(Message::Binary(data))) => {
                        if relay_stream.send_data(data.to_vec()).is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if relay_stream.send_data(text.to_string().into_bytes()).is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                    Some(Ok(_)) => {}
                }
            }
        }
    }

    relay_stream.close(None);
}

impl RelayStream {
    fn send_data(&self, data: Vec<u8>) -> Result<(), RelayCommandError> {
        let message = serde_json::to_string(&WsMessage::StreamData {
            id: self.id.clone(),
            data: general_purpose::STANDARD.encode(data),
        })?;
        self.tx.send(message).map_err(|_| RelayCommandError::Send)
    }

    fn close(&self, reason: Option<String>) {
        self.streams.remove(&self.id);
        if let Ok(message) = serde_json::to_string(&WsMessage::StreamClose {
            id: self.id.clone(),
            reason,
        }) {
            let _ = self.tx.send(message);
        }
    }
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
    let pending = Arc::new(DashMap::new());
    let streams = Arc::new(DashMap::new());
    register_agent_connection(
        &state,
        &registry,
        agent_id,
        &token,
        tx.clone(),
        pending.clone(),
        streams.clone(),
    )
    .await;

    let heartbeat_task = spawn_heartbeat(state.db.pool().clone(), agent_id);
    let mut send_task = spawn_agent_sender(sender, rx);
    let mut recv_task = spawn_agent_receiver(receiver, tx, pending, streams);

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
    pending: Arc<DashMap<String, oneshot::Sender<RelayResponse>>>,
    streams: Arc<DashMap<String, mpsc::UnboundedSender<RelayStreamEvent>>>,
) {
    let agent = sqlx::query_as::<_, Agent>("SELECT * FROM agents WHERE id = $1")
        .bind(agent_id)
        .fetch_optional(state.db.pool())
        .await
        .ok()
        .flatten();
    let should_notify = agent
        .as_ref()
        .is_some_and(|agent| should_notify_connected(agent.last_seen));

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
            pending,
            streams,
        },
    );

    info!("Agent {} connected via relay", agent_id);
    state.ws_manager.broadcast_agent_connected(agent_id);

    if let Some(agent) = agent
        && should_notify
    {
        if let Err(error) = state
            .notification_service
            .notify_agent_connected(state.db.pool(), agent.user_id, agent.id, &agent.name)
            .await
        {
            warn!("Failed to create agent connection notification: {error}");
        } else {
            state.ws_manager.broadcast_notifications_updated();
        }
    }
}

fn should_notify_connected(last_seen: Option<chrono::DateTime<Utc>>) -> bool {
    last_seen
        .is_none_or(|seen_at| Utc::now().signed_duration_since(seen_at) > Duration::minutes(10))
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
    pending: Arc<DashMap<String, oneshot::Sender<RelayResponse>>>,
    streams: Arc<DashMap<String, mpsc::UnboundedSender<RelayStreamEvent>>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(message) = receiver.next().await {
            match message {
                Ok(Message::Text(text)) => handle_agent_message(&tx, &pending, &streams, &text),
                Ok(Message::Close(_)) | Err(_) => break,
                Ok(_) => {}
            }
        }

        for entry in streams.iter() {
            let _ = entry.value().send(RelayStreamEvent::Close(Some(
                "Relay agent disconnected".to_string(),
            )));
        }
        streams.clear();
    })
}

fn handle_agent_message(
    tx: &mpsc::UnboundedSender<String>,
    pending: &DashMap<String, oneshot::Sender<RelayResponse>>,
    streams: &DashMap<String, mpsc::UnboundedSender<RelayStreamEvent>>,
    text: &str,
) {
    let Ok(msg) = serde_json::from_str::<WsMessage>(text) else {
        return;
    };

    match msg {
        WsMessage::Response { id, success, data } => {
            if let Some((_, sender)) = pending.remove(&id) {
                let _ = sender.send(RelayResponse { success, data });
            } else {
                info!("Received response for unknown relay command id: {}", id);
            }
        }
        WsMessage::Ping => {
            if let Ok(pong) = serde_json::to_string(&WsMessage::Pong) {
                let _ = tx.send(pong);
            }
        }
        WsMessage::StreamData { id, data } => {
            let Ok(data) = general_purpose::STANDARD.decode(data) else {
                return;
            };
            if let Some(sender) = streams.get(&id) {
                let _ = sender.send(RelayStreamEvent::Data(data));
            }
        }
        WsMessage::StreamClose { id, reason } => {
            if let Some((_, sender)) = streams.remove(&id) {
                let _ = sender.send(RelayStreamEvent::Close(reason));
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
