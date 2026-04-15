use std::process::Stdio;

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::api::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct TrivyImageScanRequest {
    pub image: String,
}

#[derive(Debug, Serialize)]
pub struct TrivyImageScanResponse {
    pub image: String,
    pub summary: TrivySeveritySummary,
    pub findings: Vec<TrivyFinding>,
}

#[derive(Debug, Default, Serialize)]
pub struct TrivySeveritySummary {
    pub critical: usize,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
    pub unknown: usize,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct TrivyFinding {
    pub target: String,
    pub vulnerability_id: String,
    pub package_name: String,
    pub installed_version: String,
    pub fixed_version: Option<String>,
    pub severity: String,
    pub title: Option<String>,
    pub primary_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TrivyJsonOutput {
    #[serde(rename = "Results")]
    results: Option<Vec<TrivyResult>>,
}

#[derive(Debug, Deserialize)]
struct TrivyResult {
    #[serde(rename = "Target")]
    target: Option<String>,
    #[serde(rename = "Vulnerabilities")]
    vulnerabilities: Option<Vec<TrivyVulnerability>>,
}

#[derive(Debug, Deserialize)]
struct TrivyVulnerability {
    #[serde(rename = "VulnerabilityID")]
    vulnerability_id: String,
    #[serde(rename = "PkgName")]
    package_name: Option<String>,
    #[serde(rename = "InstalledVersion")]
    installed_version: Option<String>,
    #[serde(rename = "FixedVersion")]
    fixed_version: Option<String>,
    #[serde(rename = "Severity")]
    severity: Option<String>,
    #[serde(rename = "Title")]
    title: Option<String>,
    #[serde(rename = "PrimaryURL")]
    primary_url: Option<String>,
}

pub async fn scan_image(
    State(_state): State<AppState>,
    Json(payload): Json<TrivyImageScanRequest>,
) -> ApiResult<TrivyImageScanResponse> {
    let image = payload.image.trim();
    if image.is_empty() {
        return Err(ApiError::default()
            .with_code(axum::http::StatusCode::BAD_REQUEST)
            .with_message("Image reference is required"));
    }

    let output = Command::new("trivy")
        .args([
            "image",
            "--quiet",
            "--format",
            "json",
            "--scanners",
            "vuln",
            image,
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()
        .await
        .map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => ApiError::default()
                .with_code(axum::http::StatusCode::SERVICE_UNAVAILABLE)
                .with_message("Trivy is not installed on this host")
                .with_details(
                    "Install Trivy and ensure it is available in PATH before using image scanning.",
                ),
            _ => ApiError::default()
                .with_code(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to start Trivy scan")
                .with_debug(&err.to_string()),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(ApiError::default()
            .with_code(axum::http::StatusCode::BAD_GATEWAY)
            .with_message("Trivy scan failed")
            .with_details(if stderr.is_empty() {
                "Trivy returned a non-zero exit status without stderr output.".to_string()
            } else {
                stderr
            }));
    }

    let report: TrivyJsonOutput = serde_json::from_slice(&output.stdout).map_err(|err| {
        ApiError::default()
            .with_code(axum::http::StatusCode::BAD_GATEWAY)
            .with_message("Failed to parse Trivy output")
            .with_debug(&err.to_string())
    })?;

    let mut summary = TrivySeveritySummary::default();
    let mut findings = Vec::new();

    for result in report.results.unwrap_or_default() {
        let target = result.target.unwrap_or_else(|| image.to_string());

        for vuln in result.vulnerabilities.unwrap_or_default() {
            let severity = vuln.severity.unwrap_or_else(|| "UNKNOWN".to_string());
            match severity.as_str() {
                "CRITICAL" => summary.critical += 1,
                "HIGH" => summary.high += 1,
                "MEDIUM" => summary.medium += 1,
                "LOW" => summary.low += 1,
                _ => summary.unknown += 1,
            }
            summary.total += 1;

            findings.push(TrivyFinding {
                target: target.clone(),
                vulnerability_id: vuln.vulnerability_id,
                package_name: vuln.package_name.unwrap_or_else(|| "unknown".to_string()),
                installed_version: vuln
                    .installed_version
                    .unwrap_or_else(|| "unknown".to_string()),
                fixed_version: vuln.fixed_version,
                severity,
                title: vuln.title,
                primary_url: vuln.primary_url,
            });
        }
    }

    findings.sort_by_key(|finding| severity_rank(&finding.severity));

    Ok(ApiSuccess::default()
        .with_message("Trivy scan completed")
        .with_data(TrivyImageScanResponse {
            image: image.to_string(),
            summary,
            findings,
        }))
}

fn severity_rank(severity: &str) -> u8 {
    match severity {
        "CRITICAL" => 0,
        "HIGH" => 1,
        "MEDIUM" => 2,
        "LOW" => 3,
        _ => 4,
    }
}
