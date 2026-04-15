use std::future::Future;
use std::time::Duration;

use sqlx::{PgPool, Postgres, Transaction};
use tracing::info;

use crate::infrastructure::config::Config;

/// Database connection pool wrapper with transaction helper
#[derive(Debug, Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    /// Create new database connection pool
    pub async fn new(config: &Config) -> Result<Self, sqlx::Error> {
        let database_url = &config.database.url;

        info!("Connecting to database...");
        let start = std::time::Instant::now();

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(config.database.max_connections)
            .min_connections(config.database.min_connections)
            .acquire_timeout(Duration::from_secs(30))
            .idle_timeout(Duration::from_secs(600))
            .connect(database_url)
            .await?;

        // Test connection
        sqlx::query("SELECT 1").fetch_one(&pool).await?;

        info!(
            elapsed = ?start.elapsed(),
            "Connected to database successfully"
        );

        Ok(Self { pool })
    }

    /// Get raw pool for auto-commit operations
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Begin a transaction for manual control
    pub async fn begin_transaction(&self) -> Result<Transaction<'_, Postgres>, sqlx::Error> {
        self.pool.begin().await
    }

    /// Execute operations within a transaction closure
    /// Auto-commit on success, rollback on error
    pub async fn transaction<F, Fut, T>(&self, f: F) -> Result<T, sqlx::Error>
    where
        F: FnOnce(&mut Transaction<'_, Postgres>) -> Fut,
        Fut: Future<Output = Result<T, sqlx::Error>>,
    {
        let mut tx = self.pool.begin().await?;

        match f(&mut tx).await {
            Ok(result) => {
                tx.commit().await?;
                Ok(result)
            }
            Err(e) => {
                let _ = tx.rollback().await;
                Err(e)
            }
        }
    }

    /// Create from existing pool — used by integration tests (sqlx::test provides the pool)
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }
}
