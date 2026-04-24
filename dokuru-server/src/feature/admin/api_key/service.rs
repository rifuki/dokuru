use chrono::Utc;
use uuid::Uuid;

use super::{
    domain::{self, Usability},
    dto::{ApiKeyResponse, ApiKeyWithPlain, UpdateApiKey},
    entity::ApiKey,
    repository::{ApiKeyError, ApiKeyRepository},
};
use crate::infrastructure::persistence::Database;
use std::sync::Arc;

/// API Key Service
#[derive(Clone)]
pub struct ApiKeyService {
    db: Database,
    repo: Arc<dyn ApiKeyRepository>,
}

impl ApiKeyService {
    pub fn new(db: Database, repo: Arc<dyn ApiKeyRepository>) -> Self {
        Self { db, repo }
    }

    /// Generate a new API key
    /// Returns the key with plain text (shown only once)
    pub async fn generate_key(
        &self,
        name: &str,
        scopes: Vec<String>,
        created_by: Option<Uuid>,
        expires_days: Option<i64>,
    ) -> Result<ApiKeyWithPlain, ApiKeyError> {
        let plain_key = domain::generate_plain_key();
        let key_hash = domain::hash_key(&plain_key);
        let expires_at = expires_days.map(|days| domain::expires_at_from_days(Utc::now(), days));

        // Save to database
        let key = self
            .repo
            .create(
                self.db.pool(),
                name,
                &key_hash,
                scopes.clone(),
                created_by,
                expires_at,
            )
            .await?;

        Ok(ApiKeyWithPlain {
            id: key.id,
            name: key.name,
            key: plain_key, // Only shown once!
            scopes: key.scopes,
            expires_at: key.expires_at,
            created_at: key.created_at,
        })
    }

    /// Validate an API key
    pub async fn validate_key(&self, plain_key: &str) -> Result<ApiKey, ApiKeyError> {
        let key_hash = domain::hash_key(plain_key);

        // Find by hash
        let key = self
            .repo
            .find_by_key_hash(self.db.pool(), &key_hash)
            .await?
            .ok_or(ApiKeyError::InvalidKey)?;

        match domain::usability(key.is_active, key.expires_at, Utc::now()) {
            Usability::Active => {}
            Usability::Revoked => return Err(ApiKeyError::Revoked),
            Usability::Expired => return Err(ApiKeyError::Expired),
        }

        // Update last used
        self.repo.update_last_used(self.db.pool(), key.id).await?;

        Ok(key)
    }

    /// List all API keys
    pub async fn list_keys(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiKeyResponse>, ApiKeyError> {
        let keys = self.repo.list(self.db.pool(), limit, offset).await?;
        Ok(keys.into_iter().map(ApiKeyResponse::from).collect())
    }

    /// Get key by ID
    pub async fn get_key(&self, id: Uuid) -> Result<Option<ApiKeyResponse>, ApiKeyError> {
        let key = self.repo.find_by_id(self.db.pool(), id).await?;
        Ok(key.map(ApiKeyResponse::from))
    }

    /// Update key
    pub async fn update_key(
        &self,
        id: Uuid,
        payload: &UpdateApiKey,
    ) -> Result<Option<ApiKeyResponse>, ApiKeyError> {
        let key = self.repo.update(self.db.pool(), id, payload).await?;
        Ok(key.map(ApiKeyResponse::from))
    }

    /// Delete key
    pub async fn delete_key(&self, id: Uuid) -> Result<bool, ApiKeyError> {
        self.repo.delete(self.db.pool(), id).await
    }

    /// Revoke key (set is_active = false)
    pub async fn revoke_key(&self, id: Uuid) -> Result<Option<ApiKeyResponse>, ApiKeyError> {
        let payload = UpdateApiKey {
            name: None,
            scopes: None,
            is_active: Some(false),
        };
        self.update_key(id, &payload).await
    }

    /// Refresh key (revoke old, create new)
    pub async fn refresh_key(
        &self,
        id: Uuid,
        created_by: Option<Uuid>,
    ) -> Result<ApiKeyWithPlain, ApiKeyError> {
        // Get old key info
        let old_key = self
            .repo
            .find_by_id(self.db.pool(), id)
            .await?
            .ok_or(ApiKeyError::NotFound)?;

        // Revoke old key
        self.revoke_key(id).await?;

        // Create new key with same settings
        let expires_days = old_key
            .expires_at
            .map(|expires_at| domain::refreshed_expires_days(old_key.created_at, expires_at));

        self.generate_key(
            &domain::refreshed_name(&old_key.name),
            old_key.scopes,
            created_by,
            expires_days,
        )
        .await
    }
}
