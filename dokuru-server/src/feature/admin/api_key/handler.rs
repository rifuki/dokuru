use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, codes::generic},
    state::AppState,
};

use super::{
    dto::{ApiKeyResponse, ApiKeyWithPlain, CreateApiKeyRequest, ListQuery, UpdateApiKey},
    repository::ApiKeyRepositoryImpl,
    service::ApiKeyService,
};

fn make_service(state: &AppState) -> ApiKeyService {
    ApiKeyService::new(state.db.clone(), Arc::new(ApiKeyRepositoryImpl::new()))
}

/// GET /api/v1/admin/api-keys - List all API keys
pub async fn list_keys(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Vec<ApiKeyResponse>> {
    let service = make_service(&state);

    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    let keys = service.list_keys(limit, offset).await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(generic::INTERNAL)
            .with_message(format!("Failed to list API keys: {}", e))
    })?;

    Ok(ApiSuccess::default()
        .with_data(keys)
        .with_message("API keys retrieved"))
}

/// POST /api/v1/admin/api-keys - Create new API key
pub async fn create_key(
    State(state): State<AppState>,
    Json(req): Json<CreateApiKeyRequest>,
) -> ApiResult<ApiKeyWithPlain> {
    let service = make_service(&state);

    let key = service
        .generate_key(&req.name, req.scopes, req.created_by, req.expires_days)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(generic::INTERNAL)
                .with_message(format!("Failed to create API key: {}", e))
        })?;

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(key)
        .with_message("API key created - save this key, it won't be shown again!"))
}

/// GET /api/v1/admin/api-keys/:id - Get API key by ID
pub async fn get_key(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<ApiKeyResponse> {
    let service = make_service(&state);

    let key = service
        .get_key(id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(generic::INTERNAL)
                .with_message(format!("Failed to get API key: {}", e))
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("API key not found")
        })?;

    Ok(ApiSuccess::default()
        .with_data(key)
        .with_message("API key retrieved"))
}

/// PATCH /api/v1/admin/api-keys/:id - Update API key
pub async fn update_key(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateApiKey>,
) -> ApiResult<ApiKeyResponse> {
    let service = make_service(&state);

    let key = service
        .update_key(id, &req)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(generic::INTERNAL)
                .with_message(format!("Failed to update API key: {}", e))
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("API key not found")
        })?;

    Ok(ApiSuccess::default()
        .with_data(key)
        .with_message("API key updated"))
}

/// DELETE /api/v1/admin/api-keys/:id - Delete API key
pub async fn delete_key(State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<()> {
    let service = make_service(&state);

    let deleted = service.delete_key(id).await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(generic::INTERNAL)
            .with_message(format!("Failed to delete API key: {}", e))
    })?;

    if !deleted {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_error_code(generic::NOT_FOUND)
            .with_message("API key not found"));
    }

    Ok(ApiSuccess::default().with_message("API key deleted"))
}

/// POST /api/v1/admin/api-keys/:id/revoke - Revoke API key
pub async fn revoke_key(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<ApiKeyResponse> {
    let service = make_service(&state);

    let key = service
        .revoke_key(id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(generic::INTERNAL)
                .with_message(format!("Failed to revoke API key: {}", e))
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(generic::NOT_FOUND)
                .with_message("API key not found")
        })?;

    Ok(ApiSuccess::default()
        .with_data(key)
        .with_message("API key revoked"))
}

/// POST /api/v1/admin/api-keys/:id/refresh - Refresh API key
pub async fn refresh_key(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<ApiKeyWithPlain> {
    let service = make_service(&state);

    // Get current user from auth extension would go here
    let created_by = None;

    let key = service.refresh_key(id, created_by).await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_error_code(generic::INTERNAL)
            .with_message(format!("Failed to refresh API key: {}", e))
    })?;

    Ok(ApiSuccess::default()
        .with_data(key)
        .with_message("API key refreshed - save this new key, it won't be shown again!"))
}
