use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::state::AppState;

use super::{protocol::{AgentMessage, ServerMessage}, session::AgentSession};

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    token: String,
}

/// WebSocket upgrade handler
pub async fn ws_agent_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, query.token, state))
}

async fn handle_socket(socket: WebSocket, token: String, state: AppState) {
    // Verify token
    let token_record = match state.token_service.verify(&token).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            warn!("Invalid token attempted WebSocket connection");
            return;
        }
        Err(e) => {
            error!("Token verification error: {:?}", e);
            return;
        }
    };

    let user_id = token_record.user_id;
    let token_id = token_record.id;

    // Check if environment exists for this token
    let environment = match state.env_repo.find_by_token(&state.db, token_id).await {
        Ok(Some(env)) => env,
        Ok(None) => {
            // Create new environment
            match state
                .env_repo
                .create(&state.db, user_id, token_id, None, None)
                .await
            {
                Ok(env) => {
                    info!("Created new environment: {}", env.id);
                    env
                }
                Err(e) => {
                    error!("Failed to create environment: {:?}", e);
                    return;
                }
            }
        }
        Err(e) => {
            error!("Database error: {:?}", e);
            return;
        }
    };

    let env_id = environment.id;

    // Update environment status to online
    if let Err(e) = state.env_repo.update_status(&state.db, env_id, "online").await {
        error!("Failed to update environment status: {:?}", e);
    }

    info!(
        "Agent connected: env_id={}, user_id={}, token_id={}",
        env_id, user_id, token_id
    );

    // Split socket
    let (mut sender, mut receiver) = socket.split();

    // Create channel for sending messages to agent
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register session
    let session = AgentSession::new(env_id, user_id, token_id, tx);
    state.agents.insert(env_id, session);

    // Spawn task to forward messages from channel to WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    let mut recv_task = tokio::spawn({
        let state = state.clone();
        async move {
            while let Some(Ok(msg)) = receiver.next().await {
                if let Message::Text(text) = msg {
                    if let Err(e) = handle_agent_message(&text, env_id, &state).await {
                        error!("Error handling agent message: {:?}", e);
                    }
                }
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }

    // Cleanup on disconnect
    state.agents.remove(&env_id);
    if let Err(e) = state.env_repo.update_status(&state.db, env_id, "offline").await {
        error!("Failed to update environment status on disconnect: {:?}", e);
    }

    info!("Agent disconnected: env_id={}", env_id);
}

async fn handle_agent_message(
    text: &str,
    env_id: Uuid,
    state: &AppState,
) -> eyre::Result<()> {
    let message: AgentMessage = serde_json::from_str(text)?;

    match message {
        AgentMessage::AgentInfo {
            hostname,
            docker_version,
        } => {
            info!("Agent info: hostname={:?}, docker_version={:?}", hostname, docker_version);
            
            // Update environment info
            state
                .env_repo
                .update_info(&state.db, env_id, hostname.as_deref(), docker_version.as_deref())
                .await?;
        }
        AgentMessage::AuditResult {
            audit_id,
            score,
            results,
        } => {
            info!("Audit result received: audit_id={}, score={}", audit_id, score);
            
            // Save audit result to database
            if let Err(e) = state
                .audit_service
                .save_result(env_id, score, &results)
                .await
            {
                error!("Failed to save audit result: {:?}", e);
            }
        }
        AgentMessage::Heartbeat => {
            // Update last_seen
            state.env_repo.update_last_seen(&state.db, env_id).await?;
        }
    }

    Ok(())
}
