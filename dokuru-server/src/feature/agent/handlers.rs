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
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    Ok(ApiSuccess::default().with_data(agents))
}

pub async fn create_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(dto): Json<CreateAgentDto>,
) -> ApiResult<AgentResponse> {
    dto.validate()
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    let agent = state
        .agent_service
        .create_agent(state.db.pool(), auth_user.user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

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
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    match agent {
        Some(agent) => Ok(ApiSuccess::default().with_data(agent)),
        None => Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found")),
    }
}

pub async fn update_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateAgentDto>,
) -> ApiResult<AgentResponse> {
    dto.validate()
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    let agent = state
        .agent_service
        .update_agent(state.db.pool(), id, auth_user.user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    match agent {
        Some(agent) => Ok(ApiSuccess::default().with_data(agent)),
        None => Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found")),
    }
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
        .map_err(|e| ApiError::default().with_message(&e.to_string()))?;

    if deleted {
        Ok(ApiSuccess::default().with_message("Agent deleted successfully"))
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"))
    }
}
