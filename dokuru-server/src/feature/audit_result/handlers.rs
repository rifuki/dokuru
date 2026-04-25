use axum::{
    Extension, Json,
    body::Body,
    extract::{Path, State},
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    feature::{
        agent::{
            dto::AgentResponse,
            relay::{self, RelayCommandError},
        },
        audit_result::dto::{
            AuditReportResponse, AuditResultResponse, FixOutcomeResponse, FixRuleDto,
            RelayFixResponse, SaveAuditDto,
        },
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

    let result = save_and_notify_audit(&state, auth_user.user_id, &agent, dto).await?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(result))
}

pub async fn run_relay_audit(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(agent_id): Path<Uuid>,
) -> ApiResult<AuditResultResponse> {
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

    if agent.access_mode != "relay" {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Server-side audit run is only available for relay agents"));
    }

    let dto = run_relay_audit_command(&state, agent.id).await?;
    let result = save_and_notify_audit(&state, auth_user.user_id, &agent, dto).await?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(result))
}

pub async fn run_relay_fix(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(agent_id): Path<Uuid>,
    Json(dto): Json<FixRuleDto>,
) -> ApiResult<RelayFixResponse> {
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

    if agent.access_mode != "relay" {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Server-side fix is only available for relay agents"));
    }

    let outcome_value = relay::send_command(
        &state.agent_registry,
        agent.id,
        "fix",
        serde_json::json!({ "rule_id": dto.rule_id }),
    )
    .await
    .map_err(relay_error_to_api_error)?;

    let outcome = serde_json::from_value::<FixOutcomeResponse>(outcome_value).map_err(|error| {
        ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message("Relay agent returned an invalid fix payload")
            .with_debug(error.to_string())
    })?;

    let audit = if outcome.status == "Applied" {
        match run_relay_audit_command(&state, agent.id).await {
            Ok(dto) => Some(save_and_notify_audit(&state, auth_user.user_id, &agent, dto).await?),
            Err(error) => {
                tracing::warn!("Relay fix was applied, but audit refresh failed: {error:?}");
                None
            }
        }
    } else {
        None
    };

    Ok(ApiSuccess::default().with_data(RelayFixResponse { outcome, audit }))
}

pub async fn relay_docker_request(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((agent_id, tail)): Path<(Uuid, String)>,
    req: Request<Body>,
) -> Response {
    let agent = match state
        .agent_service
        .get_agent(state.db.pool(), agent_id, auth_user.user_id)
        .await
    {
        Ok(Some(agent)) => agent,
        Ok(None) => {
            return ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Agent not found")
                .into_response();
        }
        Err(error) => {
            return ApiError::default()
                .with_message(error.to_string())
                .into_response();
        }
    };

    if agent.access_mode != "relay" {
        return ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Docker relay proxy is only available for relay agents")
            .into_response();
    }

    let method = req.method().as_str().to_string();
    let query = parse_query(req.uri().query());

    let response_value = match relay::send_command(
        &state.agent_registry,
        agent.id,
        "docker",
        serde_json::json!({
            "method": method,
            "path": format!("/docker/{tail}"),
            "query": query,
        }),
    )
    .await
    {
        Ok(value) => value,
        Err(error) => return relay_error_to_api_error(error).into_response(),
    };

    let response = match serde_json::from_value::<RelayDockerResponse>(response_value) {
        Ok(response) => response,
        Err(error) => {
            return ApiError::default()
                .with_code(StatusCode::BAD_GATEWAY)
                .with_message("Relay agent returned an invalid docker payload")
                .with_debug(error.to_string())
                .into_response();
        }
    };

    raw_json_response(response.status, response.data)
}

#[derive(serde::Deserialize)]
struct RelayDockerResponse {
    status: u16,
    data: Option<serde_json::Value>,
}

fn parse_query(query: Option<&str>) -> HashMap<String, String> {
    query
        .map(|query| {
            url::form_urlencoded::parse(query.as_bytes())
                .into_owned()
                .collect()
        })
        .unwrap_or_default()
}

fn raw_json_response(status: u16, data: Option<serde_json::Value>) -> Response {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    match (status, data) {
        (StatusCode::NO_CONTENT, _) => StatusCode::NO_CONTENT.into_response(),
        (status, Some(data)) => (status, Json(data)).into_response(),
        (status, None) => status.into_response(),
    }
}

async fn run_relay_audit_command(
    state: &AppState,
    agent_id: Uuid,
) -> Result<SaveAuditDto, ApiError> {
    let audit_value = relay::send_command(
        &state.agent_registry,
        agent_id,
        "audit",
        serde_json::json!({}),
    )
    .await
    .map_err(relay_error_to_api_error)?;

    serde_json::from_value::<SaveAuditDto>(audit_value).map_err(|error| {
        ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message("Relay agent returned an invalid audit payload")
            .with_debug(error.to_string())
    })
}

async fn save_and_notify_audit(
    state: &AppState,
    user_id: Uuid,
    agent: &AgentResponse,
    dto: SaveAuditDto,
) -> Result<AuditResultResponse, ApiError> {
    let result = state
        .audit_service
        .save(state.db.pool(), agent.id, user_id, dto)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    state
        .ws_manager
        .broadcast_audit_completed(agent.id, result.id);

    if let Err(error) = state
        .notification_service
        .notify_audit_saved(
            state.db.pool(),
            user_id,
            agent,
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

    Ok(result)
}

fn relay_error_to_api_error(error: RelayCommandError) -> ApiError {
    let status = match error {
        RelayCommandError::AgentOffline | RelayCommandError::Send | RelayCommandError::Dropped => {
            StatusCode::SERVICE_UNAVAILABLE
        }
        RelayCommandError::Timeout => StatusCode::GATEWAY_TIMEOUT,
        RelayCommandError::Serialize(_) | RelayCommandError::Command(_) => StatusCode::BAD_GATEWAY,
    };

    ApiError::default()
        .with_code(status)
        .with_message(error.to_string())
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

pub async fn get_audit_report(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((agent_id, audit_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<AuditReportResponse> {
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
        .get_report(state.db.pool(), audit_id, agent_id, auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    result.map_or_else(
        || {
            Err(ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Audit not found"))
        },
        |report| Ok(ApiSuccess::default().with_data(report)),
    )
}
