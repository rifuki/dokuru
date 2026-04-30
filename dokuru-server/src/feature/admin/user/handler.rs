use axum::{
    Extension, Json,
    extract::Path,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::Utc;
use uuid::Uuid;

use crate::{
    feature::{
        admin::user::{
            domain::{self, AdminUserAction},
            dto::{AdminUserResponse, UpdateUserRoleRequest, UpdateUserStatusRequest},
        },
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
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn list_users(State(state): State<AppState>) -> ApiResult<Vec<AdminUserResponse>> {
    let users = state
        .admin_user_repo
        .list_all(state.db.pool())
        .await
        .map_err(|e| ApiError::default().log_only(e))?;

    let user_responses = users.into_iter().map(AdminUserResponse::from).collect();

    Ok(ApiSuccess::default()
        .with_data(user_responses)
        .with_message("Users retrieved successfully"))
}

/// POST /api/v1/admin/users/:id/role
///
/// Update a user's role (admin only).
/// Cannot change your own role (prevents self-demotion).
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn update_user_role(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserRoleRequest>,
) -> ApiResult<AdminUserResponse> {
    // Validate role
    let role = domain::normalize_admin_role(&req.role).ok_or_else(|| {
        ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(generic::INVALID_INPUT)
            .with_message("Role must be either 'admin' or 'user'")
    })?;

    // Prevent changing own role
    if domain::is_self_action(user_id, auth_user.user_id) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message(domain::self_action_message(AdminUserAction::ChangeRole)));
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

    Ok(ApiSuccess::default()
        .with_data(AdminUserResponse::from(user))
        .with_message(format!("User role updated to '{role}'")))
}

/// POST /api/v1/admin/users/:id/status
/// Update active status for a user and revoke active sessions when blocked.
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn update_user_status(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserStatusRequest>,
) -> ApiResult<AdminUserResponse> {
    if domain::is_self_action(user_id, auth_user.user_id) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message(domain::self_action_message(AdminUserAction::ChangeStatus)));
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
            .revoke_all_sessions(user_id, domain::ADMIN_BLOCKED_SESSION_REASON)
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

    Ok(ApiSuccess::default()
        .with_data(AdminUserResponse::from(updated_user))
        .with_message(domain::status_update_message(req.is_active)))
}

/// POST /api/v1/admin/users/:id/reset-password
/// Generate a password reset token and send the existing reset email flow.
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn send_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
) -> ApiResult<()> {
    if domain::is_self_action(user_id, auth_user.user_id) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message(domain::self_action_message(AdminUserAction::ResetPassword)));
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
    let expires_at = domain::password_reset_expires_at(Utc::now());

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
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn delete_user(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(user_id): Path<Uuid>,
) -> ApiResult<()> {
    if domain::is_self_action(user_id, auth_user.user_id) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_error_code(generic::FORBIDDEN)
            .with_message(domain::self_action_message(AdminUserAction::Delete)));
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
        .revoke_all_sessions(user_id, domain::ADMIN_DELETED_SESSION_REASON)
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
