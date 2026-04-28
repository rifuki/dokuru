use axum::{
    Extension,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::auth::{
        session::{display_ip_address, lookup_ip_location},
        types::AuthUser,
    },
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess, codes::auth as auth_codes, codes::generic,
    },
    state::AppState,
};

/// GET /api/v1/auth/sessions
pub async fn list_sessions(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<serde_json::Value>> {
    tracing::info!(
        "Listing sessions for user: {}, JWT session_id: {}",
        auth_user.user_id,
        auth_user.session_id
    );

    let sessions = state
        .auth_service
        .session_service()
        .list_sessions(auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch sessions: {:?}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to fetch sessions")
        })?;

    tracing::info!("Found {} sessions for user", sessions.len());

    let mut session_responses = Vec::with_capacity(sessions.len());

    for session in sessions {
        let ip_address = display_ip_address(&session.ip_address);
        let location = match session
            .location
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            Some(location) => location.to_string(),
            None => match lookup_ip_location(&ip_address).await {
                Some(location) => {
                    if let Err(error) = state
                        .auth_service
                        .session_service()
                        .update_location(session.id, &location)
                        .await
                    {
                        tracing::warn!(?error, session_id = %session.id, "Failed to backfill session location");
                    }
                    location
                }
                None => "Unknown Location".to_string(),
            },
        };

        session_responses.push(serde_json::json!({
            "id": session.id,
            "device": session.device_name.unwrap_or_else(|| "Unknown Device".to_string()),
            "device_type": session.device_type,
            "location": location,
            "ip": ip_address,
            "created_at": session.created_at.to_rfc3339(),
            "last_active_at": session.last_active_at.to_rfc3339(),
            "is_current": session.session_id == auth_user.session_id
        }));
    }

    Ok(ApiSuccess::default()
        .with_data(session_responses)
        .with_message("Sessions retrieved"))
}

/// DELETE /api/v1/auth/sessions - Logout all sessions
pub async fn logout_all_sessions(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<()> {
    state
        .auth_service
        .session_service()
        .revoke_all_except(auth_user.user_id, &auth_user.session_id)
        .await
        .map_err(|_e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to revoke sessions")
        })?;

    Ok(ApiSuccess::default().with_message("All other sessions logged out"))
}

/// DELETE /api/v1/auth/sessions/:id - Revoke specific session
/// Note: :id is the internal UUID (row id), not the JWT session_id
pub async fn revoke_session(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    tracing::info!(
        "Revoking session id: {} for user: {}",
        id,
        auth_user.user_id
    );

    // Verify the session belongs to the user by listing their sessions
    let sessions = state
        .auth_service
        .session_service()
        .list_sessions(auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list sessions: {:?}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to retrieve session")
        })?;

    // Check if the session belongs to this user
    let session_exists = sessions.iter().any(|s| s.id == id);
    if !session_exists {
        tracing::warn!("Session {} not found for user {}", id, auth_user.user_id);
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(generic::NOT_FOUND)
            .with_message("Session not found"));
    }

    state
        .auth_service
        .session_service()
        .revoke_session(id, "user_revoked")
        .await
        .map_err(|e| {
            tracing::error!("Failed to revoke session: {:?}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to revoke session")
        })?;

    Ok(ApiSuccess::default().with_message("Session revoked"))
}
