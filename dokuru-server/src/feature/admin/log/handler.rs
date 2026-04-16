use axum::{Json, extract::State};
use tracing_subscriber::EnvFilter;

use crate::{
    feature::admin::log::dto::SetLogLevelRequest,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

/// POST /api/v1/admin/log/level
///
/// Dynamically change log level at runtime without restart.
/// Protected: requires valid JWT with Admin role.
pub async fn set_log_level(
    State(state): State<AppState>,
    Json(req): Json<SetLogLevelRequest>,
) -> ApiResult<serde_json::Value> {
    let new_filter = EnvFilter::try_new(&req.level).map_err(|e| {
        ApiError::default()
            .with_code(axum::http::StatusCode::BAD_REQUEST)
            .with_message(format!("Invalid log level filter: {}", e))
    })?;

    state
        .log_reload_handle
        .reload(new_filter)
        .map_err(|e| ApiError::default().log_only(format!("Failed to reload log filter: {}", e)))?;

    tracing::info!(level = %req.level, "Log level changed by admin");

    Ok(ApiSuccess::default()
        .with_data(serde_json::json!({ "level": req.level }))
        .with_message(format!("Log level set to '{}'", req.level)))
}
