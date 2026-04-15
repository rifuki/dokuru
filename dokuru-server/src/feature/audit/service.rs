use std::sync::Arc;

use axum::extract::ws::Message;
use dashmap::DashMap;
use uuid::Uuid;

use crate::{
    feature::ws::{protocol::ServerMessage, AgentSession},
    infrastructure::persistence::Database,
};

use super::{models::AuditResult, repository::AuditRepository};

pub struct AuditService {
    db: Database,
    repo: Arc<dyn AuditRepository>,
}

impl AuditService {
    pub fn new(db: Database, repo: Arc<dyn AuditRepository>) -> Self {
        Self { db, repo }
    }

    /// Trigger audit on agent via WebSocket
    pub async fn trigger_audit(
        &self,
        env_id: Uuid,
        agents: &Arc<DashMap<Uuid, AgentSession>>,
    ) -> eyre::Result<Uuid> {
        // Check if agent is connected
        let session = agents
            .get(&env_id)
            .ok_or_else(|| eyre::eyre!("Agent not connected"))?;

        // Generate audit ID
        let audit_id = Uuid::new_v4();

        // Send audit start message to agent
        let message = ServerMessage::AuditStart { audit_id };
        let json = serde_json::to_string(&message)?;

        session
            .send(Message::Text(json.into()))
            .map_err(|e| eyre::eyre!("Failed to send message to agent: {}", e))?;

        Ok(audit_id)
    }

    /// Save audit result from agent
    pub async fn save_result(
        &self,
        env_id: Uuid,
        score: i32,
        results: &serde_json::Value,
    ) -> eyre::Result<AuditResult> {
        self.repo.create(&self.db, env_id, score, results).await
    }

    /// Get audit history for environment
    pub async fn get_history(&self, env_id: Uuid, limit: i64) -> eyre::Result<Vec<AuditResult>> {
        self.repo.list_by_env(&self.db, env_id, limit).await
    }

    /// Get audit detail by ID
    pub async fn get_detail(&self, audit_id: Uuid) -> eyre::Result<Option<AuditResult>> {
        self.repo.find_by_id(&self.db, audit_id).await
    }
}
