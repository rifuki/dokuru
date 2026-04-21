use axum::{Extension, Json, http::StatusCode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ForgotPasswordRequest {
    email: String,
}

#[derive(Serialize)]
pub struct ForgotPasswordResponse {
    message: String,
}

pub async fn forgot_password(
    Extension(state): Extension<AppState>,
    Json(req): Json<ForgotPasswordRequest>,
) -> ApiResult<ForgotPasswordResponse> {
    // Find user
    let user = state
        .user_repo
        .find_by_email(state.db.pool(), &req.email)
        .await
        .map_err(|e| {
            tracing::error!("Database error: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Internal server error")
        })?;

    // Always return success even if user not found (security)
    if user.is_none() {
        return Ok(ApiSuccess::default().with_data(ForgotPasswordResponse {
            message: "If the email exists, a reset link has been sent".to_string(),
        }));
    }

    let user = user.unwrap();

    // Generate token
    let token = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(1);

    // Save token
    state
        .user_repo
        .set_reset_token(state.db.pool(), &user.email, &token, expires_at)
        .await
        .map_err(|e| {
            tracing::error!("Failed to set reset token: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to send reset email")
        })?;

    // Send email
    let reset_url = format!("http://localhost:5173/reset-password?token={token}");

    if let Err(e) = state
        .email_service
        .send_password_reset_email(&user.email, &reset_url)
        .await
    {
        tracing::error!("Failed to send reset email: {}", e);
        return Err(ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to send reset email"));
    }

    Ok(ApiSuccess::default().with_data(ForgotPasswordResponse {
        message: "If the email exists, a reset link has been sent".to_string(),
    }))
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    token: String,
    new_password: String,
}

#[derive(Serialize)]
pub struct ResetPasswordResponse {
    message: String,
}

pub async fn reset_password(
    Extension(state): Extension<AppState>,
    Json(req): Json<ResetPasswordRequest>,
) -> ApiResult<ResetPasswordResponse> {
    // Validate password
    if req.new_password.len() < 8 {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Password must be at least 8 characters"));
    }

    // Find user by token
    let user = state
        .user_repo
        .find_by_reset_token(state.db.pool(), &req.token)
        .await
        .map_err(|e| {
            tracing::error!("Database error: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Internal server error")
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Invalid or expired reset token")
        })?;

    // Update password
    state
        .auth_service
        .auth_method_service()
        .update_password(user.id, &req.new_password)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update password: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to reset password")
        })?;

    // Clear reset token
    state
        .user_repo
        .clear_reset_token(state.db.pool(), user.id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to clear reset token: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to reset password")
        })?;

    Ok(ApiSuccess::default().with_data(ResetPasswordResponse {
        message: "Password reset successfully".to_string(),
    }))
}
