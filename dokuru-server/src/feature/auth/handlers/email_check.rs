use axum::extract::{Query, State};
use serde::Deserialize;

use crate::{
    infrastructure::web::response::{ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Deserialize)]
pub struct CheckEmailQuery {
    email: String,
}

/// GET /api/v1/auth/check-email?email=xxx
///
/// Check if email is available (public endpoint)
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn check_email_availability(
    State(state): State<AppState>,
    Query(query): Query<CheckEmailQuery>,
) -> ApiResult<serde_json::Value> {
    let email = query.email.trim().to_lowercase();

    // Basic email validation
    if email.is_empty() || !email.contains('@') {
        return Ok(ApiSuccess::default()
            .with_data(serde_json::json!({
                "available": false,
                "reason": "Invalid email format"
            }))
            .with_message("Invalid email"));
    }

    // Check if email exists
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
            .bind(&email)
            .fetch_one(state.db.pool())
            .await
            .map_err(|e| crate::infrastructure::web::response::ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(serde_json::json!({
            "available": !exists,
            "email": email
        }))
        .with_message(if exists {
            "Email already registered"
        } else {
            "Email available"
        }))
}
