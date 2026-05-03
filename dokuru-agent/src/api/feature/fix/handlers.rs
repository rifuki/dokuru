use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;
use crate::audit::{
    CheckResult, FixHistoryEntry, FixOutcome, FixPreview, FixProgress, FixRequest, RollbackRequest,
    RuleRegistry, fix_helpers,
};
use axum::{
    Json,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};

pub async fn apply_fix(
    State(state): State<AppState>,
    Json(payload): Json<FixRequest>,
) -> ApiResult<FixOutcome> {
    let registry = RuleRegistry::new();
    let rollback_plan = fix_helpers::rollback_plan_for_request(&state.docker, &payload)
        .await
        .unwrap_or_default();

    match Box::pin(registry.fix_request(&payload, &state.docker)).await {
        Ok(outcome) => {
            fix_helpers::record_fix_history(payload, outcome.clone(), rollback_plan, Vec::new())
                .await;
            Ok(ApiSuccess::default()
                .with_message("Remediation handled")
                .with_data(outcome))
        }
        Err(e) => Err(ApiError::default()
            .with_message("Failed to process remediation request")
            .with_debug(&e.to_string())),
    }
}

#[derive(Deserialize)]
pub struct FixPreviewQuery {
    rule_id: String,
}

#[derive(Deserialize)]
pub struct FixStreamQuery {
    payload: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum FixStreamMessage {
    Progress { data: FixProgress },
    Outcome { data: FixOutcome },
    Error { message: String },
}

pub async fn preview_fix(
    State(state): State<AppState>,
    Query(query): Query<FixPreviewQuery>,
) -> ApiResult<FixPreview> {
    fix_helpers::preview_fix(&state.docker, &query.rule_id)
        .await
        .map(|preview| ApiSuccess::default().with_data(preview))
        .map_err(|error| {
            ApiError::default()
                .with_message("Failed to preview remediation")
                .with_debug(&error.to_string())
        })
}

pub async fn verify_fix(
    State(state): State<AppState>,
    Json(payload): Json<FixRequest>,
) -> ApiResult<CheckResult> {
    let registry = RuleRegistry::new();
    registry
        .check_rule(&payload.rule_id, &state.docker)
        .await
        .map(|result| ApiSuccess::default().with_data(result))
        .map_err(|error| {
            ApiError::default()
                .with_message("Failed to verify remediation")
                .with_debug(&error.to_string())
        })
}

pub async fn list_history() -> ApiResult<Vec<FixHistoryEntry>> {
    Ok(ApiSuccess::default().with_data(fix_helpers::list_fix_history().await))
}

pub async fn rollback_fix(
    State(state): State<AppState>,
    Json(payload): Json<RollbackRequest>,
) -> ApiResult<FixOutcome> {
    fix_helpers::rollback_fix(&state.docker, &payload)
        .await
        .map(|outcome| ApiSuccess::default().with_data(outcome))
        .map_err(|error| {
            ApiError::default()
                .with_message("Failed to rollback remediation")
                .with_debug(&error.to_string())
        })
}

pub async fn stream_fix(
    State(state): State<AppState>,
    Query(query): Query<FixStreamQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_fix_socket(socket, state, query.payload))
}

async fn handle_fix_socket(mut socket: WebSocket, state: AppState, payload: String) {
    let request = match serde_json::from_str::<FixRequest>(&payload) {
        Ok(request) => request,
        Err(error) => {
            send_stream_message(
                &mut socket,
                &FixStreamMessage::Error {
                    message: format!("Invalid fix request: {error}"),
                },
            )
            .await;
            return;
        }
    };

    let rollback_plan = fix_helpers::rollback_plan_for_request(&state.docker, &request)
        .await
        .unwrap_or_default();
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<FixProgress>();
    let (outcome_tx, outcome_rx) = oneshot::channel::<eyre::Result<FixOutcome>>();
    let docker = state.docker.clone();
    let request_for_task = request.clone();

    tokio::spawn(async move {
        let registry = RuleRegistry::new();
        let outcome = registry
            .fix_request_with_progress(&request_for_task, &docker, Some(&progress_tx))
            .await;
        let _ = outcome_tx.send(outcome);
    });

    tokio::pin!(outcome_rx);
    let mut progress_events = Vec::new();
    let final_outcome = loop {
        tokio::select! {
            progress = progress_rx.recv() => {
                if let Some(progress) = progress {
                    progress_events.push(progress.clone());
                    send_stream_message(&mut socket, &FixStreamMessage::Progress { data: progress }).await;
                }
            }
            outcome = &mut outcome_rx => {
                break outcome;
            }
        }
    };

    while let Ok(progress) = progress_rx.try_recv() {
        progress_events.push(progress.clone());
        send_stream_message(&mut socket, &FixStreamMessage::Progress { data: progress }).await;
    }

    match final_outcome {
        Ok(Ok(outcome)) => {
            fix_helpers::record_fix_history(
                request,
                outcome.clone(),
                rollback_plan,
                progress_events,
            )
            .await;
            send_stream_message(&mut socket, &FixStreamMessage::Outcome { data: outcome }).await;
        }
        Ok(Err(error)) => {
            send_stream_message(
                &mut socket,
                &FixStreamMessage::Error {
                    message: error.to_string(),
                },
            )
            .await;
        }
        Err(_) => {
            send_stream_message(
                &mut socket,
                &FixStreamMessage::Error {
                    message: "Fix task ended before returning an outcome".to_string(),
                },
            )
            .await;
        }
    }
}

async fn send_stream_message(socket: &mut WebSocket, message: &FixStreamMessage) {
    if let Ok(text) = serde_json::to_string(message) {
        let _ = socket.send(Message::Text(text.into())).await;
    }
}
