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
pub struct AdminAuditListItem {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub agent_name: String,
    pub user_email: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_rules: i32,
    pub passed: i32,
    pub failed: i32,
    pub score: i32,
    pub ran_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AdminAuditListResponse {
    pub audits: Vec<AdminAuditListItem>,
    pub total: i64,
}

pub async fn list_audits(State(state): State<AppState>) -> ApiResult<AdminAuditListResponse> {
    let audits = sqlx::query_as::<_, AdminAuditListItem>(
        r"
        SELECT
            ar.id,
            ar.agent_id,
            a.name AS agent_name,
            u.email AS user_email,
            ar.hostname,
            ar.docker_version,
            ar.total_rules,
            ar.passed,
            ar.failed,
            ar.score,
            ar.ran_at,
            ar.created_at
        FROM audit_results ar
        JOIN agents a ON a.id = ar.agent_id
        JOIN users u ON u.id = ar.user_id
        ORDER BY ar.ran_at DESC, ar.created_at DESC
        ",
    )
    .fetch_all(state.db.pool())
    .await
    .map_err(|error| ApiError::default().log_only(error))?;

    let total = i64::try_from(audits.len()).unwrap_or(i64::MAX);

    Ok(ApiSuccess::default()
        .with_data(AdminAuditListResponse { audits, total })
        .with_message("Audits retrieved successfully"))
}
