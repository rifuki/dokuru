use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    feature::{
        agent::{AgentResponse, CreateAgentDto, UpdateAgentDto},
        auth::AuthUser,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

pub async fn list_agents(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<AgentResponse>> {
    let agents = state
        .agent_service
        .list_agents(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(agents))
}

pub async fn create_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(dto): Json<CreateAgentDto>,
) -> ApiResult<AgentResponse> {
    dto.validate()
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let agent = state
        .agent_service
        .create_agent(state.db.pool(), auth_user.user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    if let Err(error) = state
        .notification_service
        .notify_agent_created(state.db.pool(), auth_user.user_id, &agent)
        .await
    {
        tracing::warn!("Failed to create agent notification: {error}");
    } else {
        state.ws_manager.broadcast_notifications_updated();
    }

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(agent))
}

pub async fn get_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<AgentResponse> {
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    agent.map_or_else(
        || {
            Err(ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Agent not found"))
        },
        |agent| Ok(ApiSuccess::default().with_data(agent)),
    )
}

pub async fn update_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateAgentDto>,
) -> ApiResult<AgentResponse> {
    dto.validate()
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let agent = state
        .agent_service
        .update_agent(state.db.pool(), id, auth_user.user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    agent.map_or_else(
        || {
            Err(ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Agent not found"))
        },
        |agent| Ok(ApiSuccess::default().with_data(agent)),
    )
}

pub async fn delete_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    let deleted = state
        .agent_service
        .delete_agent(state.db.pool(), id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    if deleted {
        Ok(ApiSuccess::default().with_message("Agent deleted successfully"))
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"))
    }
}

/// POST /api/v1/agents/:id/heartbeat
///
/// Agent heartbeat to update last_seen timestamp
pub async fn agent_heartbeat(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    let result = sqlx::query!(
        "UPDATE agents SET last_seen = NOW() WHERE id = $1 AND user_id = $2",
        id,
        auth_user.user_id
    )
    .execute(state.db.pool())
    .await
    .map_err(|e| ApiError::default().log_only(e))?;

    if result.rows_affected() == 0 {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    }

    Ok(ApiSuccess::default().with_message("Heartbeat received"))
}
