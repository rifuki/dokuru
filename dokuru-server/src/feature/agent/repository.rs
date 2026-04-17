use async_trait::async_trait;
use eyre::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::entity::Agent;

#[async_trait]
pub trait AgentRepository: Send + Sync {
    async fn create(&self, pool: &PgPool, agent: &Agent) -> Result<Agent>;
    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<Agent>>;
    async fn find_by_user_id(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<Agent>>;
    async fn update(&self, pool: &PgPool, id: Uuid, user_id: Uuid, name: &str, url: &str, token_hash: Option<&str>) -> Result<Option<Agent>>;
    async fn delete(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool>;
}

pub struct AgentRepositoryImpl;

impl AgentRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AgentRepository for AgentRepositoryImpl {
    async fn create(&self, pool: &PgPool, agent: &Agent) -> Result<Agent> {
        let agent = sqlx::query_as::<_, Agent>(
            r#"
            INSERT INTO agents (id, user_id, name, url, token_hash, access_mode, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(agent.id)
        .bind(agent.user_id)
        .bind(&agent.name)
        .bind(&agent.url)
        .bind(&agent.token_hash)
        .bind(&agent.access_mode)
        .bind(&agent.status)
        .fetch_one(pool)
        .await?;

        Ok(agent)
    }

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<Agent>> {
        let agent = sqlx::query_as::<_, Agent>(
            r#"
            SELECT * FROM agents WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(agent)
    }

    async fn find_by_user_id(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<Agent>> {
        let agents = sqlx::query_as::<_, Agent>(
            r#"
            SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(agents)
    }

    async fn update(&self, pool: &PgPool, id: Uuid, user_id: Uuid, name: &str, url: &str, token_hash: Option<&str>) -> Result<Option<Agent>> {
        let agent = if let Some(hash) = token_hash {
            sqlx::query_as::<_, Agent>(
                r#"
                UPDATE agents
                SET name = $1, url = $2, token_hash = $3, updated_at = NOW()
                WHERE id = $4 AND user_id = $5
                RETURNING *
                "#,
            )
            .bind(name)
            .bind(url)
            .bind(hash)
            .bind(id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?
        } else {
            sqlx::query_as::<_, Agent>(
                r#"
                UPDATE agents
                SET name = $1, url = $2, updated_at = NOW()
                WHERE id = $3 AND user_id = $4
                RETURNING *
                "#,
            )
            .bind(name)
            .bind(url)
            .bind(id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?
        };

        Ok(agent)
    }

    async fn delete(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool> {
        let result = sqlx::query(
            r#"
            DELETE FROM agents WHERE id = $1 AND user_id = $2
            "#,
        )
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
