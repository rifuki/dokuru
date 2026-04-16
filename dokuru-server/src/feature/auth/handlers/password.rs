use axum::{Extension, Json, extract::State, http::StatusCode};
use validator::Validate;

use crate::{
    feature::auth::{
        auth_method::AuthProvider,
        types::{AuthUser, ChangePasswordRequest},
    },
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, validation as val_codes},
    },
    state::AppState,
};

/// POST /api/v1/auth/change-password
pub async fn change_password(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<ChangePasswordRequest>,
) -> ApiResult<()> {
    // Validate request
    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message(format!("Validation error: {}", e)));
    }

    // Validate new password length
    if req.new_password.len() < 8 {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message("New password must be at least 8 characters"));
    }

    // Find password auth method
    let auth_method = state
        .auth_service
        .auth_method_service()
        .find_by_user_and_provider(auth_user.user_id, AuthProvider::Password)
        .await
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to fetch auth method")
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_error_code(auth_codes::INVALID_CREDENTIALS)
                .with_message("Password auth not found for this user")
        })?;

    // Verify current password
    if !auth_method
        .verify_password(&req.current_password)
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Invalid password hash")
        })?
    {
        return Err(ApiError::default()
            .with_code(StatusCode::UNAUTHORIZED)
            .with_error_code(auth_codes::INVALID_CREDENTIALS)
            .with_message("Current password is incorrect"));
    }

    // Update password in database
    state
        .auth_service
        .auth_method_service()
        .update_password(auth_method.id, &req.new_password)
        .await
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to update password")
        })?;

    Ok(ApiSuccess::default().with_message("Password changed successfully"))
}
