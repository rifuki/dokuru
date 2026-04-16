use axum::extract::State;

use crate::{
    feature::admin::stats::dto::DashboardStatsResponse,
    infrastructure::web::response::{ApiResult, ApiSuccess},
    state::AppState,
};

/// GET /api/v1/admin/stats
///
/// Get dashboard statistics (admin only).
pub async fn get_dashboard_stats(
    State(state): State<AppState>,
) -> ApiResult<DashboardStatsResponse> {
    let stats = state
        .stats_service
        .get_dashboard_stats(state.db.pool())
        .await
        .map_err(|e| crate::infrastructure::web::response::ApiError::default().log_only(e))?;

    Ok(ApiSuccess::default()
        .with_data(stats)
        .with_message("Dashboard statistics retrieved"))
}
