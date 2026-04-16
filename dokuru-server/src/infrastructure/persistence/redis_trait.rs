use async_trait::async_trait;
use chrono::Utc;
use tracing::{debug, error};
use uuid::Uuid;

use crate::infrastructure::persistence::RedisPool;

/// Redis cache operations trait
#[async_trait]
pub trait Cache: Send + Sync {
    /// Get value by key
    async fn get(&self, key: &str) -> eyre::Result<Option<String>>;

    /// Set value with TTL (seconds)
    async fn set(&self, key: &str, value: &str, ttl_secs: u64) -> eyre::Result<()>;

    /// Delete key
    async fn delete(&self, key: &str) -> eyre::Result<()>;

    /// Check if key exists
    async fn exists(&self, key: &str) -> eyre::Result<bool>;
}

/// Session blacklist operations trait
#[async_trait]
pub trait SessionBlacklist: Send + Sync {
    /// Blacklist a session (jti) until its original expiry
    async fn blacklist_session(&self, jti: &str, exp_timestamp: i64) -> eyre::Result<()>;

    /// Check if session is blacklisted
    async fn is_blacklisted(&self, jti: &str) -> eyre::Result<bool>;
}

/// Cache implementation using Redis
#[derive(Clone)]
pub struct RedisCache {
    pool: RedisPool,
}

impl RedisCache {
    pub fn new(pool: RedisPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get(&self, key: &str) -> eyre::Result<Option<String>> {
        let mut conn = self.pool.get().await?;

        let result: Option<String> = redis::cmd("GET").arg(key).query_async(&mut *conn).await?;

        Ok(result)
    }

    async fn set(&self, key: &str, value: &str, ttl_secs: u64) -> eyre::Result<()> {
        let mut conn = self.pool.get().await?;

        redis::cmd("SETEX")
            .arg(key)
            .arg(ttl_secs)
            .arg(value)
            .query_async::<()>(&mut *conn)
            .await?;

        Ok(())
    }

    async fn delete(&self, key: &str) -> eyre::Result<()> {
        let mut conn = self.pool.get().await?;

        redis::cmd("DEL")
            .arg(key)
            .query_async::<()>(&mut *conn)
            .await?;

        Ok(())
    }

    async fn exists(&self, key: &str) -> eyre::Result<bool> {
        let mut conn = self.pool.get().await?;

        let result: bool = redis::cmd("EXISTS")
            .arg(key)
            .query_async::<bool>(&mut *conn)
            .await?;

        Ok(result)
    }
}

/// Session blacklist implementation using Redis
#[derive(Clone)]
pub struct RedisSessionBlacklist {
    pool: RedisPool,
}

impl RedisSessionBlacklist {
    pub fn new(pool: RedisPool) -> Self {
        Self { pool }
    }

    fn blacklist_key(jti: &str) -> String {
        format!("blacklist:session:{jti}")
    }
}

#[async_trait]
impl SessionBlacklist for RedisSessionBlacklist {
    async fn blacklist_session(&self, jti: &str, exp_timestamp: i64) -> eyre::Result<()> {
        let remaining_ttl = exp_timestamp - Utc::now().timestamp();

        if remaining_ttl <= 0 {
            debug!(jti = %jti, "Session already expired, skipping blacklist");
            return Ok(());
        }

        let mut conn = self.pool.get().await.map_err(|e| {
            error!("Failed to get Redis connection: {e}");
            eyre::eyre!("Redis connection error")
        })?;

        let key = Self::blacklist_key(jti);

        redis::cmd("SETEX")
            .arg(&key)
            .arg(remaining_ttl as u64)
            .arg("revoked")
            .query_async::<bool>(&mut *conn)
            .await
            .map_err(|e| {
                error!(key = %key, "Failed to blacklist session: {e}");
                eyre::eyre!("Redis SETEX error")
            })?;

        debug!(key = %key, ttl = %remaining_ttl, "Session blacklisted");
        Ok(())
    }

    async fn is_blacklisted(&self, jti: &str) -> eyre::Result<bool> {
        let mut conn = self.pool.get().await.map_err(|e| {
            error!("Failed to get Redis connection: {e}");
            eyre::eyre!("Redis connection error")
        })?;

        let key = Self::blacklist_key(jti);

        let exists: bool = redis::cmd("EXISTS")
            .arg(&key)
            .query_async(&mut *conn)
            .await
            .map_err(|e| {
                error!(key = %key, "Failed to check blacklist: {e}");
                eyre::eyre!("Redis EXISTS error")
            })?;

        Ok(exists)
    }
}

/// User cache implementation for caching user profiles
#[derive(Clone)]
pub struct UserCache {
    cache: RedisCache,
    ttl_secs: u64,
}

impl UserCache {
    pub fn new(cache: RedisCache, ttl_secs: u64) -> Self {
        Self { cache, ttl_secs }
    }

    pub fn user_key(user_id: Uuid) -> String {
        format!("user:{user_id}")
    }

    pub async fn get_user(&self, user_id: Uuid) -> eyre::Result<Option<String>> {
        self.cache.get(&Self::user_key(user_id)).await
    }

    pub async fn set_user(&self, user_id: Uuid, user_json: &str) -> eyre::Result<()> {
        self.cache
            .set(&Self::user_key(user_id), user_json, self.ttl_secs)
            .await
    }

    pub async fn invalidate_user(&self, user_id: Uuid) -> eyre::Result<()> {
        self.cache.delete(&Self::user_key(user_id)).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blacklist_key_format() {
        let jti = "test-session-id";
        let key = RedisSessionBlacklist::blacklist_key(jti);
        assert_eq!(key, "blacklist:session:test-session-id");
    }

    #[test]
    fn test_user_key_format() {
        let user_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let key = UserCache::user_key(user_id);
        assert!(key.starts_with("user:"));
        assert!(key.contains("550e8400"));
    }
}
