use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditResultRecord {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub user_id: Uuid,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: i32,
    pub results: serde_json::Value,
    pub total_rules: i32,
    pub passed: i32,
    pub failed: i32,
    pub score: i32,
    pub ran_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}
