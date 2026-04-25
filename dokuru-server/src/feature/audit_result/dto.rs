use chrono::{DateTime, Utc};
use dokuru_core::audit::AuditViewReport;
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
pub struct FixRuleDto {
    pub rule_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixOutcomeResponse {
    pub rule_id: String,
    pub status: String,
    pub message: String,
    pub requires_restart: bool,
    pub restart_command: Option<String>,
    pub requires_elevation: bool,
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
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: i32,
    pub results: serde_json::Value,
    pub summary: AuditSummaryResponse,
    pub ran_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSummaryResponse {
    pub total: i32,
    pub passed: i32,
    pub failed: i32,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReportResponse {
    pub audit_id: Uuid,
    pub agent_id: Uuid,
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: i32,
    pub report: AuditViewReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayFixResponse {
    pub outcome: FixOutcomeResponse,
    pub audit: Option<AuditResultResponse>,
}
