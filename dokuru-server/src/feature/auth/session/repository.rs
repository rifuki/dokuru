use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::entity::{DeviceInfo, UserSession};

#[derive(Debug, Error)]
pub enum SessionRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Session not found")]
    NotFound,
    #[error("Session expired")]
    Expired,
}

#[async_trait]
pub trait SessionRepository: Send + Sync {
    /// Create a new session
    async fn create(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        session_id: &str,
        device_info: &DeviceInfo,
        expires_at: DateTime<Utc>,
    ) -> Result<UserSession, SessionRepositoryError>;

    /// Find session by session_id
    async fn find_by_session_id(
        &self,
        pool: &PgPool,
        session_id: &str,
    ) -> Result<Option<UserSession>, SessionRepositoryError>;

    /// Find session by id
    async fn find_by_id(
        &self,
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<UserSession>, SessionRepositoryError>;

    /// List all active sessions for a user
    async fn list_active_by_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<UserSession>, SessionRepositoryError>;

    /// Update last active timestamp
    async fn update_last_active(
        &self,
        pool: &PgPool,
        session_id: &str,
    ) -> Result<(), SessionRepositoryError>;

    /// Revoke a specific session
    async fn revoke(
        &self,
        pool: &PgPool,
        id: Uuid,
        reason: &str,
    ) -> Result<bool, SessionRepositoryError>;

    /// Revoke all sessions for a user except the current one
    async fn revoke_all_except(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        except_session_id: &str,
    ) -> Result<u64, SessionRepositoryError>;

    /// Revoke all sessions for a user
    async fn revoke_all(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        reason: &str,
    ) -> Result<u64, SessionRepositoryError>;

    /// Count active sessions for a user
    async fn count_active(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<i64, SessionRepositoryError>;

    /// Clean up expired sessions
    async fn cleanup_expired(&self, pool: &PgPool) -> Result<u64, SessionRepositoryError>;
}

#[derive(Debug, Clone)]
pub struct SessionRepositoryImpl;

impl SessionRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SessionRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SessionRepository for SessionRepositoryImpl {
    async fn create(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        session_id: &str,
        device_info: &DeviceInfo,
        expires_at: DateTime<Utc>,
    ) -> Result<UserSession, SessionRepositoryError> {
        let session = sqlx::query_as::<_, UserSession>(
            r#"
            INSERT INTO user_sessions (
                user_id, session_id, device_name, device_type, 
                ip_address, user_agent, location, expires_at
            )
            VALUES ($1, $2, $3, $4, $5::inet, $6, NULL, $7)
            RETURNING *
            "#,
        )
        .bind(user_id)
        .bind(session_id)
        .bind(&device_info.name)
        .bind(&device_info.device_type)
        .bind(&device_info.ip_address)
        .bind(&device_info.user_agent)
        .bind(expires_at)
        .fetch_one(pool)
        .await?;

        Ok(session)
    }

    async fn find_by_session_id(
        &self,
        pool: &PgPool,
        session_id: &str,
    ) -> Result<Option<UserSession>, SessionRepositoryError> {
        let session = sqlx::query_as::<_, UserSession>(
            r#"SELECT * FROM user_sessions WHERE session_id = $1"#,
        )
        .bind(session_id)
        .fetch_optional(pool)
        .await?;

        Ok(session)
    }

    async fn find_by_id(
        &self,
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<UserSession>, SessionRepositoryError> {
        let session =
            sqlx::query_as::<_, UserSession>(r#"SELECT * FROM user_sessions WHERE id = $1"#)
                .bind(id)
                .fetch_optional(pool)
                .await?;

        Ok(session)
    }

    async fn list_active_by_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<UserSession>, SessionRepositoryError> {
        let sessions = sqlx::query_as::<_, UserSession>(
            r#"
            SELECT * FROM user_sessions 
            WHERE user_id = $1 AND is_active = TRUE 
            ORDER BY last_active_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(sessions)
    }

    async fn update_last_active(
        &self,
        pool: &PgPool,
        session_id: &str,
    ) -> Result<(), SessionRepositoryError> {
        sqlx::query(
            r#"
            UPDATE user_sessions 
            SET last_active_at = NOW() 
            WHERE session_id = $1 AND is_active = TRUE
            "#,
        )
        .bind(session_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    async fn revoke(
        &self,
        pool: &PgPool,
        id: Uuid,
        reason: &str,
    ) -> Result<bool, SessionRepositoryError> {
        let result = sqlx::query(
            r#"
            UPDATE user_sessions 
            SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $2
            WHERE id = $1 AND is_active = TRUE
            "#,
        )
        .bind(id)
        .bind(reason)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn revoke_all_except(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        except_session_id: &str,
    ) -> Result<u64, SessionRepositoryError> {
        let result = sqlx::query(
            r#"
            UPDATE user_sessions 
            SET is_active = FALSE, revoked_at = NOW(), revoked_reason = 'logout_other'
            WHERE user_id = $1 
            AND session_id != $2 
            AND is_active = TRUE
            "#,
        )
        .bind(user_id)
        .bind(except_session_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    async fn revoke_all(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        reason: &str,
    ) -> Result<u64, SessionRepositoryError> {
        let result = sqlx::query(
            r#"
            UPDATE user_sessions 
            SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $2
            WHERE user_id = $1 AND is_active = TRUE
            "#,
        )
        .bind(user_id)
        .bind(reason)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    async fn count_active(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<i64, SessionRepositoryError> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM user_sessions 
            WHERE user_id = $1 AND is_active = TRUE
            "#,
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    async fn cleanup_expired(&self, pool: &PgPool) -> Result<u64, SessionRepositoryError> {
        let result = sqlx::query(
            r#"
            UPDATE user_sessions 
            SET is_active = FALSE, revoked_at = NOW(), revoked_reason = 'expired'
            WHERE is_active = TRUE AND expires_at < NOW()
            "#,
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
