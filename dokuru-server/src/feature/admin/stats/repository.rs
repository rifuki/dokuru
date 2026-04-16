use async_trait::async_trait;
use sqlx::PgPool;

use crate::feature::admin::stats::dto::DashboardStatsResponse;

/// Stats repository errors
#[derive(Debug, thiserror::Error)]
pub enum StatsRepositoryError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// Stats repository trait
#[async_trait]
pub trait StatsRepository: Send + Sync {
    /// Get total users count
    async fn total_users(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;

    /// Get total admins count
    async fn total_admins(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;

    /// Get total API keys count
    async fn total_api_keys(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;

    /// Get active API keys count
    async fn active_api_keys(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;

    /// Get new users this month count
    async fn new_users_this_month(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;

    /// Get all dashboard stats at once
    async fn get_dashboard_stats(
        &self,
        pool: &PgPool,
    ) -> Result<DashboardStatsResponse, StatsRepositoryError> {
        // Fetch all stats concurrently
        let (total_users, total_admins, total_api_keys, active_api_keys, new_users_this_month) = tokio::join!(
            self.total_users(pool),
            self.total_admins(pool),
            self.total_api_keys(pool),
            self.active_api_keys(pool),
            self.new_users_this_month(pool),
        );

        Ok(DashboardStatsResponse {
            total_users: total_users?,
            total_admins: total_admins?,
            total_api_keys: total_api_keys?,
            active_api_keys: active_api_keys?,
            new_users_this_month: new_users_this_month?,
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct StatsRepositoryImpl;

impl StatsRepositoryImpl {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl StatsRepository for StatsRepositoryImpl {
    async fn total_users(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    async fn total_admins(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    async fn total_api_keys(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_keys")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    async fn active_api_keys(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM api_keys WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())"
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    async fn new_users_this_month(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE created_at >= DATE_TRUNC('month', NOW())",
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }
}
