use axum::extract::State;

use crate::{
    infrastructure::web::response::{ApiResult, ApiSuccess},
    state::AppState,
};

/// Basic health check - returns 200 OK if service is running
pub async fn health_check() -> ApiSuccess<()> {
    ApiSuccess::default().with_message("Service is healthy")
}

/// Detailed health check with dependencies status
pub async fn health_check_detailed(State(_state): State<AppState>) -> ApiResult<serde_json::Value> {
    // TODO: Check database, redis, external services, etc.
    let health_data = serde_json::json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    Ok(ApiSuccess::default().with_data(health_data))
}
