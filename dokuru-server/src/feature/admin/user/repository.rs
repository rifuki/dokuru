use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::feature::user::User;

/// Admin user repository errors
#[derive(Debug, thiserror::Error)]
pub enum AdminUserRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("User not found")]
    NotFound,
}

/// Admin user repository trait
#[async_trait]
pub trait AdminUserRepository: Send + Sync {
    /// List all users ordered by creation date
    async fn list_all(&self, pool: &PgPool) -> Result<Vec<User>, AdminUserRepositoryError>;

    /// Update user role
    async fn update_role(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        role: &str,
    ) -> Result<Option<User>, AdminUserRepositoryError>;
}

#[derive(Debug, Clone, Default)]
pub struct AdminUserRepositoryImpl;

impl AdminUserRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AdminUserRepository for AdminUserRepositoryImpl {
    async fn list_all(&self, pool: &PgPool) -> Result<Vec<User>, AdminUserRepositoryError> {
        let users: Vec<User> = sqlx::query_as(
            r#"
            SELECT id, email, username, is_active, email_verified, role, created_at, updated_at 
            FROM users 
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    async fn update_role(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        role: &str,
    ) -> Result<Option<User>, AdminUserRepositoryError> {
        let user: Option<User> = sqlx::query_as(
            r#"
            UPDATE users 
            SET role = $1, updated_at = NOW() 
            WHERE id = $2 
            RETURNING id, email, username, is_active, email_verified, role, created_at, updated_at
            "#,
        )
        .bind(role)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }
}
