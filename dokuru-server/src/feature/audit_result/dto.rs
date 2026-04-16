use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveAuditDto {
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: usize,
    pub results: serde_json::Value,
    pub summary: AuditSummaryDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSummaryDto {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub score: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditResultResponse {
    pub id: Uuid,
    pub agent_id: Uuid,
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
