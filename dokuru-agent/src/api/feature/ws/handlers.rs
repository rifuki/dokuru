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
use tokio::sync::mpsc;
use tokio::time::{Duration, interval};
use tracing::{debug, info, warn};

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

enum InfoWsMessage {
    Update(InfoUpdateMessage),
    Error(InfoErrorMessage),
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    info!("WebSocket client connected");

    let (mut sender, mut receiver) = socket.split();

    let (info_request_tx, info_request_rx) = mpsc::channel::<&'static str>(8);
    let (info_message_tx, mut info_message_rx) = mpsc::channel::<InfoWsMessage>(8);
    spawn_info_refresh_worker(state.clone(), info_request_rx, info_message_tx);

    let (docker_event_tx, mut docker_event_rx) = mpsc::channel::<()>(32);
    spawn_docker_event_watcher(state.clone(), docker_event_tx);

    let _ = info_request_tx.try_send("connected");
    let mut info_update_pending = false;
    let mut info_channel_open = true;
    let mut docker_event_channel_open = true;

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
            message = info_message_rx.recv(), if info_channel_open => {
                match message {
                    Some(message) => {
                        if send_info_message(&mut sender, message).await.is_err() {
                            break;
                        }
                    }
                    None => info_channel_open = false,
                }
            }
            docker_event = docker_event_rx.recv(), if docker_event_channel_open => {
                match docker_event {
                    Some(()) => info_update_pending = true,
                    None => docker_event_channel_open = false,
                }
            }
            _ = info_update_ticker.tick(), if info_update_pending => {
                info_update_pending = false;
                let _ = info_request_tx.try_send("docker-event");
            }
        }
    }

    info!("WebSocket client disconnected");
}

fn spawn_info_refresh_worker(
    state: AppState,
    mut request_rx: mpsc::Receiver<&'static str>,
    message_tx: mpsc::Sender<InfoWsMessage>,
) {
    tokio::spawn(async move {
        while let Some(reason) = request_rx.recv().await {
            let message = info_update_message(&state, reason).await;
            if message_tx.send(message).await.is_err() {
                break;
            }
        }
    });
}

fn spawn_docker_event_watcher(state: AppState, event_tx: mpsc::Sender<()>) {
    tokio::spawn(async move {
        let mut docker_events = state.docker.events(None::<EventsOptions<String>>);

        while let Some(event) = docker_events.next().await {
            match event {
                Ok(_) => {
                    if event_tx.send(()).await.is_err() {
                        break;
                    }
                }
                Err(error) => debug!("Docker event stream error: {error}"),
            }
        }

        warn!("Docker event stream ended; keeping status WebSocket alive without event pushes");
    });
}

async fn info_update_message(state: &AppState, reason: &'static str) -> InfoWsMessage {
    match info::refresh_environment_info_snapshot(state).await {
        Ok(data) => InfoWsMessage::Update(InfoUpdateMessage {
            r#type: "info:update",
            reason,
            data,
        }),
        Err(error) => InfoWsMessage::Error(InfoErrorMessage {
            r#type: "info:error",
            message: error.message,
        }),
    }
}

async fn send_info_message(
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: InfoWsMessage,
) -> Result<(), axum::Error> {
    match message {
        InfoWsMessage::Update(update) => send_json(sender, &update).await,
        InfoWsMessage::Error(error) => send_json(sender, &error).await,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_info() -> info::handlers::EnvironmentInfo {
        info::handlers::EnvironmentInfo {
            docker_version: "29.4.1".to_string(),
            api_version: Some("1.45".to_string()),
            os: "linux".to_string(),
            architecture: "x86_64".to_string(),
            hostname: Some("test-host".to_string()),
            kernel_version: Some("6.8".to_string()),
            docker_root_dir: Some("/var/lib/docker".to_string()),
            storage_driver: Some("overlay2".to_string()),
            logging_driver: Some("json-file".to_string()),
            containers: info::handlers::ContainerStats {
                total: 2,
                running: 1,
                stopped: 1,
                healthy: 1,
                unhealthy: 0,
            },
            stacks: 1,
            volumes: 3,
            images: 4,
            networks: 5,
            cpu_count: 2,
            memory_total: 4 * 1024 * 1024 * 1024,
        }
    }

    #[test]
    fn info_update_message_contract_is_stable() {
        let value = serde_json::to_value(InfoUpdateMessage {
            r#type: "info:update",
            reason: "connected",
            data: sample_info(),
        })
        .expect("message should serialize");

        assert_eq!(value["type"], "info:update");
        assert_eq!(value["reason"], "connected");
        assert_eq!(value["data"]["docker_version"], "29.4.1");
        assert_eq!(value["data"]["containers"]["running"], 1);
    }

    #[test]
    fn info_error_message_contract_is_stable() {
        let value = serde_json::to_value(InfoErrorMessage {
            r#type: "info:error",
            message: "docker unavailable".to_string(),
        })
        .expect("message should serialize");

        assert_eq!(value["type"], "info:error");
        assert_eq!(value["message"], "docker unavailable");
    }
}
