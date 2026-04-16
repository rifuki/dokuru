use async_trait::async_trait;

use sqlx::PgPool;
use uuid::Uuid;

use super::entity::{AuthMethod, CreateOAuthAuth, CreatePasswordAuth};

#[derive(Debug, thiserror::Error)]
pub enum AuthMethodRepositoryError {
    #[error("Auth method not found")]
    NotFound,

    #[error("Auth method already exists for this provider")]
    AlreadyExists,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[async_trait]
pub trait AuthMethodRepository: Send + Sync {
    /// Create password auth method
    async fn create_password(
        &self,
        pool: &PgPool,
        data: CreatePasswordAuth,
    ) -> Result<AuthMethod, AuthMethodRepositoryError>;

    /// Create OAuth auth method
    async fn create_oauth(
        &self,
        pool: &PgPool,
        data: CreateOAuthAuth,
    ) -> Result<AuthMethod, AuthMethodRepositoryError>;

    /// Find by ID
    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<AuthMethod>, sqlx::Error>;

    /// Find by user and provider
    async fn find_by_user_and_provider(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        provider: &str,
    ) -> Result<Option<AuthMethod>, sqlx::Error>;

    /// Find by provider ID (for OAuth lookup)
    async fn find_by_provider_id(
        &self,
        pool: &PgPool,
        provider: &str,
        provider_id: &str,
    ) -> Result<Option<AuthMethod>, sqlx::Error>;

    /// List all auth methods for user
    async fn list_by_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<AuthMethod>, sqlx::Error>;

    /// Get primary auth method for user
    async fn find_primary(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<AuthMethod>, sqlx::Error>;

    /// Update last used timestamp
    async fn touch(&self, pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error>;

    /// Update password hash
    async fn update_password(
        &self,
        pool: &PgPool,
        id: Uuid,
        password_hash: &str,
    ) -> Result<bool, sqlx::Error>;

    /// Set as primary auth method
    async fn set_primary(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error>;

    /// Delete auth method
    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error>;

    /// Check if user has any auth methods
    async fn has_any(&self, pool: &PgPool, user_id: Uuid) -> Result<bool, sqlx::Error>;
}

#[derive(Debug, Clone, Default)]
pub struct AuthMethodRepositoryImpl;

impl AuthMethodRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AuthMethodRepository for AuthMethodRepositoryImpl {
    async fn create_password(
        &self,
        pool: &PgPool,
        data: CreatePasswordAuth,
    ) -> Result<AuthMethod, AuthMethodRepositoryError> {
        // Check if already exists
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM auth_methods WHERE user_id = $1 AND provider = 'password')",
        )
        .bind(data.user_id)
        .fetch_one(pool)
        .await?;

        if exists {
            return Err(AuthMethodRepositoryError::AlreadyExists);
        }

        let method = sqlx::query_as::<_, AuthMethod>(
            r#"
            INSERT INTO auth_methods (user_id, provider, password_hash, is_primary, is_verified)
            VALUES ($1, 'password', $2, $3, true)
            RETURNING *
            "#,
        )
        .bind(data.user_id)
        .bind(&data.password_hash)
        .bind(data.is_primary)
        .fetch_one(pool)
        .await?;

        Ok(method)
    }

    async fn create_oauth(
        &self,
        pool: &PgPool,
        data: CreateOAuthAuth,
    ) -> Result<AuthMethod, AuthMethodRepositoryError> {
        // Check if already exists
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM auth_methods WHERE user_id = $1 AND provider = $2)",
        )
        .bind(data.user_id)
        .bind(data.provider.as_str())
        .fetch_one(pool)
        .await?;

        if exists {
            return Err(AuthMethodRepositoryError::AlreadyExists);
        }

        let method = sqlx::query_as::<_, AuthMethod>(
            r#"
            INSERT INTO auth_methods 
                (user_id, provider, provider_id, oauth_access_token, oauth_refresh_token, 
                 oauth_expires_at, is_primary, is_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            RETURNING *
            "#,
        )
        .bind(data.user_id)
        .bind(data.provider.as_str())
        .bind(&data.provider_id)
        .bind(&data.access_token)
        .bind(&data.refresh_token)
        .bind(data.expires_at)
        .bind(data.is_primary)
        .fetch_one(pool)
        .await?;

        Ok(method)
    }

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<AuthMethod>, sqlx::Error> {
        let method = sqlx::query_as::<_, AuthMethod>("SELECT * FROM auth_methods WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(method)
    }

    async fn find_by_user_and_provider(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        provider: &str,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        let method = sqlx::query_as::<_, AuthMethod>(
            "SELECT * FROM auth_methods WHERE user_id = $1 AND provider = $2",
        )
        .bind(user_id)
        .bind(provider)
        .fetch_optional(pool)
        .await?;
        Ok(method)
    }

    async fn find_by_provider_id(
        &self,
        pool: &PgPool,
        provider: &str,
        provider_id: &str,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        let method = sqlx::query_as::<_, AuthMethod>(
            "SELECT * FROM auth_methods WHERE provider = $1 AND provider_id = $2",
        )
        .bind(provider)
        .bind(provider_id)
        .fetch_optional(pool)
        .await?;
        Ok(method)
    }

    async fn list_by_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<AuthMethod>, sqlx::Error> {
        let methods =
            sqlx::query_as::<_, AuthMethod>("SELECT * FROM auth_methods WHERE user_id = $1")
                .bind(user_id)
                .fetch_all(pool)
                .await?;
        Ok(methods)
    }

    async fn find_primary(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        let method = sqlx::query_as::<_, AuthMethod>(
            "SELECT * FROM auth_methods WHERE user_id = $1 AND is_primary = true LIMIT 1",
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
        Ok(method)
    }

    async fn touch(&self, pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE auth_methods SET last_used_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    async fn update_password(
        &self,
        pool: &PgPool,
        id: Uuid,
        password_hash: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE auth_methods SET password_hash = $2, updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .bind(password_hash)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn set_primary(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        // First, unset all primary for this user
        let method = self.find_by_id(pool, id).await?;
        if let Some(m) = method {
            sqlx::query("UPDATE auth_methods SET is_primary = false WHERE user_id = $1")
                .bind(m.user_id)
                .execute(pool)
                .await?;

            // Then set this one as primary
            let result = sqlx::query("UPDATE auth_methods SET is_primary = true WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            Ok(result.rows_affected() > 0)
        } else {
            Ok(false)
        }
    }

    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM auth_methods WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn has_any(&self, pool: &PgPool, user_id: Uuid) -> Result<bool, sqlx::Error> {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM auth_methods WHERE user_id = $1)")
                .bind(user_id)
                .fetch_one(pool)
                .await?;
        Ok(exists)
    }
}
