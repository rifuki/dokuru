use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};
use futures_util::{SinkExt, StreamExt, stream::SplitStream};
use tokio::time::{Duration, interval};
use tracing::{debug, info};

/// WebSocket handler for agent connectivity monitoring.
///
/// Clients (the dokuru-www frontend) connect here to track whether this agent
/// is reachable. The handler keeps the connection alive by sending a JSON ping
/// every 10 seconds. The frontend detects disconnection via the WS `onclose`
/// event and immediately marks the agent offline in its UI.
///
/// Authentication is handled by `agent_auth_middleware` before this handler
/// is reached (token passed as `?token=<token>` query param since browsers
/// cannot set the Authorization header during WS upgrades).
pub async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

/// Returns `true` if the connection should be kept alive, `false` to close.
async fn handle_incoming(msg: Option<Result<Message, axum::Error>>) -> bool {
    match msg {
        Some(Ok(Message::Close(_))) | None => false,
        Some(Err(e)) => {
            debug!("WebSocket error: {e}");
            false
        }
        Some(Ok(_)) => true, // pong or any other message — ignore, keep alive
    }
}

async fn handle_socket(socket: WebSocket) {
    info!("WebSocket client connected");

    let (mut sender, mut receiver): (_, SplitStream<WebSocket>) = socket.split();
    let mut ticker = interval(Duration::from_secs(10));

    // Skip the first immediate tick so we don't ping before the client is ready.
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                debug!("Sending ping to WS client");
                let ping = Message::Text(r#"{"type":"ping"}"#.to_owned().into());
                if sender.send(ping).await.is_err() {
                    break;
                }
            }
            msg = receiver.next() => {
                if !handle_incoming(msg).await {
                    break;
                }
            }
        }
    }

    info!("WebSocket client disconnected");
}
