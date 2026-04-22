use axum::{
    Extension, Json,
    extract::Path,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::{
    feature::{
        admin::user::dto::{AdminUserResponse, UpdateUserRoleRequest, UpdateUserStatusRequest},
        auth::AuthUser,
        auth::auth_method::AuthProvider,
        auth::handlers::password_reset::build_password_reset_url,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes::generic},
    state::AppState,
};

/// GET /api/v1/admin/users
///
/// List all users (admin only)
pub async fn list_users(State(state): State<AppState>) -> ApiResult<Vec<AdminUserResponse>> {
    let users = state
        .admin_user_repo
        .list_all(state.db.pool())
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let user_responses: Vec<AdminUserResponse> = users
        .into_iter()
        .map(|u| {
            let name = u.username.clone().unwrap_or_else(|| u.email.clone());
            AdminUserResponse {
                id: u.id,
                email: u.email,
                username: u.username,
                name,
                role: u.role,
                is_active: u.is_active,
                email_verified: u.email_verified,
                created_at: u.created_at,
                updated_at: u.updated_at,
            }
        })
        .collect();

    Ok(ApiSuccess::default()
        .with_data(user_responses)
        .with_message("Users retrieved successfully"))
}

/// POST /api/v1/admin/users/:id/role
///
/// Update a user's role (admin only).
/// Cannot change your own role (prevents self-demotion).
pub async fn update_user_role(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserRoleRequest>,
) -> ApiResult<AdminUserResponse> {
    // Validate role
    let role = req.role.to_lowercase();
    if role != "admin" && role != "user" {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(generic::INVALID_INPUT)
            .with_message("Role must be either 'admin' or 'user'"));
    }

    // Prevent changing own role
    if user_id == auth_user.user_id {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message("Cannot change your own role"));
    }

    // Update the user's role
    let user = state
        .admin_user_repo
        .update_role(state.db.pool(), user_id, &role)
        .await
        .map_err(|e| ApiError::default().log_only(e))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let name = user.username.clone().unwrap_or_else(|| user.email.clone());
    Ok(ApiSuccess::default()
        .with_data(AdminUserResponse {
            id: user.id,
            email: user.email,
            username: user.username,
            name,
            role: user.role,
            is_active: user.is_active,
            email_verified: user.email_verified,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
        .with_message(format!("User role updated to '{role}'")))
}

/// POST /api/v1/admin/users/:id/status
/// Update active status for a user and revoke active sessions when blocked.
pub async fn update_user_status(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserStatusRequest>,
) -> ApiResult<AdminUserResponse> {
    if user_id == auth_user.user_id {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message("Cannot change your own account status"));
    }

    state
        .user_repo
        .find_by_id(state.db.pool(), user_id)
        .await
        .map_err(|error| ApiError::default().log_only(error))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    state
        .user_repo
        .set_active(state.db.pool(), user_id, req.is_active)
        .await
        .map_err(|error| ApiError::default().log_only(error))?;

    if !req.is_active {
        let _ = state
            .auth_service
            .session_service()
            .revoke_all_sessions(user_id, "admin_blocked")
            .await;
    }

    let updated_user = state
        .user_repo
        .find_by_id(state.db.pool(), user_id)
        .await
        .map_err(|error| ApiError::default().log_only(error))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let name = updated_user
        .username
        .clone()
        .unwrap_or_else(|| updated_user.email.clone());

    Ok(ApiSuccess::default()
        .with_data(AdminUserResponse {
            id: updated_user.id,
            email: updated_user.email,
            username: updated_user.username,
            name,
            role: updated_user.role,
            is_active: updated_user.is_active,
            email_verified: updated_user.email_verified,
            created_at: updated_user.created_at,
            updated_at: updated_user.updated_at,
        })
        .with_message(if req.is_active {
            "User account restored"
        } else {
            "User account blocked"
        }))
}

/// POST /api/v1/admin/users/:id/reset-password
/// Generate a password reset token and send the existing reset email flow.
pub async fn send_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
) -> ApiResult<()> {
    if user_id == auth_user.user_id {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message("Use the profile security page to reset your own password"));
    }

    let user = state
        .user_repo
        .find_by_id(state.db.pool(), user_id)
        .await
        .map_err(|error| ApiError::default().log_only(error))?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("User not found")
        })?;

    let auth_method = state
        .auth_service
        .auth_method_service()
        .find_by_user_and_provider(user_id, AuthProvider::Password)
        .await
        .map_err(|error| ApiError::default().log_only(error))?;

    if auth_method.is_none() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(generic::INVALID_INPUT)
            .with_message("This account does not use password login"));
    }

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::hours(1);

    state
        .user_repo
        .set_reset_token(state.db.pool(), &user.email, &token, expires_at)
        .await
        .map_err(|error| ApiError::default().log_only(error))?;

    let reset_url =
        build_password_reset_url(&headers, &state.config.server.cors_allowed_origins, &token);
    state
        .email_service
        .send_password_reset_email(&user.email, &reset_url)
        .await
        .map_err(|error| ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default().with_message("Password reset email sent"))
}

/// DELETE /api/v1/admin/users/:id
/// Permanently remove a user account.
pub async fn delete_user(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
) -> ApiResult<()> {
    if user_id == auth_user.user_id {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message("Cannot delete your own account"));
    }

    let exists = state
        .user_repo
        .find_by_id(state.db.pool(), user_id)
        .await
        .map_err(|error| ApiError::default().log_only(error))?
        .is_some();

    if !exists {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(generic::NOT_FOUND)
            .with_message("User not found"));
    }

    let _ = state
        .auth_service
        .session_service()
        .revoke_all_sessions(user_id, "admin_deleted")
        .await;

    let deleted = state
        .user_repo
        .delete(state.db.pool(), user_id)
        .await
        .map_err(|error| ApiError::default().log_only(error))?;

    if !deleted {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(generic::NOT_FOUND)
            .with_message("User not found"));
    }

    Ok(ApiSuccess::default().with_message("User deleted successfully"))
}
