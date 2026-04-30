use axum::extract::State;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AdminAgentListItem {
    pub id: Uuid,
    pub user_id: Uuid,
    pub user_email: String,
    pub name: String,
    pub url: String,
    pub access_mode: String,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AdminAgentListResponse {
    pub agents: Vec<AdminAgentListItem>,
    pub total: i64,
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn list_agents(State(state): State<AppState>) -> ApiResult<AdminAgentListResponse> {
    let agents = sqlx::query_as::<_, AdminAgentListItem>(
        r"
        SELECT
            a.id,
            a.user_id,
            u.email AS user_email,
            a.name,
            a.url,
            a.access_mode,
            a.status,
            a.last_seen,
            a.created_at,
            a.updated_at
        FROM agents a
        JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
        ",
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|error| ApiError::default().log_only(error))?;

    let total = i64::try_from(agents.len()).unwrap_or(i64::MAX);

    Ok(ApiSuccess::default()
        .with_data(AdminAgentListResponse { agents, total })
        .with_message("Agents retrieved successfully"))
}
