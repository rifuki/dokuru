use std::sync::Arc;

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{
    feature::auth::session::{DeviceInfo, SessionRepository, SessionRepositoryError, UserSession},
    infrastructure::persistence::Database,
};

/// Session service for managing user sessions
#[derive(Clone)]
pub struct SessionService {
    db: Database,
    repo: Arc<dyn SessionRepository>,
}

impl SessionService {
    pub fn new(db: Database, repo: Arc<dyn SessionRepository>) -> Self {
        Self { db, repo }
    }

    /// Create a new session
    pub async fn create_session(
        &self,
        user_id: Uuid,
        session_id: &str,
        device_info: &DeviceInfo,
        expires_at: DateTime<Utc>,
    ) -> Result<UserSession, SessionRepositoryError> {
        self.repo
            .create(self.db.pool(), user_id, session_id, device_info, expires_at)
            .await
    }

    /// Get session by session_id
    pub async fn get_session(
        &self,
        session_id: &str,
    ) -> Result<Option<UserSession>, SessionRepositoryError> {
        self.repo
            .find_by_session_id(self.db.pool(), session_id)
            .await
    }

    /// List all active sessions for a user
    pub async fn list_sessions(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<UserSession>, SessionRepositoryError> {
        self.repo.list_active_by_user(self.db.pool(), user_id).await
    }

    /// Update last active timestamp
    pub async fn touch_session(&self, session_id: &str) -> Result<(), SessionRepositoryError> {
        self.repo
            .update_last_active(self.db.pool(), session_id)
            .await
    }

    /// Revoke a specific session by internal UUID
    pub async fn revoke_session(
        &self,
        session_id: Uuid,
        reason: &str,
    ) -> Result<bool, SessionRepositoryError> {
        self.repo.revoke(self.db.pool(), session_id, reason).await
    }

    /// Revoke session by session_id string (JWT sid claim)
    pub async fn revoke_by_session_id(
        &self,
        session_id: &str,
        reason: &str,
    ) -> Result<bool, SessionRepositoryError> {
        // Find session by session_id string
        if let Some(session) = self
            .repo
            .find_by_session_id(self.db.pool(), session_id)
            .await?
        {
            self.repo.revoke(self.db.pool(), session.id, reason).await
        } else {
            Ok(false) // Session not found
        }
    }

    /// Revoke all sessions except current
    pub async fn revoke_all_except(
        &self,
        user_id: Uuid,
        current_session_id: &str,
    ) -> Result<u64, SessionRepositoryError> {
        self.repo
            .revoke_all_except(self.db.pool(), user_id, current_session_id)
            .await
    }

    /// Revoke all sessions (e.g., on password change)
    pub async fn revoke_all_sessions(
        &self,
        user_id: Uuid,
        reason: &str,
    ) -> Result<u64, SessionRepositoryError> {
        self.repo.revoke_all(self.db.pool(), user_id, reason).await
    }

    /// Check if session is valid and active
    pub async fn is_session_valid(&self, session_id: &str) -> Result<bool, SessionRepositoryError> {
        match self
            .repo
            .find_by_session_id(self.db.pool(), session_id)
            .await?
        {
            Some(session) => {
                if !session.is_active {
                    return Ok(false);
                }
                if session.expires_at < Utc::now() {
                    return Ok(false);
                }
                Ok(true)
            }
            None => Ok(false),
        }
    }

    /// Get active session count for user
    pub async fn get_session_count(&self, user_id: Uuid) -> Result<i64, SessionRepositoryError> {
        self.repo.count_active(self.db.pool(), user_id).await
    }

    /// Clean up expired sessions
    pub async fn cleanup_expired(&self) -> Result<u64, SessionRepositoryError> {
        self.repo.cleanup_expired(self.db.pool()).await
    }
}
