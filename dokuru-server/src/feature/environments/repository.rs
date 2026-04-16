use async_trait::async_trait;
use uuid::Uuid;

use crate::infrastructure::persistence::Database;

use super::models::Environment;

#[async_trait]
pub trait EnvironmentRepository: Send + Sync {
    async fn create(
        &self,
        db: &Database,
        user_id: Uuid,
        token_id: Uuid,
        name: Option<&str>,
        ip: Option<&str>,
    ) -> eyre::Result<Environment>;
    async fn find_by_id(
        &self,
        db: &Database,
        id: Uuid,
        user_id: Uuid,
    ) -> eyre::Result<Option<Environment>>;
    async fn find_by_token(
        &self,
        db: &Database,
        token_id: Uuid,
    ) -> eyre::Result<Option<Environment>>;
    async fn list_by_user(&self, db: &Database, user_id: Uuid) -> eyre::Result<Vec<Environment>>;
    async fn update_status(&self, db: &Database, id: Uuid, status: &str) -> eyre::Result<()>;
    async fn update_last_seen(&self, db: &Database, id: Uuid) -> eyre::Result<()>;
    async fn update_info(
        &self,
        db: &Database,
        id: Uuid,
        name: Option<&str>,
        docker_version: Option<&str>,
    ) -> eyre::Result<()>;
    async fn delete(&self, db: &Database, id: Uuid, user_id: Uuid) -> eyre::Result<bool>;
}

pub struct EnvironmentRepositoryImpl;

impl Default for EnvironmentRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

impl EnvironmentRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl EnvironmentRepository for EnvironmentRepositoryImpl {
    async fn create(
        &self,
        db: &Database,
        user_id: Uuid,
        token_id: Uuid,
        name: Option<&str>,
        ip: Option<&str>,
    ) -> eyre::Result<Environment> {
        let env = sqlx::query_as::<_, Environment>(
            "INSERT INTO environments (user_id, token_id, name, ip, status, last_seen) 
             VALUES ($1, $2, $3, $4, 'online', now()) 
             RETURNING *",
        )
        .bind(user_id)
        .bind(token_id)
        .bind(name)
        .bind(ip)
        .fetch_one(db.pool())
        .await?;

        Ok(env)
    }

    async fn find_by_id(
        &self,
        db: &Database,
        id: Uuid,
        user_id: Uuid,
    ) -> eyre::Result<Option<Environment>> {
        let env = sqlx::query_as::<_, Environment>(
            "SELECT * FROM environments WHERE id = $1 AND user_id = $2",
        )
        .bind(id)
        .bind(user_id)
        .fetch_optional(db.pool())
        .await?;

        Ok(env)
    }

    async fn find_by_token(
        &self,
        db: &Database,
        token_id: Uuid,
    ) -> eyre::Result<Option<Environment>> {
        let env =
            sqlx::query_as::<_, Environment>("SELECT * FROM environments WHERE token_id = $1")
                .bind(token_id)
                .fetch_optional(db.pool())
                .await?;

        Ok(env)
    }

    async fn list_by_user(&self, db: &Database, user_id: Uuid) -> eyre::Result<Vec<Environment>> {
        let envs = sqlx::query_as::<_, Environment>(
            "SELECT * FROM environments WHERE user_id = $1 ORDER BY created_at DESC",
        )
        .bind(user_id)
        .fetch_all(db.pool())
        .await?;

        Ok(envs)
    }

    async fn update_status(&self, db: &Database, id: Uuid, status: &str) -> eyre::Result<()> {
        sqlx::query("UPDATE environments SET status = $1 WHERE id = $2")
            .bind(status)
            .bind(id)
            .execute(db.pool())
            .await?;

        Ok(())
    }

    async fn update_last_seen(&self, db: &Database, id: Uuid) -> eyre::Result<()> {
        sqlx::query("UPDATE environments SET last_seen = now() WHERE id = $1")
            .bind(id)
            .execute(db.pool())
            .await?;

        Ok(())
    }

    async fn update_info(
        &self,
        db: &Database,
        id: Uuid,
        name: Option<&str>,
        docker_version: Option<&str>,
    ) -> eyre::Result<()> {
        sqlx::query(
            "UPDATE environments SET name = COALESCE($1, name), docker_version = COALESCE($2, docker_version) WHERE id = $3"
        )
        .bind(name)
        .bind(docker_version)
        .bind(id)
        .execute(db.pool())
        .await?;

        Ok(())
    }

    async fn delete(&self, db: &Database, id: Uuid, user_id: Uuid) -> eyre::Result<bool> {
        let result = sqlx::query("DELETE FROM environments WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(db.pool())
            .await?;

        Ok(result.rows_affected() > 0)
    }
}
