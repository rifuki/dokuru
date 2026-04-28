use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    infrastructure::web::{
        origin::frontend_origin,
        response::{ApiError, ApiResult, ApiSuccess},
    },
    state::AppState,
};

#[derive(Deserialize)]
pub struct VerifyEmailQuery {
    token: String,
}

#[derive(Serialize)]
pub struct VerifyEmailResponse {
    message: String,
}

pub async fn verify_email(
    State(state): State<AppState>,
    Query(query): Query<VerifyEmailQuery>,
) -> ApiResult<VerifyEmailResponse> {
    let user = sqlx::query_as::<_, crate::feature::user::User>(
        "SELECT * FROM users WHERE verification_token = $1 AND verification_token_expires_at > NOW()",
    )
    .bind(&query.token)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| {
        tracing::error!("Failed to load verification user: {}", e);
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to verify email")
    })?;

    let verified = state
        .user_repo
        .verify_email_with_token(state.db.pool(), &query.token)
        .await
        .map_err(|e| {
            tracing::error!("Failed to verify email: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to verify email")
        })?;

    if !verified {
        // Check if token exists but email is already verified
        // This happens when user clicks verification link multiple times
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Invalid or expired verification token"));
    }

    if let Some(user) = user {
        if let Err(error) = state
            .notification_service
            .notify_email_verified(state.db.pool(), &user)
            .await
        {
            tracing::warn!("Failed to create email verification notification: {error}");
        } else {
            state.ws_manager.broadcast_notifications_updated();
        }
    }

    Ok(ApiSuccess::default().with_data(VerifyEmailResponse {
        message: "Email verified successfully".to_string(),
    }))
}

#[derive(Deserialize)]
pub struct ResendVerificationRequest {
    email: String,
}

pub async fn resend_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ResendVerificationRequest>,
) -> ApiResult<VerifyEmailResponse> {
    let email = req.email.trim();

    // Find user
    let user = state
        .user_repo
        .find_by_email(state.db.pool(), email)
        .await
        .map_err(|e| {
            tracing::error!("Database error: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Internal server error")
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("User not found")
        })?;

    if user.email_verified {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Email already verified"));
    }

    // Generate token
    let token = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

    // Save token
    state
        .user_repo
        .set_verification_token(state.db.pool(), user.id, &token, expires_at)
        .await
        .map_err(|e| {
            tracing::error!("Failed to set verification token: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to send verification email")
        })?;

    let origin = frontend_origin(&headers, &state.config);
    let verification_url = format!("{origin}/verify-email?token={token}");

    if let Err(e) = state
        .email_service
        .send_verification_email(&user.email, &verification_url)
        .await
    {
        tracing::error!("Failed to send verification email: {}", e);
        return Err(ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to send verification email"));
    }

    Ok(ApiSuccess::default().with_data(VerifyEmailResponse {
        message: "Verification email sent".to_string(),
    }))
}
