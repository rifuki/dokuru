use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
};
use bollard::system::EventsOptions;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::time::{Duration, interval};
use tracing::{debug, info};

use crate::api::{feature::info, state::AppState};

/// WebSocket handler for agent connectivity monitoring.
///
/// Clients (the dokuru-www frontend) connect here to track whether this agent
/// is reachable. It also pushes Docker info snapshots on connect and after
/// Docker events so the frontend can update cards without polling.
///
/// Authentication is handled by `agent_auth_middleware` before this handler
/// is reached (token passed as `?token=<token>` query param since browsers
/// cannot set the Authorization header during WS upgrades).
pub async fn ws_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// Returns `true` if the connection should be kept alive, `false` to close.
fn handle_incoming(msg: Option<Result<Message, axum::Error>>) -> bool {
    match msg {
        Some(Ok(Message::Close(_))) | None => false,
        Some(Err(e)) => {
            debug!("WebSocket error: {e}");
            false
        }
        Some(Ok(_)) => true, // pong or any other message — ignore, keep alive
    }
}

#[derive(Serialize)]
struct InfoUpdateMessage {
    r#type: &'static str,
    reason: &'static str,
    data: info::handlers::EnvironmentInfo,
}

#[derive(Serialize)]
struct InfoErrorMessage {
    r#type: &'static str,
    message: String,
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    info!("WebSocket client connected");

    let (mut sender, mut receiver) = socket.split();
    if send_info_update(&mut sender, &state, "connected")
        .await
        .is_err()
    {
        return;
    }

    let mut docker_events = state.docker.events(None::<EventsOptions<String>>);
    let mut info_update_pending = false;

    // 15 s interval — well under Cloudflare Tunnel's ~60 s idle timeout.
    let mut ticker = interval(Duration::from_secs(15));
    let mut info_update_ticker = interval(Duration::from_secs(2));

    // Skip the first immediate tick so we don't ping before the client is ready.
    ticker.tick().await;
    info_update_ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if send_keepalive_ping(&mut sender).await.is_err() {
                    break;
                }
            }
            msg = receiver.next() => {
                if !handle_incoming(msg) {
                    break;
                }
            }
            event = docker_events.next() => {
                match event {
                    Some(Ok(_)) => info_update_pending = true,
                    Some(Err(e)) => debug!("Docker event stream error: {e}"),
                    None => break,
                }
            }
            _ = info_update_ticker.tick(), if info_update_pending => {
                info_update_pending = false;
                if send_info_update(&mut sender, &state, "docker-event").await.is_err() {
                    break;
                }
            }
        }
    }

    info!("WebSocket client disconnected");
}

async fn send_info_update(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    state: &AppState,
    reason: &'static str,
) -> Result<(), axum::Error> {
    match info::refresh_environment_info_snapshot(state).await {
        Ok(data) => {
            send_json(
                sender,
                &InfoUpdateMessage {
                    r#type: "info:update",
                    reason,
                    data,
                },
            )
            .await
        }
        Err(error) => {
            send_json(
                sender,
                &InfoErrorMessage {
                    r#type: "info:error",
                    message: error.message,
                },
            )
            .await
        }
    }
}

async fn send_json<T: Serialize>(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    value: &T,
) -> Result<(), axum::Error> {
    match serde_json::to_string(value) {
        Ok(json) => sender.send(Message::Text(json.into())).await,
        Err(error) => {
            debug!("Failed to serialize WS message: {error}");
            Ok(())
        }
    }
}

async fn send_keepalive_ping(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
) -> Result<(), axum::Error> {
    // Browsers respond automatically with a Pong (opcode 0xA), which Cloudflare
    // Tunnel treats as keepalive activity.
    debug!("Sending protocol ping to WS client");
    sender.send(Message::Ping(vec![].into())).await
}
