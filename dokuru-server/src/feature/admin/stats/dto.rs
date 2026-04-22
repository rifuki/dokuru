use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

/// Dashboard statistics response
#[derive(Debug, Serialize)]
pub struct DashboardStatsResponse {
    // User stats
    pub total_users: i64,
    pub total_admins: i64,
    pub new_users_this_month: i64,

    // Agent stats
    pub total_agents: i64,
    pub active_agents: i64,
    pub agents_by_mode: AgentsByMode,
    pub relay_agents_count: i64,

    // Audit stats
    pub total_audits: i64,
    pub audits_this_month: i64,
    pub average_score: f64,
    pub audit_activity: Vec<AuditActivity>,

    // API Keys
    pub total_api_keys: i64,
    pub active_api_keys: i64,

    // Recent registrations
    pub recent_registrations: Vec<RecentUser>,

    // System health
    pub system_health: SystemHealth,
}

/// Recent user registration
#[derive(Debug, Serialize)]
pub struct RecentUser {
    pub id: Uuid,
    pub username: Option<String>,
    pub email: String,
    pub email_verified: bool,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

/// Agent connection mode breakdown
#[derive(Debug, Serialize)]
pub struct AgentsByMode {
    pub direct: i64,
    pub cloudflare: i64,
    pub domain: i64,
    pub relay: i64,
}

/// System health component
#[derive(Debug, Serialize)]
pub struct ComponentHealth {
    pub status: HealthStatus,
    pub response_time_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Down,
}

/// System health overview
#[derive(Debug, Serialize)]
pub struct SystemHealth {
    pub database: ComponentHealth,
    pub redis: Option<ComponentHealth>,
    pub server_uptime_seconds: u64,
    pub active_websockets: usize,
}

/// Audit activity per day
#[derive(Debug, Serialize)]
pub struct AuditActivity {
    pub date: String,
    pub count: i64,
}
