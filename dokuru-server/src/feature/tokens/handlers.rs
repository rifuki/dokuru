use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    feature::auth::AuthUser,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes},
    state::AppState,
};

use super::models::{CreateTokenDto, TokenListItem};

/// Create new API token
pub async fn create_token(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(dto): Json<CreateTokenDto>,
) -> ApiResult<super::models::TokenResponse> {
    dto.validate()
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_error_code(codes::validation::INVALID_INPUT)
                .with_message(format!("Validation error: {}", e))
        })?;

    let token_response = state
        .token_service
        .generate(auth_user.user_id, &dto.name)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to create token")
                .with_debug(format!("{:?}", e))
        })?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(token_response)
        .with_message("Token created successfully"))
}

/// List all tokens for current user
pub async fn list_tokens(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<TokenListItem>> {
    let tokens = state
        .token_service
        .list(auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to list tokens")
                .with_debug(format!("{:?}", e))
        })?;

    let token_list: Vec<TokenListItem> = tokens.into_iter().map(Into::into).collect();

    Ok(ApiSuccess::default()
        .with_data(token_list))
}

/// Revoke (delete) a token
pub async fn revoke_token(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(token_id): Path<Uuid>,
) -> ApiResult<()> {
    let deleted = state
        .token_service
        .revoke(token_id, auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to revoke token")
                .with_debug(format!("{:?}", e))
        })?;

    if !deleted {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(codes::generic::NOT_FOUND)
            .with_message("Token not found"));
    }

    Ok(ApiSuccess::default()
        .with_message("Token revoked successfully"))
}
