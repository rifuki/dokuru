use std::sync::Arc;

use bb8_redis::bb8;
use sqlx::PgPool;

use crate::feature::{
    admin::stats::{
        dto::{ComponentHealth, DashboardStatsResponse, HealthStatus, SystemHealth},
        repository::{StatsRepository, StatsRepositoryError},
    },
    agent::relay::AgentRegistry,
};

/// Stats service
pub struct StatsService {
    repository: Arc<dyn StatsRepository>,
}

impl StatsService {
    pub fn new(repository: Arc<dyn StatsRepository>) -> Self {
        Self { repository }
    }

    /// Get dashboard statistics
    pub async fn get_dashboard_stats(
        &self,
        pool: &PgPool,
        agent_registry: &AgentRegistry,
        redis_pool: Option<&bb8::Pool<bb8_redis::RedisConnectionManager>>,
        server_start_time: std::time::Instant,
    ) -> Result<DashboardStatsResponse, StatsRepositoryError> {
        // Fetch all stats concurrently
        let (
            total_users,
            total_admins,
            total_api_keys,
            active_api_keys,
            new_users_this_month,
            total_agents,
            active_agents,
            agents_by_mode,
            total_audits,
            audits_this_month,
            average_score,
            audit_activity,
            recent_registrations,
            db_health,
        ) = tokio::join!(
            self.repository.total_users(pool),
            self.repository.total_admins(pool),
            self.repository.total_api_keys(pool),
            self.repository.active_api_keys(pool),
            self.repository.new_users_this_month(pool),
            self.repository.total_agents(pool),
            self.repository.active_agents(pool),
            self.repository.agents_by_mode(pool),
            self.repository.total_audits(pool),
            self.repository.audits_this_month(pool),
            self.repository.average_score(pool),
            self.repository.audit_activity_last_7_days(pool),
            self.repository.recent_registrations(pool, 5),
            self.repository.check_database_health(pool),
        );

        // Get relay agents count from in-memory registry
        #[allow(clippy::cast_possible_wrap)]
        let relay_agents_count = agent_registry.len() as i64;

        // Check Redis health if available
        let redis_health = if let Some(redis) = redis_pool {
            Some(self.check_redis_health(redis).await?)
        } else {
            None
        };

        // Get server uptime
        let server_uptime_seconds = server_start_time.elapsed().as_secs();

        // Get active WebSocket connections
        let active_websockets = agent_registry.len();

        Ok(DashboardStatsResponse {
            total_users: total_users?,
            total_admins: total_admins?,
            new_users_this_month: new_users_this_month?,
            total_agents: total_agents?,
            active_agents: active_agents?,
            agents_by_mode: agents_by_mode?,
            relay_agents_count,
            total_audits: total_audits?,
            audits_this_month: audits_this_month?,
            average_score: average_score?,
            audit_activity: audit_activity?,
            total_api_keys: total_api_keys?,
            active_api_keys: active_api_keys?,
            recent_registrations: recent_registrations?,
            system_health: SystemHealth {
                database: db_health?,
                redis: redis_health,
                server_uptime_seconds,
                active_websockets,
            },
        })
    }

    async fn check_redis_health(
        &self,
        pool: &bb8::Pool<bb8_redis::RedisConnectionManager>,
    ) -> Result<ComponentHealth, StatsRepositoryError> {
        use redis::AsyncCommands;

        let start = std::time::Instant::now();

        let result = async {
            let mut conn = pool
                .get()
                .await
                .map_err(|e| sqlx::Error::Io(std::io::Error::other(e.to_string())))?;
            conn.ping::<String>()
                .await
                .map_err(|e| sqlx::Error::Io(std::io::Error::other(e)))
        }
        .await;

        #[allow(clippy::cast_possible_truncation)]
        let response_time_ms = start.elapsed().as_millis() as u64;

        let status = if result.is_ok() {
            if response_time_ms < 50 {
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
