use std::time::Duration;

use bb8_redis::{RedisConnectionManager, bb8};
use tracing::info;

use crate::infrastructure::config::Config;

/// Type alias for Redis connection pool
pub type RedisPool = bb8::Pool<RedisConnectionManager>;

/// Create Redis connection pool with health check
pub async fn create_redis_pool(config: &Config) -> eyre::Result<RedisPool> {
    let redis_url = config
        .redis_url
        .as_ref()
        .ok_or_else(|| eyre::eyre!("REDIS_URL not configured"))?;

    info!("🔌 Connecting to Redis...");

    let manager = RedisConnectionManager::new(redis_url.clone())
        .map_err(|e| eyre::eyre!("Failed to create Redis connection manager: {e}"))?;

    let pool = bb8::Pool::builder()
        .max_size(15)
        .connection_timeout(Duration::from_secs(5))
        .build(manager)
        .await
        .map_err(|e| eyre::eyre!("Failed to create Redis pool: {e}"))?;

    // Health check
    let pool_clone = pool.clone();
    let mut conn = pool_clone
        .get()
        .await
        .map_err(|e| eyre::eyre!("Failed to get Redis connection: {e}"))?;

    let result: String = redis::cmd("PING")
        .query_async(&mut *conn)
        .await
        .map_err(|e| eyre::eyre!("Redis PING failed: {e}"))?;

    info!("✅ Redis connected: {result}");

    Ok(pool)
}
