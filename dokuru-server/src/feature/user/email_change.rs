use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    feature::auth::types::AuthUser,
    infrastructure::web::{
        origin::frontend_origin,
        response::{ApiError, ApiResult, ApiSuccess},
    },
    state::AppState,
};

#[derive(Deserialize, Validate)]
pub struct ChangeEmailRequest {
    #[validate(email(message = "Invalid email format"))]
    new_email: String,
}

#[derive(Serialize)]
pub struct ChangeEmailResponse {
    message: String,
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn request_email_change(
    State(state): State<AppState>,
    axum::Extension(auth_user): axum::Extension<AuthUser>,
    headers: HeaderMap,
    Json(mut req): Json<ChangeEmailRequest>,
) -> ApiResult<ChangeEmailResponse> {
    req.new_email = req.new_email.trim().to_string();

    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message(format!("Validation error: {e}")));
    }

    // Check if new email is same as current
    if req.new_email == auth_user.email {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("New email is the same as current email"));
    }

    // Check if new email already exists
    if state
        .user_repo
        .exists_by_email(state.db.pool(), &req.new_email)
        .await
        .map_err(|e| {
            tracing::error!("Database error: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Internal server error")
        })?
    {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Email already in use"));
    }

    // Generate token
    let token = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

    // Save pending email
    state
        .user_repo
        .set_pending_email(
            state.db.pool(),
            auth_user.user_id,
            &req.new_email,
            &token,
            expires_at,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to set pending email: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to initiate email change")
        })?;

    let origin = frontend_origin(&headers, &state.config);
    let verification_url = format!("{origin}/verify-email-change?token={token}");

    if let Err(e) = state
        .email_service
        .send_email_change_verification(&req.new_email, &verification_url)
        .await
    {
        tracing::error!("Failed to send email change verification: {}", e);
        return Err(ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to send verification email"));
    }

    Ok(ApiSuccess::default().with_data(ChangeEmailResponse {
        message: format!("Verification email sent to {}", req.new_email),
    }))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn cancel_email_change(
    State(state): State<AppState>,
    axum::Extension(auth_user): axum::Extension<AuthUser>,
) -> ApiResult<ChangeEmailResponse> {
    state
        .user_repo
        .clear_pending_email(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to cancel pending email: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to cancel pending email change")
        })?;

    Ok(ApiSuccess::default().with_data(ChangeEmailResponse {
        message: "Pending email change cancelled".to_string(),
    }))
}

#[derive(Deserialize)]
pub struct VerifyEmailChangeQuery {
    token: String,
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn verify_email_change(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<VerifyEmailChangeQuery>,
) -> ApiResult<ChangeEmailResponse> {
    let verified = state
        .user_repo
        .verify_pending_email(state.db.pool(), &query.token)
        .await
        .map_err(|e| {
            tracing::error!("Failed to verify email change: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify email change")
        })?;

    if !verified {
        if let Some(pending_email) = pending_email_for_token(&state, &query.token).await?
            && email_is_registered(&state, &pending_email).await?
        {
            return Err(ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Pending email is already registered. Choose a different email."));
        }

        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Invalid or expired verification token"));
    }

    Ok(ApiSuccess::default().with_data(ChangeEmailResponse {
        message: "Email changed successfully".to_string(),
    }))
}

async fn pending_email_for_token(
    state: &AppState,
    token: &str,
) -> Result<Option<String>, ApiError> {
    sqlx::query_scalar::<_, Option<String>>(
        "SELECT pending_email FROM users WHERE pending_email_token = $1",
    )
    .bind(token)
    .fetch_optional(state.db.pool())
    .await
    .map(Option::flatten)
    .map_err(|e| {
        tracing::error!("Failed to inspect pending email token: {}", e);
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to verify email change")
    })
}

async fn email_is_registered(state: &AppState, email: &str) -> Result<bool, ApiError> {
    sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
        .bind(email)
        .fetch_one(state.db.pool())
        .await
        .map_err(|e| {
            tracing::error!("Failed to check pending email ownership: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify email change")
        })
}
