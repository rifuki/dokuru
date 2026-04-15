use async_trait::async_trait;
use uuid::Uuid;

use crate::infrastructure::persistence::Database;

use super::models::AuditResult;

#[async_trait]
pub trait AuditRepository: Send + Sync {
    async fn create(&self, db: &Database, env_id: Uuid, score: i32, results: &serde_json::Value) -> eyre::Result<AuditResult>;
    async fn find_by_id(&self, db: &Database, id: Uuid) -> eyre::Result<Option<AuditResult>>;
    async fn list_by_env(&self, db: &Database, env_id: Uuid, limit: i64) -> eyre::Result<Vec<AuditResult>>;
}

pub struct AuditRepositoryImpl;

impl AuditRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AuditRepository for AuditRepositoryImpl {
    async fn create(&self, db: &Database, env_id: Uuid, score: i32, results: &serde_json::Value) -> eyre::Result<AuditResult> {
        let audit = sqlx::query_as::<_, AuditResult>(
            "INSERT INTO audit_results (env_id, score, results) VALUES ($1, $2, $3) RETURNING *"
        )
        .bind(env_id)
        .bind(score)
        .bind(results)
        .fetch_one(db.pool())
        .await?;

        Ok(audit)
    }

    async fn find_by_id(&self, db: &Database, id: Uuid) -> eyre::Result<Option<AuditResult>> {
        let audit = sqlx::query_as::<_, AuditResult>(
            "SELECT * FROM audit_results WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(db.pool())
        .await?;

        Ok(audit)
    }

    async fn list_by_env(&self, db: &Database, env_id: Uuid, limit: i64) -> eyre::Result<Vec<AuditResult>> {
        let audits = sqlx::query_as::<_, AuditResult>(
            "SELECT * FROM audit_results WHERE env_id = $1 ORDER BY scanned_at DESC LIMIT $2"
        )
        .bind(env_id)
        .bind(limit)
        .fetch_all(db.pool())
        .await?;

        Ok(audits)
    }
}
