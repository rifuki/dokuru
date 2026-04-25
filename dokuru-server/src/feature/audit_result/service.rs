use dokuru_core::audit::{CheckResult, build_audit_view_report};
use eyre::{Result, WrapErr};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::domain::{AuditSummary, parse_ran_at_or_now, usize_to_i32_or_zero};
use super::dto::{AuditReportResponse, AuditResultResponse, AuditSummaryResponse, SaveAuditDto};
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
        let ran_at = parse_ran_at_or_now(&dto.timestamp);
        let summary = AuditSummary::from_wire(
            dto.summary.total,
            dto.summary.passed,
            dto.summary.failed,
            dto.summary.score,
        );

        let record = AuditResultRecord {
            id: Uuid::new_v4(),
            agent_id,
            user_id,
            hostname: dto.hostname,
            docker_version: dto.docker_version,
            total_containers: usize_to_i32_or_zero(dto.total_containers),
            results: dto.results,
            total_rules: summary.total,
            passed: summary.passed,
            failed: summary.failed,
            score: summary.score,
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

    pub async fn get_by_id(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditResultResponse>> {
        let record = self
            .repo
            .find_by_id(pool, audit_id, agent_id, user_id)
            .await?;
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

    pub async fn get_report(
        &self,
        pool: &PgPool,
        audit_id: Uuid,
        agent_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AuditReportResponse>> {
        let record = self
            .repo
            .find_by_id(pool, audit_id, agent_id, user_id)
            .await?;

        record.map(Self::to_report_response).transpose()
    }

    fn to_response(record: AuditResultRecord) -> AuditResultResponse {
        let summary = AuditSummary::from_record(
            record.total_rules,
            record.passed,
            record.failed,
            record.score,
        );

        AuditResultResponse {
            id: record.id,
            agent_id: record.agent_id,
            timestamp: record.ran_at.to_rfc3339(),
            hostname: record.hostname,
            docker_version: record.docker_version,
            total_containers: record.total_containers,
            results: record.results,
            summary: AuditSummaryResponse {
                total: summary.total,
                passed: summary.passed,
                failed: summary.failed,
                score: summary.score,
            },
            ran_at: record.ran_at,
            created_at: record.created_at,
        }
    }

    fn to_report_response(record: AuditResultRecord) -> Result<AuditReportResponse> {
        let results = serde_json::from_value::<Vec<CheckResult>>(record.results)
            .wrap_err("Stored audit results are not compatible with the audit report model")?;
        let report = build_audit_view_report(results);

        Ok(AuditReportResponse {
            audit_id: record.id,
            agent_id: record.agent_id,
            timestamp: record.ran_at.to_rfc3339(),
            hostname: record.hostname,
            docker_version: record.docker_version,
            total_containers: record.total_containers,
            report,
        })
    }
}
