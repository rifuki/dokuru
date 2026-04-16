use chrono::DateTime;
use eyre::Result;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::dto::{AuditResultResponse, AuditSummaryResponse, SaveAuditDto};
use super::entity::AuditResultRecord;
use super::repository::AuditResultRepository;

pub struct AuditResultService {
    repo: Arc<dyn AuditResultRepository>,
}

impl AuditResultService {
    pub fn new(repo: Arc<dyn AuditResultRepository>) -> Self {
        Self { repo }
    }

    pub async fn save(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
        dto: SaveAuditDto,
    ) -> Result<AuditResultResponse> {
        let ran_at = DateTime::parse_from_rfc3339(&dto.timestamp)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());

        let record = AuditResultRecord {
            id: Uuid::new_v4(),
            agent_id,
            user_id,
            hostname: dto.hostname,
            docker_version: dto.docker_version,
            total_containers: dto.total_containers as i32,
            results: dto.results,
            total_rules: dto.summary.total as i32,
            passed: dto.summary.passed as i32,
            failed: dto.summary.failed as i32,
            score: i32::from(dto.summary.score),
            ran_at,
            created_at: chrono::Utc::now(),
        };

        let saved = self.repo.save(pool, &record).await?;
        Ok(Self::to_response(saved))
    }

    pub async fn get_latest(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultResponse>> {
        let record = self.repo.find_latest(pool, agent_id, user_id).await?;
        Ok(record.map(Self::to_response))
    }

    pub async fn list(
        &self,
        pool: &PgPool,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<AuditResultResponse>> {
        let records = self.repo.find_all(pool, agent_id, user_id).await?;
        Ok(records.into_iter().map(Self::to_response).collect())
    }

    fn to_response(record: AuditResultRecord) -> AuditResultResponse {
        AuditResultResponse {
            id: record.id,
            agent_id: record.agent_id,
            timestamp: record.ran_at.to_rfc3339(),
            hostname: record.hostname,
            docker_version: record.docker_version,
            total_containers: record.total_containers,
            results: record.results,
            summary: AuditSummaryResponse {
                total: record.total_rules,
                passed: record.passed,
                failed: record.failed,
                score: record.score,
            },
            ran_at: record.ran_at,
            created_at: record.created_at,
        }
    }
}
