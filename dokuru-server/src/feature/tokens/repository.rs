use async_trait::async_trait;
use uuid::Uuid;

use crate::infrastructure::persistence::Database;

use super::models::Token;

#[async_trait]
pub trait TokenRepository: Send + Sync {
    async fn create(&self, db: &Database, user_id: Uuid, name: &str, token_hash: &str) -> eyre::Result<Token>;
    async fn find_by_hash(&self, db: &Database, token_hash: &str) -> eyre::Result<Option<Token>>;
    async fn list_by_user(&self, db: &Database, user_id: Uuid) -> eyre::Result<Vec<Token>>;
    async fn delete(&self, db: &Database, id: Uuid, user_id: Uuid) -> eyre::Result<bool>;
    async fn update_last_used(&self, db: &Database, id: Uuid) -> eyre::Result<()>;
}

pub struct TokenRepositoryImpl;

impl TokenRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl TokenRepository for TokenRepositoryImpl {
    async fn create(&self, db: &Database, user_id: Uuid, name: &str, token_hash: &str) -> eyre::Result<Token> {
        let token = sqlx::query_as::<_, Token>(
            "INSERT INTO tokens (user_id, name, token_hash) VALUES ($1, $2, $3) RETURNING *"
        )
        .bind(user_id)
        .bind(name)
        .bind(token_hash)
        .fetch_one(db.pool())
        .await?;

        Ok(token)
    }

    async fn find_by_hash(&self, db: &Database, token_hash: &str) -> eyre::Result<Option<Token>> {
        let token = sqlx::query_as::<_, Token>(
            "SELECT * FROM tokens WHERE token_hash = $1"
        )
        .bind(token_hash)
        .fetch_optional(db.pool())
        .await?;

        Ok(token)
    }

    async fn list_by_user(&self, db: &Database, user_id: Uuid) -> eyre::Result<Vec<Token>> {
        let tokens = sqlx::query_as::<_, Token>(
            "SELECT * FROM tokens WHERE user_id = $1 ORDER BY created_at DESC"
        )
        .bind(user_id)
        .fetch_all(db.pool())
        .await?;

        Ok(tokens)
    }

    async fn delete(&self, db: &Database, id: Uuid, user_id: Uuid) -> eyre::Result<bool> {
        let result = sqlx::query(
            "DELETE FROM tokens WHERE id = $1 AND user_id = $2"
        )
        .bind(id)
        .bind(user_id)
        .execute(db.pool())
        .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn update_last_used(&self, db: &Database, id: Uuid) -> eyre::Result<()> {
        sqlx::query(
            "UPDATE tokens SET last_used = now() WHERE id = $1"
        )
        .bind(id)
        .execute(db.pool())
        .await?;

        Ok(())
    }
}
