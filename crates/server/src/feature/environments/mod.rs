use axum::{
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

// ─── Model ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvironmentType {
    DockerStandalone,
    DockerSwarm,
    Podman,
    Other,
}

impl Default for EnvironmentType {
    fn default() -> Self {
        Self::DockerStandalone
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub name: String,
    /// The base URL of the remote dokuru agent, e.g. "http://1.2.3.4:3939"
    pub url: String,
    #[serde(rename = "type")]
    pub env_type: EnvironmentType,
    pub added_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AddEnvironmentRequest {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub env_type: EnvironmentType,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

pub async fn list_environments(State(state): State<AppState>) -> ApiResult<Vec<Environment>> {
    let envs = state.environments.read().await;
    Ok(ApiSuccess::default().with_data(envs.clone()))
}

pub async fn add_environment(
    State(state): State<AppState>,
    axum::Json(body): axum::Json<AddEnvironmentRequest>,
) -> ApiResult<Environment> {
    // Validate URL
    let url = body.url.trim_end_matches('/').to_string();
    if url.is_empty() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("URL cannot be empty".to_string()));
    }

    // Test connectivity to remote agent
    let test_url = format!("{}/health", url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    client.get(&test_url).send().await.map_err(|e| {
        ApiError::default()
            .with_code(StatusCode::BAD_GATEWAY)
            .with_message(format!("Cannot reach remote agent at {}: {}", url, e))
    })?;

    let env = Environment {
        id: Uuid::new_v4().to_string(),
        name: body.name.trim().to_string(),
        url,
        env_type: body.env_type,
        added_at: Utc::now().to_rfc3339(),
    };

    let mut envs = state.environments.write().await;
    envs.push(env.clone());

    // Persist to disk
    persist_environments(&envs).await;

    Ok(ApiSuccess::default().with_data(env))
}

pub async fn remove_environment(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<()> {
    let mut envs = state.environments.write().await;
    let before = envs.len();
    envs.retain(|e| e.id != id);

    if envs.len() == before {
        return Err(ApiError::default()
            .with_code(StatusCode::NOT_FOUND)
            .with_message(format!("Environment '{}' not found", id)));
    }

    persist_environments(&envs).await;
    Ok(ApiSuccess::default())
}

// ─── Persistence ──────────────────────────────────────────────────────────────

pub fn environments_file_path() -> std::path::PathBuf {
    // Prefer /etc/dokuru/, fallback to current dir
    let prod = std::path::Path::new("/etc/dokuru/environments.json");
    if prod.parent().map(|p| p.exists()).unwrap_or(false) {
        return prod.to_path_buf();
    }
    std::path::PathBuf::from("environments.json")
}

pub async fn load_environments() -> Vec<Environment> {
    let path = environments_file_path();
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn persist_environments(envs: &[Environment]) {
    let path = environments_file_path();
    if let Ok(json) = serde_json::to_string_pretty(envs)
        && tokio::fs::write(&path, json).await.is_ok()
    {
        // Set file permission to 664 (group writable)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                let mut perms = metadata.permissions();
                perms.set_mode(0o664);
                let _ = tokio::fs::set_permissions(&path, perms).await;
            }

            // Set group ownership to dokuru
            let _ = tokio::process::Command::new("chgrp")
                .args(["dokuru", &path.display().to_string()])
                .output()
                .await;
        }
    }
}
