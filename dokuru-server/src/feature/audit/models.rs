use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct AuditResult {
    pub id: Uuid,
    pub env_id: Uuid,
    pub score: i32,
    pub results: serde_json::Value,
    pub scanned_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AuditSummary {
    pub id: Uuid,
    pub score: i32,
    pub scanned_at: DateTime<Utc>,
}

impl From<AuditResult> for AuditSummary {
    fn from(audit: AuditResult) -> Self {
        Self {
            id: audit.id,
            score: audit.score,
            scanned_at: audit.scanned_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TriggerAuditDto {
    // Empty for now, can add options later
}
