use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;
use crate::audit::{
    AuditReport, AuditSummary, CheckResult, CheckStatus, RuleDefinition, RuleRegistry,
};
use axum::{
    extract::{
        Json, Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::IntoResponse,
};
use bollard::{Docker, models::ContainerSummary};
use chrono::Utc;
use futures::sink::SinkExt;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io::ErrorKind, path::PathBuf};
use uuid::Uuid;

pub async fn run_full_audit(State(state): State<AppState>) -> ApiResult<AuditReport> {
    let registry = RuleRegistry::new();
    match registry.run_audit(&state.docker).await {
        Ok(report) => Ok(ApiSuccess::default().with_data(report)),
        Err(e) => Err(ApiError::default().with_message(e.to_string())),
    }
}

pub async fn run_single_audit(
    Path(rule_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<CheckResult> {
    let registry = RuleRegistry::new();
    match registry.check_rule(&rule_id, &state.docker).await {
        Ok(result) => Ok(ApiSuccess::default().with_data(result)),
        Err(e) => Err(ApiError::default()
            .with_code(axum::http::StatusCode::NOT_FOUND)
            .with_message(e.to_string())),
    }
}

pub async fn save_audit(Json(report): Json<AuditReport>) -> ApiResult<StoredAuditReport> {
    let stored = StoredAuditReport {
        id: Uuid::new_v4().to_string(),
        report,
    };
    write_stored_audit(&stored).await?;
    Ok(ApiSuccess::default().with_data(stored))
}

pub async fn list_saved_audits() -> ApiResult<Vec<StoredAuditReport>> {
    let mut audits = read_stored_audits().await?;
    audits.sort_by(|left, right| right.report.timestamp.cmp(&left.report.timestamp));
    Ok(ApiSuccess::default().with_data(audits))
}

pub async fn get_saved_audit(Path(audit_id): Path<String>) -> ApiResult<StoredAuditReport> {
    let audit = read_stored_audit(&audit_id).await?;
    Ok(ApiSuccess::default().with_data(audit))
}

pub async fn delete_saved_audit(Path(audit_id): Path<String>) -> ApiResult<()> {
    let path = audit_path(&audit_id)?;
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(ApiSuccess::<()>::default().with_message("Audit deleted")),
        Err(error) if error.kind() == ErrorKind::NotFound => Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message("Audit not found")),
        Err(error) => {
            Err(ApiError::default().with_message(format!("Failed to delete audit: {error}")))
        }
    }
}

pub async fn get_saved_audit_report(
    Path(audit_id): Path<String>,
) -> ApiResult<AuditReportResponse> {
    let audit = read_stored_audit(&audit_id).await?;
    Ok(ApiSuccess::default().with_data(AuditReportResponse::from(audit)))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAuditReport {
    pub id: String,
    #[serde(flatten)]
    pub report: AuditReport,
}

#[derive(Debug, Serialize)]
pub struct AuditReportResponse {
    audit_id: String,
    agent_id: &'static str,
    timestamp: String,
    hostname: String,
    docker_version: String,
    total_containers: usize,
    report: AuditViewReport,
}

#[derive(Debug, Serialize)]
struct AuditViewReport {
    summary: AuditReportSummary,
    score_band: &'static str,
    sections: Vec<AuditGroupSummary>,
    pillars: Vec<AuditGroupSummary>,
    severity_failures: AuditSeverityFailureSummary,
    remediation: AuditRemediationPlan,
    sorted_results: Vec<CheckResult>,
}

#[derive(Debug, Serialize)]
struct AuditReportSummary {
    total: usize,
    passed: usize,
    failed: usize,
    errors: usize,
    score: u8,
}

#[derive(Debug, Serialize)]
struct AuditGroupSummary {
    key: String,
    label: String,
    number: Option<String>,
    total: usize,
    passed: usize,
    failed: usize,
    errors: usize,
    percent: usize,
}

#[derive(Debug, Default, Serialize)]
struct AuditSeverityFailureSummary {
    high: usize,
    medium: usize,
    low: usize,
    unknown: usize,
    total: usize,
}

#[derive(Debug, Serialize)]
struct AuditRemediationPlan {
    total_failed: usize,
    auto_fixable: usize,
    guided: usize,
    manual: usize,
    high_impact: usize,
    medium_impact: usize,
    low_impact: usize,
    quick_wins: usize,
    actions: Vec<serde_json::Value>,
}

#[derive(Default)]
struct GroupCounter {
    total: usize,
    passed: usize,
    failed: usize,
    errors: usize,
}

impl From<StoredAuditReport> for AuditReportResponse {
    fn from(stored: StoredAuditReport) -> Self {
        let errors = stored
            .report
            .results
            .iter()
            .filter(|result| result.status == CheckStatus::Error)
            .count();
        let mut sorted_results = stored.report.results.clone();
        sorted_results.sort_by(|left, right| left.rule.id.cmp(&right.rule.id));

        Self {
            audit_id: stored.id,
            agent_id: "local",
            timestamp: stored.report.timestamp,
            hostname: stored.report.hostname,
            docker_version: stored.report.docker_version,
            total_containers: stored.report.total_containers,
            report: AuditViewReport {
                summary: AuditReportSummary {
                    total: stored.report.summary.total,
                    passed: stored.report.summary.passed,
                    failed: stored.report.summary.failed,
                    errors,
                    score: stored.report.summary.score,
                },
                score_band: score_band(stored.report.summary.score),
                sections: group_summaries(&stored.report.results),
                pillars: group_summaries(&stored.report.results),
                severity_failures: severity_failures(&stored.report.results),
                remediation: remediation_plan(&stored.report.results),
                sorted_results,
            },
        }
    }
}

fn audit_store_dir() -> PathBuf {
    std::env::var("DOKURU_DATA_DIR").map_or_else(
        |_| {
            if cfg!(debug_assertions) {
                std::env::current_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(".dokuru")
                    .join("audits")
            } else {
                PathBuf::from("/var/lib/dokuru/audits")
            }
        },
        |value| PathBuf::from(value).join("audits"),
    )
}

fn audit_path(audit_id: &str) -> Result<PathBuf, ApiError> {
    if audit_id.is_empty()
        || !audit_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err(ApiError::default()
            .with_code(axum::http::StatusCode::BAD_REQUEST)
            .with_message("Invalid audit id"));
    }

    Ok(audit_store_dir().join(format!("{audit_id}.json")))
}

async fn write_stored_audit(audit: &StoredAuditReport) -> Result<(), ApiError> {
    let dir = audit_store_dir();
    tokio::fs::create_dir_all(&dir).await.map_err(|error| {
        ApiError::default()
            .with_message(format!("Failed to create audit history directory: {error}"))
    })?;
    let path = dir.join(format!("{}.json", audit.id));
    let json = serde_json::to_vec_pretty(audit)
        .map_err(|error| ApiError::default().with_message(error.to_string()))?;
    tokio::fs::write(path, json)
        .await
        .map_err(|error| ApiError::default().with_message(format!("Failed to save audit: {error}")))
}

async fn read_stored_audit(audit_id: &str) -> Result<StoredAuditReport, ApiError> {
    let path = audit_path(audit_id)?;
    let json = tokio::fs::read(path).await.map_err(|error| {
        ApiError::default()
            .with_code(axum::http::StatusCode::NOT_FOUND)
            .with_message(format!("Audit not found: {error}"))
    })?;
    serde_json::from_slice(&json)
        .map_err(|error| ApiError::default().with_message(format!("Invalid audit file: {error}")))
}

async fn read_stored_audits() -> Result<Vec<StoredAuditReport>, ApiError> {
    let dir = audit_store_dir();
    let mut entries = match tokio::fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(ApiError::default()
                .with_message(format!("Failed to read audit history directory: {error}")));
        }
    };

    let mut audits = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        ApiError::default().with_message(format!("Failed to read audit history directory: {error}"))
    })? {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let json = tokio::fs::read(&path).await.map_err(|error| {
            ApiError::default().with_message(format!("Failed to read audit history: {error}"))
        })?;
        if let Ok(audit) = serde_json::from_slice::<StoredAuditReport>(&json) {
            audits.push(audit);
        }
    }

    Ok(audits)
}

fn group_summaries(results: &[CheckResult]) -> Vec<AuditGroupSummary> {
    let mut groups = BTreeMap::<String, GroupCounter>::new();
    for result in results {
        let group = groups.entry(result.rule.section.clone()).or_default();
        group.total += 1;
        match result.status {
            CheckStatus::Pass => group.passed += 1,
            CheckStatus::Fail => group.failed += 1,
            CheckStatus::Error => group.errors += 1,
        }
    }

    groups
        .into_iter()
        .map(|(label, counter)| AuditGroupSummary {
            key: label.to_lowercase().replace(' ', "-"),
            label,
            number: None,
            total: counter.total,
            passed: counter.passed,
            failed: counter.failed,
            errors: counter.errors,
            percent: counter.passed * 100 / counter.total.max(1),
        })
        .collect()
}

fn severity_failures(results: &[CheckResult]) -> AuditSeverityFailureSummary {
    let mut summary = AuditSeverityFailureSummary::default();
    for result in results
        .iter()
        .filter(|result| result.status == CheckStatus::Fail)
    {
        match result.rule.severity {
            crate::audit::Severity::High => summary.high += 1,
            crate::audit::Severity::Medium => summary.medium += 1,
            crate::audit::Severity::Low => summary.low += 1,
        }
    }
    summary.total = summary.high + summary.medium + summary.low + summary.unknown;
    summary
}

fn remediation_plan(results: &[CheckResult]) -> AuditRemediationPlan {
    let failed: Vec<&CheckResult> = results
        .iter()
        .filter(|result| result.status == CheckStatus::Fail)
        .collect();
    let auto_fixable = failed
        .iter()
        .filter(|result| result.remediation_kind == crate::audit::RemediationKind::Auto)
        .count();
    let guided = failed
        .iter()
        .filter(|result| result.remediation_kind == crate::audit::RemediationKind::Guided)
        .count();
    let high_impact = failed
        .iter()
        .filter(|result| result.rule.severity == crate::audit::Severity::High)
        .count();
    let medium_impact = failed
        .iter()
        .filter(|result| result.rule.severity == crate::audit::Severity::Medium)
        .count();

    AuditRemediationPlan {
        total_failed: failed.len(),
        auto_fixable,
        guided,
        manual: failed.len().saturating_sub(auto_fixable + guided),
        high_impact,
        medium_impact,
        low_impact: failed.len().saturating_sub(high_impact + medium_impact),
        quick_wins: auto_fixable,
        actions: Vec::new(),
    }
}

const fn score_band(score: u8) -> &'static str {
    if score >= 80 {
        "healthy"
    } else if score >= 60 {
        "warning"
    } else {
        "critical"
    }
}

pub async fn ws_audit_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AuditStreamMessage {
    Started {
        total: usize,
    },
    Progress {
        index: usize,
        total: usize,
        data: Box<CheckResult>,
    },
    Complete {
        data: Box<AuditReport>,
    },
    Error {
        message: String,
    },
}

struct AuditStreamPreflight {
    hostname: String,
    docker_version: String,
    containers: Vec<ContainerSummary>,
}

struct AuditStreamResults {
    results: Vec<CheckResult>,
    passed: usize,
    failed: usize,
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let registry = RuleRegistry::new();
    let mut rules = registry.all();
    rules.sort_by(|left, right| left.id.cmp(&right.id));
    let Some(preflight) = audit_stream_preflight(&mut socket, &state.docker).await else {
        let _ = socket.close().await;
        return;
    };

    let Some(stream_results) =
        stream_audit_rules(&mut socket, &state.docker, &preflight.containers, &rules).await
    else {
        let _ = socket.close().await;
        return;
    };

    let scored_total = stream_results.passed + stream_results.failed;
    send_audit_stream_message(
        &mut socket,
        &AuditStreamMessage::Complete {
            data: Box::new(AuditReport {
                timestamp: Utc::now().to_rfc3339(),
                hostname: preflight.hostname,
                docker_version: preflight.docker_version,
                total_containers: preflight.containers.len(),
                results: stream_results.results,
                summary: AuditSummary {
                    total: scored_total,
                    passed: stream_results.passed,
                    failed: stream_results.failed,
                    score: audit_score(stream_results.passed, scored_total),
                },
            }),
        },
    )
    .await;

    let _ = socket.close().await;
}

async fn audit_stream_preflight(
    socket: &mut WebSocket,
    docker: &Docker,
) -> Option<AuditStreamPreflight> {
    let info = match docker.info().await {
        Ok(info) => info,
        Err(error) => {
            send_audit_error(socket, format!("Failed to inspect Docker daemon: {error}")).await;
            return None;
        }
    };
    let version = match docker.version().await {
        Ok(version) => version,
        Err(error) => {
            send_audit_error(socket, format!("Failed to read Docker version: {error}")).await;
            return None;
        }
    };
    let containers = match docker.list_containers::<String>(None).await {
        Ok(containers) => containers,
        Err(error) => {
            send_audit_error(socket, format!("Failed to list containers: {error}")).await;
            return None;
        }
    };

    Some(AuditStreamPreflight {
        hostname: info.name.unwrap_or_else(|| "unknown".to_string()),
        docker_version: version.version.unwrap_or_else(|| "unknown".to_string()),
        containers,
    })
}

async fn stream_audit_rules(
    socket: &mut WebSocket,
    docker: &Docker,
    containers: &[ContainerSummary],
    rules: &[&RuleDefinition],
) -> Option<AuditStreamResults> {
    let total = rules.len();
    let mut results = Vec::with_capacity(total);
    let mut passed = 0usize;
    let mut failed = 0usize;

    send_audit_stream_message(socket, &AuditStreamMessage::Started { total }).await;

    for (offset, rule) in rules.iter().enumerate() {
        let result = match rule.check(docker, containers).await {
            Ok(result) => result,
            Err(error) => {
                send_audit_error(socket, format!("Rule {} failed to run: {error}", rule.id)).await;
                return None;
            }
        };

        if rule.scored {
            match result.status {
                CheckStatus::Pass => passed += 1,
                CheckStatus::Fail => failed += 1,
                CheckStatus::Error => {}
            }
        }

        results.push(result.clone());
        send_audit_stream_message(
            socket,
            &AuditStreamMessage::Progress {
                index: offset + 1,
                total,
                data: Box::new(result),
            },
        )
        .await;

        if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
            return None;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }

    Some(AuditStreamResults {
        results,
        passed,
        failed,
    })
}

fn audit_score(passed: usize, total: usize) -> u8 {
    let percent = (passed * 100).checked_div(total).unwrap_or(0);
    u8::try_from(percent).unwrap_or(100)
}

async fn send_audit_error(socket: &mut WebSocket, message: String) {
    send_audit_stream_message(socket, &AuditStreamMessage::Error { message }).await;
}

async fn send_audit_stream_message(socket: &mut WebSocket, message: &AuditStreamMessage) {
    if let Ok(text) = serde_json::to_string(message) {
        let _ = socket.send(Message::Text(text.into())).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_path_validation_valid_ids() {
        // Valid UUIDs
        assert!(audit_path("550e8400-e29b-41d4-a716-446655440000").is_ok());

        // Valid alphanumeric
        assert!(audit_path("abc123").is_ok());
        assert!(audit_path("AUDIT123").is_ok());

        // Valid with hyphens
        assert!(audit_path("audit-123-xyz").is_ok());
        assert!(audit_path("a-b-c-d").is_ok());
    }

    #[test]
    fn test_audit_path_validation_invalid_ids() {
        // Empty
        assert!(audit_path("").is_err());

        // Special characters
        assert!(audit_path("audit/123").is_err());
        assert!(audit_path("audit\\123").is_err());
        assert!(audit_path("audit;drop").is_err());
        assert!(audit_path("audit*123").is_err());
        assert!(audit_path("audit@host").is_err());
        assert!(audit_path("audit..etc").is_err());

        // Spaces
        assert!(audit_path("audit 123").is_err());

        // Uppercase should be OK
        assert!(audit_path("AUDIT").is_ok());
    }

    #[test]
    fn test_audit_path_construction() {
        // Verify path construction is correct and safe
        let result = audit_path("test-audit-123").unwrap();
        let path_str = result.to_string_lossy();

        // Should end with .json
        assert!(path_str.ends_with("test-audit-123.json"));

        // Should not contain traversal sequences
        assert!(!path_str.contains(".."));
        assert!(!path_str.contains("./"));

        // Should be in dokuru audit directory
        assert!(path_str.contains("dokuru") || path_str.contains("audits"));
    }
}
