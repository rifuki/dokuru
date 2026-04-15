use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Messages sent from server to agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Request agent to start audit
    AuditStart { audit_id: Uuid },
    /// Ping to check connection
    Ping,
}

/// Messages sent from agent to server
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentMessage {
    /// Agent info on connect
    AgentInfo {
        hostname: Option<String>,
        docker_version: Option<String>,
    },
    /// Audit results
    AuditResult {
        audit_id: Uuid,
        score: i32,
        results: serde_json::Value,
    },
    /// Heartbeat response
    Heartbeat,
}
