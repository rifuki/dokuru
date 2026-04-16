use axum::{
    Extension,
    extract::{Path, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::auth::AuthUser,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes},
    state::AppState,
};

use super::models::EnvironmentResponse;

/// List all environments for current user
pub async fn list_environments(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<EnvironmentResponse>> {
    let environments = state
        .env_repo
        .list_by_user(&state.db, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to list environments")
                .with_debug(format!("{:?}", e))
        })?;

    let env_list: Vec<EnvironmentResponse> = environments.into_iter().map(Into::into).collect();

    Ok(ApiSuccess::default().with_data(env_list))
}

/// Get environment by ID
pub async fn get_environment(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(env_id): Path<Uuid>,
) -> ApiResult<EnvironmentResponse> {
    let environment = state
        .env_repo
        .find_by_id(&state.db, env_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to get environment")
                .with_debug(format!("{:?}", e))
        })?;

    match environment {
        Some(env) => Ok(ApiSuccess::default().with_data(env.into())),
        None => Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Environment not found")),
    }
}

/// Delete environment
pub async fn delete_environment(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(env_id): Path<Uuid>,
) -> ApiResult<()> {
    let deleted = state
        .env_repo
        .delete(&state.db, env_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to delete environment")
                .with_debug(format!("{:?}", e))
        })?;

    if !deleted {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Environment not found"));
    }

    Ok(ApiSuccess::default().with_message("Environment deleted successfully"))
}
