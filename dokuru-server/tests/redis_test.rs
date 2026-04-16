//! Redis integration tests
//!
//! These tests require Redis to be running.
//! Set REDIS_URL environment variable to run these tests.
//! Example: REDIS_URL=redis://localhost:6379 cargo test --test redis_test

use std::env;

use dokuru_server::infrastructure::persistence::{
    redis::create_redis_pool,
    redis_trait::{Cache, RedisCache, RedisSessionBlacklist, SessionBlacklist},
};

/// Helper to check if Redis is available
fn redis_available() -> bool {
    env::var("REDIS_URL").is_ok()
}

#[tokio::test]
async fn test_redis_connection() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set");
        return;
    }

    let config =
        dokuru_server::infrastructure::config::Config::load().expect("Failed to load config");
    let pool = create_redis_pool(&config).await;

    assert!(pool.is_ok(), "Should connect to Redis");
}

#[tokio::test]
async fn test_cache_operations() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set");
        return;
    }

    let config =
        dokuru_server::infrastructure::config::Config::load().expect("Failed to load config");
    let pool = create_redis_pool(&config)
        .await
        .expect("Failed to connect to Redis");
    let cache = RedisCache::new(pool);

    // Test SET
    cache
        .set("test:key", "test_value", 60)
        .await
        .expect("Failed to set value");

    // Test GET
    let value = cache.get("test:key").await.expect("Failed to get value");
    assert_eq!(value, Some("test_value".to_string()));

    // Test EXISTS
    let exists = cache
        .exists("test:key")
        .await
        .expect("Failed to check existence");
    assert!(exists);

    // Test DELETE
    cache
        .delete("test:key")
        .await
        .expect("Failed to delete key");
    let value = cache
        .get("test:key")
        .await
        .expect("Failed to get value after delete");
    assert_eq!(value, None);
}

#[tokio::test]
async fn test_session_blacklist() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set");
        return;
    }

    let config =
        dokuru_server::infrastructure::config::Config::load().expect("Failed to load config");
    let pool = create_redis_pool(&config)
        .await
        .expect("Failed to connect to Redis");
    let blacklist = RedisSessionBlacklist::new(pool);

    let session_id = "test-session-123";
    let exp = chrono::Utc::now().timestamp() + 3600; // 1 hour from now

    // Initially not blacklisted
    let is_blacklisted = blacklist
        .is_blacklisted(session_id)
        .await
        .expect("Failed to check blacklist");
    assert!(
        !is_blacklisted,
        "Session should not be blacklisted initially"
    );

    // Blacklist the session
    blacklist
        .blacklist_session(session_id, exp)
        .await
        .expect("Failed to blacklist session");

    // Now should be blacklisted
    let is_blacklisted = blacklist
        .is_blacklisted(session_id)
        .await
        .expect("Failed to check blacklist");
    assert!(is_blacklisted, "Session should be blacklisted");
}

#[tokio::test]
async fn test_session_blacklist_expired() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set");
        return;
    }

    let config =
        dokuru_server::infrastructure::config::Config::load().expect("Failed to load config");
    let pool = create_redis_pool(&config)
        .await
        .expect("Failed to connect to Redis");
    let blacklist = RedisSessionBlacklist::new(pool);

    let session_id = "test-session-expired";
    let exp = chrono::Utc::now().timestamp() - 10; // Already expired

    // Try to blacklist expired session
    blacklist
        .blacklist_session(session_id, exp)
        .await
        .expect("Failed to process expired session");

    // Should not be stored (already expired)
    let is_blacklisted = blacklist
        .is_blacklisted(session_id)
        .await
        .expect("Failed to check blacklist");
    assert!(!is_blacklisted, "Expired session should not be blacklisted");
}
