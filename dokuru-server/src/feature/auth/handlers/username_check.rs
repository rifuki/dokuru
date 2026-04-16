use axum::extract::{Query, State};
use serde::Deserialize;

use crate::{
    infrastructure::web::response::{ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Deserialize)]
pub struct CheckUsernameQuery {
    username: String,
}

/// GET /api/v1/auth/check-username?username=xxx
///
/// Check if username is available (public endpoint)
pub async fn check_username_availability(
    State(state): State<AppState>,
    Query(query): Query<CheckUsernameQuery>,
) -> ApiResult<serde_json::Value> {
    let username = query.username.trim();

    // Validate username format
    if username.is_empty() || username.len() < 3 {
        return Ok(ApiSuccess::default()
            .with_data(serde_json::json!({
                "available": false,
                "reason": "Username must be at least 3 characters"
            }))
            .with_message("Username too short"));
    }

    if username.len() > 30 {
        return Ok(ApiSuccess::default()
            .with_data(serde_json::json!({
                "available": false,
                "reason": "Username must be at most 30 characters"
            }))
            .with_message("Username too long"));
    }

    // Check if username exists
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)",
    )
    .bind(username)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| {
        crate::infrastructure::web::response::ApiError::default().log_only(e)
    })?;

    Ok(ApiSuccess::default()
        .with_data(serde_json::json!({
            "available": !exists,
            "username": username
        }))
        .with_message(if exists {
            "Username already taken"
        } else {
            "Username available"
        }))
}
