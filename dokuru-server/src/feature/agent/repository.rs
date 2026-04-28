use async_trait::async_trait;
use eyre::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::entity::Agent;

pub struct UpdateAgentParams<'a> {
    pub name: &'a str,
    pub url: &'a str,
    pub access_mode: &'a str,
    pub token_hash: Option<&'a str>,
    pub encrypted_token: Option<&'a str>,
}

#[async_trait]
pub trait AgentRepository: Send + Sync {
    async fn create(&self, pool: &PgPool, agent: &Agent) -> Result<Agent>;
    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<Agent>>;
    async fn find_by_user_id(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<Agent>>;
    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
        params: UpdateAgentParams<'_>,
    ) -> Result<Option<Agent>>;
    async fn delete(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool>;
}

pub struct AgentRepositoryImpl;

impl Default for AgentRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRepositoryImpl {
    pub const fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AgentRepository for AgentRepositoryImpl {
    async fn create(&self, pool: &PgPool, agent: &Agent) -> Result<Agent> {
        let agent = sqlx::query_as::<_, Agent>(
            r"
            INSERT INTO agents (id, user_id, name, url, token_hash, encrypted_token, access_mode, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            ",
        )
        .bind(agent.id)
        .bind(agent.user_id)
        .bind(&agent.name)
        .bind(&agent.url)
        .bind(&agent.token_hash)
        .bind(&agent.encrypted_token)
        .bind(&agent.access_mode)
        .bind(&agent.status)
        .fetch_one(pool)
        .await?;

        Ok(agent)
    }

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<Agent>> {
        let agent = sqlx::query_as::<_, Agent>(
            r"
            SELECT * FROM agents WHERE id = $1
            ",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(agent)
    }

    async fn find_by_user_id(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<Agent>> {
        let agents = sqlx::query_as::<_, Agent>(
            r"
            SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at DESC
            ",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(agents)
    }

    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
        params: UpdateAgentParams<'_>,
    ) -> Result<Option<Agent>> {
        let agent = if let (Some(hash), Some(encrypted)) =
            (params.token_hash, params.encrypted_token)
        {
            sqlx::query_as::<_, Agent>(
                    r"
                UPDATE agents
                SET name = $1, url = $2, token_hash = $3, encrypted_token = $4, access_mode = $5, updated_at = NOW()
                WHERE id = $6 AND user_id = $7
                RETURNING *
                ",
                )
                .bind(params.name)
                .bind(params.url)
                .bind(hash)
                .bind(encrypted)
                .bind(params.access_mode)
                .bind(id)
                .bind(user_id)
                .fetch_optional(pool)
                .await?
        } else {
            sqlx::query_as::<_, Agent>(
                r"
                UPDATE agents
                SET name = $1, url = $2, access_mode = $3, updated_at = NOW()
                WHERE id = $4 AND user_id = $5
                RETURNING *
                ",
            )
            .bind(params.name)
            .bind(params.url)
            .bind(params.access_mode)
            .bind(id)
            .bind(user_id)
            .fetch_optional(pool)
            .await?
        };

        Ok(agent)
    }

    async fn delete(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool> {
        let result = sqlx::query(
            r"
            DELETE FROM agents WHERE id = $1 AND user_id = $2
            ",
        )
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}
