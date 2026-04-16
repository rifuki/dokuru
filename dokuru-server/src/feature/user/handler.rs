use axum::{Json, extract::State};
use validator::Validate;

use crate::{
    feature::{
        auth::AuthUser,
        user::dto::{UpdateProfileRequest, UserProfileResponse},
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes::generic},
    state::AppState,
};

/// GET /api/v1/users/me — get current user profile
pub async fn get_me(
    State(state): State<AppState>,
    auth_user: axum::Extension<AuthUser>,
) -> ApiResult<UserProfileResponse> {
    // Get user with profile in single query
    let user_with_profile = state
        .user_repo
        .find_with_profile(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(axum::http::StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let user_role = user_with_profile.role();
    Ok(ApiSuccess::default().with_data(UserProfileResponse {
        id: user_with_profile.id,
        email: user_with_profile.email,
        username: user_with_profile.username,
        name: user_with_profile.full_name.unwrap_or_default(),
        avatar_url: user_with_profile.avatar_url,
        role: user_role.to_string(),
    }))
}

/// PATCH /api/v1/users/me — update current user profile
pub async fn update_me(
    State(state): State<AppState>,
    auth_user: axum::Extension<AuthUser>,
    Json(req): Json<UpdateProfileRequest>,
) -> ApiResult<UserProfileResponse> {
    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(axum::http::StatusCode::BAD_REQUEST)
            .with_error_code(crate::infrastructure::web::response::codes::validation::INVALID_INPUT)
            .with_message(format!("Validation error: {}", e)));
    }

    // Update user (email, username)
    let user = state
        .user_repo
        .update(
            state.db.pool(),
            auth_user.user_id,
            req.email.as_deref(),
            req.username.as_deref(),
        )
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(axum::http::StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    // Update profile (name) if provided
    if req.name.is_some() {
        let _ = state
            .user_profile_repo
            .update(
                state.db.pool(),
                auth_user.user_id,
                req.name.as_deref(),
                None,
                None,
                None,
            )
            .await;
    }

    // Get updated profile
    let profile = state
        .user_profile_repo
        .find_by_user_id(state.db.pool(), auth_user.user_id)
        .await
        .ok()
        .flatten();

    let user_role = user.role().to_string();
    Ok(ApiSuccess::default()
        .with_data(UserProfileResponse {
            id: user.id,
            email: user.email,
            username: user.username,
            name: profile
                .as_ref()
                .and_then(|p| p.full_name.clone())
                .unwrap_or_default(),
            avatar_url: profile.as_ref().and_then(|p| p.avatar_url.clone()),
            role: user_role,
        })
        .with_message("Profile updated"))
}
