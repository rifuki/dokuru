use async_trait::async_trait;
use sqlx::PgPool;

use crate::feature::admin::stats::dto::{
    AgentsByMode, AuditActivity, ComponentHealth, HealthStatus, RecentUser,
};

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

    // NEW: Agent stats
    async fn total_agents(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;
    async fn active_agents(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;
    async fn agents_by_mode(&self, pool: &PgPool) -> Result<AgentsByMode, StatsRepositoryError>;

    // NEW: Audit stats
    async fn total_audits(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;
    async fn audits_this_month(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError>;
    async fn average_score(&self, pool: &PgPool) -> Result<f64, StatsRepositoryError>;
    async fn audit_activity_last_7_days(
        &self,
        pool: &PgPool,
    ) -> Result<Vec<AuditActivity>, StatsRepositoryError>;

    // NEW: Recent users
    async fn recent_registrations(
        &self,
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<RecentUser>, StatsRepositoryError>;

    // NEW: System health
    async fn check_database_health(
        &self,
        pool: &PgPool,
    ) -> Result<ComponentHealth, StatsRepositoryError>;
}

#[derive(Debug, Clone, Default)]
pub struct StatsRepositoryImpl;

impl StatsRepositoryImpl {
    #[must_use]
    pub const fn new() -> Self {
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

    // Agent stats
    async fn total_agents(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agents")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    async fn active_agents(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM agents WHERE last_seen > NOW() - INTERVAL '5 minutes'",
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    async fn agents_by_mode(&self, pool: &PgPool) -> Result<AgentsByMode, StatsRepositoryError> {
        let rows =
            sqlx::query!("SELECT access_mode, COUNT(*) as count FROM agents GROUP BY access_mode")
                .fetch_all(pool)
                .await?;

        let mut modes = AgentsByMode {
            direct: 0,
            cloudflare: 0,
            domain: 0,
            relay: 0,
        };

        for row in rows {
            match row.access_mode.as_str() {
                "direct" => modes.direct = row.count.unwrap_or(0),
                "cloudflare" => modes.cloudflare = row.count.unwrap_or(0),
                "domain" => modes.domain = row.count.unwrap_or(0),
                "relay" => modes.relay = row.count.unwrap_or(0),
                _ => {}
            }
        }

        Ok(modes)
    }

    // Audit stats
    async fn total_audits(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_results")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    async fn audits_this_month(&self, pool: &PgPool) -> Result<i64, StatsRepositoryError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM audit_results WHERE ran_at >= DATE_TRUNC('month', NOW())",
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    async fn average_score(&self, pool: &PgPool) -> Result<f64, StatsRepositoryError> {
        let avg: Option<f64> = sqlx::query_scalar("SELECT AVG(score)::FLOAT8 FROM audit_results")
            .fetch_one(pool)
            .await?;
        Ok(avg.unwrap_or(0.0))
    }

    async fn audit_activity_last_7_days(
        &self,
        pool: &PgPool,
    ) -> Result<Vec<AuditActivity>, StatsRepositoryError> {
        let rows = sqlx::query!(
            "SELECT DATE(ran_at) as date, COUNT(*) as count
             FROM audit_results
             WHERE ran_at >= NOW() - INTERVAL '7 days'
             GROUP BY DATE(ran_at)
             ORDER BY date ASC"
        )
        .fetch_all(pool)
        .await?;

        let activities = rows
            .into_iter()
            .map(|row| AuditActivity {
                date: row.date.unwrap().to_string(),
                count: row.count.unwrap_or(0),
            })
            .collect();

        Ok(activities)
    }

    // Recent users
    async fn recent_registrations(
        &self,
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<RecentUser>, StatsRepositoryError> {
        let users = sqlx::query_as!(
            RecentUser,
            "SELECT id, username, email, email_verified, role, created_at
             FROM users
             ORDER BY created_at DESC
             LIMIT $1",
            limit
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    // System health
    async fn check_database_health(
        &self,
        pool: &PgPool,
    ) -> Result<ComponentHealth, StatsRepositoryError> {
        let start = std::time::Instant::now();

        let result = sqlx::query("SELECT 1").fetch_one(pool).await;

        let response_time_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);

        let status = if result.is_ok() {
            if response_time_ms < 100 {
                HealthStatus::Healthy
            } else {
                HealthStatus::Degraded
            }
        } else {
            HealthStatus::Down
        };

        Ok(ComponentHealth {
            status,
            response_time_ms,
        })
    }
}
