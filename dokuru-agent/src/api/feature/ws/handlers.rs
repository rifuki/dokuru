use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::time::{Duration, interval};
use tracing::{debug, info};

/// WebSocket handler for agent connectivity monitoring.
///
/// Clients (the dokuru-www frontend) connect here to track whether this agent
/// is reachable. The handler sends a WebSocket protocol Ping frame every 15
/// seconds. Browsers reply automatically with a Pong at the protocol level
/// (invisible to JS), which keeps Cloudflare Tunnel's proxy connection alive.
/// The frontend detects disconnection via the WS `onclose` event and marks
/// the agent offline in its UI.
///
/// Authentication is handled by `agent_auth_middleware` before this handler
/// is reached (token passed as `?token=<token>` query param since browsers
/// cannot set the Authorization header during WS upgrades).
pub async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
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

#[allow(clippy::cognitive_complexity)]
async fn handle_socket(socket: WebSocket) {
    info!("WebSocket client connected");

    let (mut sender, mut receiver) = socket.split();
    // 15 s interval — well under Cloudflare Tunnel's ~60 s idle timeout.
    let mut ticker = interval(Duration::from_secs(15));

    // Skip the first immediate tick so we don't ping before the client is ready.
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                // Use a WS protocol Ping frame, not a text message.
                // Browsers respond automatically with a Pong (opcode 0xA),
                // which Cloudflare Tunnel treats as keepalive activity.
                debug!("Sending protocol ping to WS client");
                if sender.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            msg = receiver.next() => {
                if !handle_incoming(msg) {
                    break;
                }
            }
        }
    }

    info!("WebSocket client disconnected");
}
