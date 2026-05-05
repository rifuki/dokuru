use async_trait::async_trait;
use eyre::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::entity::AuditResultRecord;

#[async_trait]
pub trait AuditResultRepository: Send + Sync {
    async fn save(&self, pool: &PgPool, record: &AuditResultRecord) -> Result<AuditResultRecord>;
    async fn find_latest(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultRecord>>;
    async fn find_by_id(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultRecord>>;
    async fn find_all(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<AuditResultRecord>>;
    async fn delete_by_id(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool>;
}

pub struct AuditResultRepositoryImpl;

impl Default for AuditResultRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

impl AuditResultRepositoryImpl {
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AuditResultRepository for AuditResultRepositoryImpl {
    async fn save(&self, pool: &PgPool, record: &AuditResultRecord) -> Result<AuditResultRecord> {
        let saved = sqlx::query_as::<_, AuditResultRecord>(
            r"
            INSERT INTO audit_results
                (id, agent_id, user_id, hostname, docker_version, total_containers,
                 results, total_rules, passed, failed, score, ran_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            ",
        )
        .bind(record.id)
        .bind(record.agent_id)
        .bind(record.user_id)
        .bind(&record.hostname)
        .bind(&record.docker_version)
        .bind(record.total_containers)
        .bind(&record.results)
        .bind(record.total_rules)
        .bind(record.passed)
        .bind(record.failed)
        .bind(record.score)
        .bind(record.ran_at)
        .fetch_one(pool)
        .await?;

        Ok(saved)
    }

    async fn find_latest(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultRecord>> {
        let record = sqlx::query_as::<_, AuditResultRecord>(
            r"
            SELECT * FROM audit_results
            WHERE agent_id = $1 AND user_id = $2
            ORDER BY ran_at DESC
            LIMIT 1
            ",
        )
        .bind(agent_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    async fn find_by_id(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultRecord>> {
        let record = sqlx::query_as::<_, AuditResultRecord>(
            r"
            SELECT * FROM audit_results
            WHERE id = $1 AND agent_id = $2 AND user_id = $3
            ",
        )
        .bind(audit_id)
        .bind(agent_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    async fn find_all(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<AuditResultRecord>> {
        let records = sqlx::query_as::<_, AuditResultRecord>(
            r"
            SELECT * FROM audit_results
            WHERE agent_id = $1 AND user_id = $2
            ORDER BY ran_at DESC
            ",
        )
        .bind(agent_id)
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    async fn delete_by_id(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool> {
        let deleted = sqlx::query_scalar::<_, Uuid>(
            r"
            DELETE FROM audit_results
            WHERE id = $1 AND agent_id = $2 AND user_id = $3
            RETURNING id
            ",
        )
        .bind(audit_id)
        .bind(agent_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(deleted.is_some())
    }
}
