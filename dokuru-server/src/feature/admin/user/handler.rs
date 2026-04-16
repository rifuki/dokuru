use axum::{Extension, Json, extract::Path, extract::State, http::StatusCode};
use uuid::Uuid;

use crate::{
    feature::{
        admin::user::dto::{AdminUserResponse, UpdateUserRoleRequest},
        auth::AuthUser,
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
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
        .with_message(format!("User role updated to '{}'", role)))
}
