use axum::{
    extract::{Path, State, ws::{WebSocketUpgrade, WebSocket, Message}},
    response::IntoResponse,
    Json,
};
use dokuru_core::{Checker, AuditReport, CheckResult};
use crate::state::AppState;
use futures::{sink::SinkExt, stream::StreamExt};

pub async fn run_full_audit(State(state): State<AppState>) -> Result<Json<AuditReport>, axum::http::StatusCode> {
    let checker = Checker::new(state.docker.clone());
    match checker.run_audit().await {
        Ok(report) => Ok(Json(report)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}

pub async fn run_single_audit(
    Path(rule_id): Path<String>,
    State(state): State<AppState>
) -> Result<Json<CheckResult>, axum::http::StatusCode> {
    let checker = Checker::new(state.docker.clone());
    match checker.check_single_rule(&rule_id).await {
        Ok(result) => Ok(Json(result)),
        Err(_) => Err(axum::http::StatusCode::NOT_FOUND),
    }
}

pub async fn ws_audit_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let checker = Checker::new(state.docker.clone());
    let rules = dokuru_core::get_all_rules();
    
    for rule in rules {
        if let Ok(result) = checker.check_single_rule(&rule.id).await {
            if let Ok(msg) = serde_json::to_string(&result) {
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
        }
        // Small delay to make the websocket UI effect visible
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }
    
    let _ = socket.close().await;
}
