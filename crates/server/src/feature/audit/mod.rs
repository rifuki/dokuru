use crate::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::state::AppState;
use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use dokuru_core::{AuditReport, CheckResult, Checker};
use futures::sink::SinkExt;

pub async fn run_full_audit(State(state): State<AppState>) -> ApiResult<AuditReport> {
    let checker = Checker::new(state.docker.clone());
    match checker.run_audit().await {
        Ok(report) => Ok(ApiSuccess::default().with_data(report)),
        Err(e) => Err(ApiError::default().with_message(e.to_string())),
    }
}

pub async fn run_single_audit(
    Path(rule_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<CheckResult> {
    let checker = Checker::new(state.docker.clone());
    match checker.check_single_rule(&rule_id).await {
        Ok(result) => Ok(ApiSuccess::default().with_data(result)),
        Err(e) => Err(ApiError::default()
            .with_code(axum::http::StatusCode::NOT_FOUND)
            .with_message(e.to_string())),
    }
}

pub async fn ws_audit_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
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
