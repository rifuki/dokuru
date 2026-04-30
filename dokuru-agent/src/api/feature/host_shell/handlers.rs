use axum::{
    Json,
    extract::{
        Query,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::Value;

use crate::host_shell;

#[derive(Deserialize)]
pub struct HostShellQuery {
    rows: Option<u16>,
    cols: Option<u16>,
    shell: Option<String>,
}

pub async fn detect_shell(Query(query): Query<HostShellQuery>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "shell": host_shell::detect_shell(query.shell.as_deref()),
    }))
}

pub async fn host_shell_ws(Query(query): Query<HostShellQuery>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| handle_host_shell(socket, query))
}

async fn handle_host_shell(socket: WebSocket, query: HostShellQuery) {
    let Ok((shell, mut session)) = host_shell::start(
        query.rows.unwrap_or(24),
        query.cols.unwrap_or(80),
        query.shell.as_deref(),
    ) else {
        return;
    };

    let (mut ws_tx, mut ws_rx) = socket.split();
    let _ = ws_tx
        .send(Message::Binary(
            format!("\x1b[90mDokuru host shell: {shell}\x1b[0m\r\n")
                .into_bytes()
                .into(),
        ))
        .await;

    loop {
        tokio::select! {
            output = session.recv_output() => {
                let Some(output) = output else { break };
                if ws_tx.send(Message::Binary(output.into())).await.is_err() {
                    break;
                }
            }
            input = ws_rx.next() => {
                match input {
                    Some(Ok(Message::Binary(data))) => {
                        if session.send_input(data.to_vec()).is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if !handle_text_message(text.to_string(), &session) {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_)) | Err(_)) | None => break,
                    Some(Ok(_)) => {}
                }
            }
        }
    }

    session.shutdown();
}

fn handle_text_message(text: String, session: &host_shell::HostShellSession) -> bool {
    if let Ok(json) = serde_json::from_str::<Value>(&text)
        && json.get("type").and_then(Value::as_str) == Some("resize")
    {
        handle_resize(&json, session);
        return true;
    }

    session.send_input(text.into_bytes()).is_ok()
}

fn handle_resize(json: &Value, session: &host_shell::HostShellSession) {
    if let (Some(cols), Some(rows)) = (json["cols"].as_u64(), json["rows"].as_u64()) {
        session.resize(
            u16::try_from(rows).unwrap_or(24),
            u16::try_from(cols).unwrap_or(80),
        );
    }
}
