use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;
use crate::audit::{AuditReport, CheckResult, RuleRegistry};
use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures::sink::SinkExt;

pub async fn run_full_audit(State(state): State<AppState>) -> ApiResult<AuditReport> {
    let registry = RuleRegistry::new();
    match registry.run_audit(&state.docker).await {
        Ok(report) => Ok(ApiSuccess::default().with_data(report)),
        Err(e) => Err(ApiError::default().with_message(e.to_string())),
    }
}

pub async fn run_single_audit(
    Path(rule_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<CheckResult> {
    let registry = RuleRegistry::new();
    match registry.check_rule(&rule_id, &state.docker).await {
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
    let registry = RuleRegistry::new();
    let rules = registry.all();

    for rule in rules {
        if let Ok(result) = registry.check_rule(&rule.id, &state.docker).await
            && let Ok(msg) = serde_json::to_string(&result)
            && socket.send(Message::Text(msg.into())).await.is_err()
        {
            break;
        }
        // Small delay to make the websocket UI effect visible
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }

    let _ = socket.close().await;
}
