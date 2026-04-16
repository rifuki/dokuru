use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use super::{dto::UpdateApiKey, entity::ApiKey};

/// API Key repository errors
#[derive(Debug, thiserror::Error)]
pub enum ApiKeyError {
    #[error("API Key not found")]
    NotFound,

    #[error("Invalid API Key")]
    InvalidKey,

    #[error("API Key expired")]
    Expired,

    #[error("API Key revoked")]
    Revoked,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// API Key repository trait
#[async_trait]
pub trait ApiKeyRepository: Send + Sync {
    async fn create(
        &self,
        pool: &PgPool,
        name: &str,
        key_hash: &str,
        scopes: Vec<String>,
        created_by: Option<Uuid>,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<ApiKey, ApiKeyError>;

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<ApiKey>, ApiKeyError>;

    async fn find_by_key_hash(
        &self,
        pool: &PgPool,
        key_hash: &str,
    ) -> Result<Option<ApiKey>, ApiKeyError>;

    async fn list(
        &self,
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiKey>, ApiKeyError>;

    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateApiKey,
    ) -> Result<Option<ApiKey>, ApiKeyError>;

    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, ApiKeyError>;

    async fn update_last_used(&self, pool: &PgPool, id: Uuid) -> Result<(), ApiKeyError>;
}

#[derive(Debug, Clone)]
pub struct ApiKeyRepositoryImpl;

impl ApiKeyRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ApiKeyRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ApiKeyRepository for ApiKeyRepositoryImpl {
    async fn create(
        &self,
        pool: &PgPool,
        name: &str,
        key_hash: &str,
        scopes: Vec<String>,
        created_by: Option<Uuid>,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<ApiKey, ApiKeyError> {
        let key = sqlx::query_as::<_, ApiKey>(
            "INSERT INTO api_keys (name, key_hash, scopes, created_by, expires_at, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
             RETURNING *"
        )
        .bind(name)
        .bind(key_hash)
        .bind(&scopes)
        .bind(created_by)
        .bind(expires_at)
        .fetch_one(pool)
        .await?;

        Ok(key)
    }

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<ApiKey>, ApiKeyError> {
        let key = sqlx::query_as::<_, ApiKey>("SELECT * FROM api_keys WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(key)
    }

    async fn find_by_key_hash(
        &self,
        pool: &PgPool,
        key_hash: &str,
    ) -> Result<Option<ApiKey>, ApiKeyError> {
        let key = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true",
        )
        .bind(key_hash)
        .fetch_optional(pool)
        .await?;

        Ok(key)
    }

    async fn list(
        &self,
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiKey>, ApiKeyError> {
        let keys = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(keys)
    }

    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateApiKey,
    ) -> Result<Option<ApiKey>, ApiKeyError> {
        let key = sqlx::query_as::<_, ApiKey>(
            "UPDATE api_keys
             SET name = COALESCE($1, name),
                 scopes = COALESCE($2, scopes),
                 is_active = COALESCE($3, is_active),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING *",
        )
        .bind(&payload.name)
        .bind(&payload.scopes)
        .bind(payload.is_active)
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(key)
    }

    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, ApiKeyError> {
        let result = sqlx::query("DELETE FROM api_keys WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn update_last_used(&self, pool: &PgPool, id: Uuid) -> Result<(), ApiKeyError> {
        sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }
}
