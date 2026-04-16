use std::sync::Arc;

use sqlx::PgPool;

use crate::feature::admin::stats::{
    dto::DashboardStatsResponse,
    repository::{StatsRepository, StatsRepositoryError},
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
    ) -> Result<DashboardStatsResponse, StatsRepositoryError> {
        self.repository.get_dashboard_stats(pool).await
    }
}
