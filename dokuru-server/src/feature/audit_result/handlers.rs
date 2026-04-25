use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::{
        audit_result::dto::{AuditResultResponse, SaveAuditDto},
        auth::AuthUser,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

pub async fn save_audit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(agent_id): Path<Uuid>,
    Json(dto): Json<SaveAuditDto>,
) -> ApiResult<AuditResultResponse> {
    // Verify agent ownership
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let Some(agent) = agent else {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    };

    let result = state
        .audit_service
        .save(state.db.pool(), agent_id, auth_user.user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    // Broadcast audit completion event
    state
        .ws_manager
        .broadcast_audit_completed(agent_id, result.id);

    if let Err(error) = state
        .notification_service
        .notify_audit_saved(
            state.db.pool(),
            auth_user.user_id,
            &agent,
            result.id,
            result.summary.score,
            result.summary.failed,
        )
        .await
    {
        tracing::warn!("Failed to create audit notification: {error}");
    } else {
        state.ws_manager.broadcast_notifications_updated();
    }

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(result))
}

pub async fn get_latest_audit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(agent_id): Path<Uuid>,
) -> ApiResult<Option<AuditResultResponse>> {
    // Verify agent ownership
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    if agent.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    }

    let result = state
        .audit_service
        .get_latest(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(result))
}

pub async fn list_audits(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(agent_id): Path<Uuid>,
) -> ApiResult<Vec<AuditResultResponse>> {
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    if agent.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    }

    let results = state
        .audit_service
        .list(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(results))
}

pub async fn get_audit_by_id(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((agent_id, audit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<AuditResultResponse> {
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    if agent.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    }

    let result = state
        .audit_service
        .get_by_id(state.db.pool(), audit_id, agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    result.map_or_else(
        || {
            Err(ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Audit not found"))
        },
        |audit| Ok(ApiSuccess::default().with_data(audit)),
    )
}
