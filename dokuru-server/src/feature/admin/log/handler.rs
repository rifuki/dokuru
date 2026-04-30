use axum::{Json, extract::State};
use tracing_subscriber::EnvFilter;

use crate::{
    feature::admin::log::dto::{AdminLogsResponse, SetLogLevelRequest},
    infrastructure::logging,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn get_logs(State(state): State<AppState>) -> ApiResult<AdminLogsResponse> {
    let log_file = logging::latest_log_file_path();
    let lines = if let Some(path) = &log_file {
        match tokio::fs::read_to_string(path).await {
            Ok(content) => content
                .lines()
                .rev()
                .take(200)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .map(str::to_owned)
                .collect(),
            Err(error) => {
                return Err(ApiError::default()
                    .with_code(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                    .log_only(error)
                    .with_message("Failed to read log file"));
            }
        }
    } else {
        Vec::new()
    };

    let runtime_level = state.current_log_level.read().await.clone();

    Ok(ApiSuccess::default().with_data(AdminLogsResponse {
        lines,
        log_file: log_file.map(|path| path.display().to_string()),
        runtime_level,
    }))
}

/// POST /api/v1/admin/log/level
///
/// Dynamically change log level at runtime without restart.
/// Protected: requires valid JWT with Admin role.
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn set_log_level(
    State(state): State<AppState>,
    Json(req): Json<SetLogLevelRequest>,
) -> ApiResult<serde_json::Value> {
    let new_filter = EnvFilter::try_new(&req.level).map_err(|e| {
        ApiError::default()
            .with_code(axum::http::StatusCode::BAD_REQUEST)
            .with_message(format!("Invalid log level filter: {e}"))
    })?;

    state
        .log_reload_handle
        .reload(new_filter)
        .map_err(|e| ApiError::default().log_only(format!("Failed to reload log filter: {e}")))?;

    state.current_log_level.write().await.clone_from(&req.level);

    tracing::info!(level = %req.level, "Log level changed by admin");

    Ok(ApiSuccess::default()
        .with_data(serde_json::json!({ "level": req.level }))
        .with_message(format!("Log level set to '{}'", req.level)))
}
