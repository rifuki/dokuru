use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::auth::AuthUser,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes},
    state::AppState,
};

use super::models::{AuditResult, AuditSummary, TriggerAuditDto};

/// Trigger audit on environment
pub async fn trigger_audit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(env_id): Path<Uuid>,
    Json(_dto): Json<TriggerAuditDto>,
) -> ApiResult<Uuid> {
    // Verify environment belongs to user
    let environment = state
        .env_repo
        .find_by_id(&state.db, env_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify environment")
                .with_debug(format!("{:?}", e))
        })?;

    if environment.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Environment not found"));
    }

    // Trigger audit
    let audit_id = state
        .audit_service
        .trigger_audit(env_id, &state.agents)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message(format!("Failed to trigger audit: {}", e))
                .with_debug(format!("{:?}", e))
        })?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::ACCEPTED)
        .with_data(audit_id)
        .with_message("Audit triggered successfully"))
}

/// Get audit history for environment
pub async fn get_audit_history(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(env_id): Path<Uuid>,
) -> ApiResult<Vec<AuditSummary>> {
    // Verify environment belongs to user
    let environment = state
        .env_repo
        .find_by_id(&state.db, env_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify environment")
                .with_debug(format!("{:?}", e))
        })?;

    if environment.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Environment not found"));
    }

    // Get audit history (last 50)
    let audits = state
        .audit_service
        .get_history(env_id, 50)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to get audit history")
                .with_debug(format!("{:?}", e))
        })?;

    let summaries: Vec<AuditSummary> = audits.into_iter().map(Into::into).collect();

    Ok(ApiSuccess::default().with_data(summaries))
}

/// Get audit detail
pub async fn get_audit_detail(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((env_id, audit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<AuditResult> {
    // Verify environment belongs to user
    let environment = state
        .env_repo
        .find_by_id(&state.db, env_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify environment")
                .with_debug(format!("{:?}", e))
        })?;

    if environment.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Environment not found"));
    }

    // Get audit detail
    let audit = state
        .audit_service
        .get_detail(audit_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to get audit detail")
                .with_debug(format!("{:?}", e))
        })?;

    match audit {
        Some(a) if a.env_id == env_id => Ok(ApiSuccess::default().with_data(a)),
        _ => Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Audit not found")),
    }
}
