use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;
use crate::audit::{
    AuditReport, AuditSummary, CheckResult, CheckStatus, RuleDefinition, RuleRegistry,
};
use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use bollard::{Docker, models::ContainerSummary};
use chrono::Utc;
use futures::sink::SinkExt;
use serde::Serialize;

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
