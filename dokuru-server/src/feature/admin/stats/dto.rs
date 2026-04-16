use serde::Serialize;

/// Dashboard statistics response
#[derive(Debug, Serialize)]
pub struct DashboardStatsResponse {
    pub total_users: i64,
    pub total_admins: i64,
    pub total_api_keys: i64,
    pub active_api_keys: i64,
    pub new_users_this_month: i64,
}
