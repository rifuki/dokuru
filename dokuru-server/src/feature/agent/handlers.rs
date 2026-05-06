use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    feature::{
        agent::{
            AgentResponse, CreateAgentDto, DUPLICATE_AGENT_TOKEN_MESSAGE, UpdateAgentDto, relay,
        },
        auth::AuthUser,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

/// # Errors
///
/// Returns an error if the underlying operation fails.
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

/// # Errors
///
/// Returns an error if the underlying operation fails.
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
        .map_err(agent_service_error_to_api_error)?;

    sync_relay_agent_connection(&state, &agent).await;

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

/// # Errors
///
/// Returns an error if the underlying operation fails.
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

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn update_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateAgentDto>,
) -> ApiResult<AgentResponse> {
    dto.validate()
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let requested_token = dto.token.clone();
    let previous_agent = state
        .agent_service
        .get_agent(state.db.pool(), id, auth_user.user_id)
        .await
        .map_err(agent_service_error_to_api_error)?;

    let agent = state
        .agent_service
        .update_agent(state.db.pool(), id, auth_user.user_id, dto)
        .await
        .map_err(agent_service_error_to_api_error)?;

    let Some(agent) = agent else {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"));
    };

    if let Some(previous_agent) = previous_agent.as_ref() {
        unbind_replaced_relay_token(&state, previous_agent, requested_token.as_deref(), &agent);
    }
    sync_relay_agent_connection(&state, &agent).await;

    Ok(ApiSuccess::default().with_data(agent))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn delete_agent(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    let agent = state
        .agent_service
        .get_agent(state.db.pool(), id, auth_user.user_id)
        .await
        .map_err(agent_service_error_to_api_error)?;

    let deleted = state
        .agent_service
        .delete_agent(state.db.pool(), id, auth_user.user_id)
        .await
        .map_err(agent_service_error_to_api_error)?;

    if deleted {
        if let Some(agent) = agent.as_ref() {
            sync_relay_agent_delete(&state, auth_user.user_id, agent).await;
        }
        Ok(ApiSuccess::default().with_message("Agent deleted successfully"))
    } else {
        Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Agent not found"))
    }
}

/// POST /api/v1/agents/:id/heartbeat
///
/// Agent heartbeat to update `last_seen` timestamp
/// # Errors
///
/// Returns an error if the underlying operation fails.
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

fn agent_service_error_to_api_error(error: eyre::Report) -> ApiError {
    let message = error.to_string();
    drop(error);

    if message == DUPLICATE_AGENT_TOKEN_MESSAGE {
        return ApiError::default()
            .with_code(StatusCode::CONFLICT)
            .with_message(message);
    }

    ApiError::default().with_message(message)
}

async fn sync_relay_agent_connection(state: &AppState, agent: &AgentResponse) {
    if agent.access_mode != "relay" {
        return;
    }

    let Some(token) = agent.token.as_deref() else {
        return;
    };

    if relay::rebind_connection_token(&state.agent_registry, token, agent.id) {
        mark_agent_seen(state, agent.id).await;
        state.ws_manager.broadcast_agent_connected(agent.id);
    }
}

fn unbind_replaced_relay_token(
    state: &AppState,
    previous_agent: &AgentResponse,
    requested_token: Option<&str>,
    updated_agent: &AgentResponse,
) {
    if previous_agent.access_mode != "relay" {
        return;
    }

    let Some(previous_token) = previous_agent.token.as_deref() else {
        return;
    };

    let token_changed = requested_token.is_some_and(|token| token != previous_token);
    let left_relay_mode = updated_agent.access_mode != "relay";
    if (token_changed || left_relay_mode)
        && relay::unbind_connection_token(&state.agent_registry, previous_token, previous_agent.id)
    {
        state
            .ws_manager
            .broadcast_agent_disconnected(previous_agent.id);
    }
}

async fn sync_relay_agent_delete(state: &AppState, user_id: Uuid, agent: &AgentResponse) {
    if agent.access_mode != "relay" {
        return;
    }

    let Some(token) = agent.token.as_deref() else {
        return;
    };

    match state
        .agent_service
        .find_latest_agent_by_token(state.db.pool(), user_id, token)
        .await
    {
        Ok(Some(replacement)) if replacement.access_mode == "relay" => {
            sync_relay_agent_connection(state, &replacement).await;
        }
        Ok(Some(_) | None) => {
            if relay::unbind_connection_token(&state.agent_registry, token, agent.id) {
                state.ws_manager.broadcast_agent_disconnected(agent.id);
            }
        }
        Err(error) => {
            tracing::warn!("Failed to rebind relay connection after delete: {error}");
            if relay::unbind_connection_token(&state.agent_registry, token, agent.id) {
                state.ws_manager.broadcast_agent_disconnected(agent.id);
            }
        }
    }
}

async fn mark_agent_seen(state: &AppState, agent_id: Uuid) {
    let result = sqlx::query("UPDATE agents SET last_seen = NOW() WHERE id = $1")
        .bind(agent_id)
        .execute(state.db.pool())
        .await;

    if let Err(error) = result {
        tracing::warn!("Failed to mark rebound relay agent as seen: {error}");
    }
}
