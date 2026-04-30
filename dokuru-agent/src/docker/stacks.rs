use axum::{
    Router,
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
};
use bollard::container::ListContainersOptions;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::warn;

use super::get_docker_client;

/// Compose filenames Docker Compose accepts, in priority order.
/// Mirrors Dockge's `acceptedComposeFileNames`.
const COMPOSE_FILENAMES: &[&str] = &[
    "compose.yaml",
    "docker-compose.yaml",
    "docker-compose.yml",
    "compose.yml",
];

#[derive(Serialize)]
pub struct StackContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub service: String,
}

#[derive(Serialize)]
pub struct StackResponse {
    pub name: String,
    pub working_dir: Option<String>,
    pub config_file: Option<String>,
    pub containers: Vec<StackContainer>,
    pub running: usize,
    pub total: usize,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/stacks", get(list_stacks))
        .route("/docker/stacks/{name}", get(get_stack))
        .route(
            "/docker/stacks/{name}/compose",
            get(get_compose_file).put(update_compose_file),
        )
}

async fn list_stacks() -> Result<Json<Vec<StackResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut stacks: HashMap<String, StackResponse> = HashMap::new();

    for c in &containers {
        let Some(labels) = c.labels.as_ref() else {
            continue;
        };
        let Some(project) = labels.get("com.docker.compose.project").cloned() else {
            continue;
        };

        let state = c.state.as_deref().unwrap_or("").to_string();
        let is_running = state == "running";

        let sc = StackContainer {
            id: c.id.as_deref().unwrap_or("").to_string(),
            name: c
                .names
                .as_deref()
                .and_then(|n| n.first())
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default(),
            image: c.image.as_deref().unwrap_or("").to_string(),
            state: state.clone(),
            status: c.status.as_deref().unwrap_or("").to_string(),
            service: labels
                .get("com.docker.compose.service")
                .cloned()
                .unwrap_or_default(),
        };

        let entry = stacks
            .entry(project.clone())
            .or_insert_with(|| StackResponse {
                name: project.clone(),
                working_dir: labels
                    .get("com.docker.compose.project.working_dir")
                    .cloned(),
                config_file: labels
                    .get("com.docker.compose.project.config_files")
                    .cloned(),
                containers: Vec::new(),
                running: 0,
                total: 0,
            });

        if is_running {
            entry.running += 1;
        }
        entry.total += 1;
        entry.containers.push(sc);
    }

    let mut result: Vec<StackResponse> = stacks.into_values().collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(result))
}

async fn get_stack(Path(name): Path<String>) -> Result<Json<StackResponse>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut stack: Option<StackResponse> = None;

    for c in &containers {
        let Some(labels) = c.labels.as_ref() else {
            continue;
        };
        let Some(project) = labels.get("com.docker.compose.project") else {
            continue;
        };
        if *project != name {
            continue;
        }

        let state = c.state.as_deref().unwrap_or("").to_string();
        let is_running = state == "running";

        let sc = StackContainer {
            id: c.id.as_deref().unwrap_or("").to_string(),
            name: c
                .names
                .as_deref()
                .and_then(|n| n.first())
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default(),
            image: c.image.as_deref().unwrap_or("").to_string(),
            state: state.clone(),
            status: c.status.as_deref().unwrap_or("").to_string(),
            service: labels
                .get("com.docker.compose.service")
                .cloned()
                .unwrap_or_default(),
        };

        let entry = stack.get_or_insert_with(|| StackResponse {
            name: name.clone(),
            working_dir: labels
                .get("com.docker.compose.project.working_dir")
                .cloned(),
            config_file: labels
                .get("com.docker.compose.project.config_files")
                .cloned(),
            containers: Vec::new(),
            running: 0,
            total: 0,
        });

        if is_running {
            entry.running += 1;
        }
        entry.total += 1;
        entry.containers.push(sc);
    }

    stack.map(Json).ok_or(StatusCode::NOT_FOUND)
}

// ---------------------------------------------------------------------------
// Compose file reading — mirrors Dockge's approach
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ComposeFileResponse {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct ComposeErrorResponse {
    error: String,
    detail: String,
}

#[derive(Deserialize)]
struct UpdateComposeFileRequest {
    content: String,
}

fn compose_status(
    status: StatusCode,
    error: impl Into<String>,
    detail: impl Into<String>,
) -> Response {
    (
        status,
        Json(ComposeErrorResponse {
            error: error.into(),
            detail: detail.into(),
        }),
    )
        .into_response()
}

fn compose_error(error: impl Into<String>, detail: impl Into<String>) -> Response {
    compose_status(StatusCode::UNPROCESSABLE_ENTITY, error, detail)
}

/// Output row from `docker compose ls --all --format json`.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ComposeLsEntry {
    name: String,
    config_files: String,
}

/// Run `docker compose ls --all --format json` and return the parsed list.
async fn compose_ls() -> Option<Vec<ComposeLsEntry>> {
    let out = tokio::process::Command::new("docker")
        .args(["compose", "ls", "--all", "--format", "json"])
        .output()
        .await
        .ok()?;

    if !out.status.success() {
        return None;
    }

    serde_json::from_slice(&out.stdout).ok()
}

async fn resolve_compose_file(name: &str) -> Result<(PathBuf, String), ComposeErrorResponse> {
    // ── Step 1: get ConfigFiles from `docker compose ls` ──────────────────
    let compose_ls_entry = compose_ls()
        .await
        .and_then(|list| list.into_iter().find(|e| e.name == name));

    if let Some(entry) = &compose_ls_entry {
        for raw in entry.config_files.split(',') {
            let path = PathBuf::from(raw.trim());
            match tokio::fs::read_to_string(&path).await {
                Ok(content) => {
                    return Ok((path, content));
                }
                Err(e) => {
                    warn!("compose ls path {}: {e}", path.display());
                }
            }
        }
    }

    // ── Step 2: fall back to working_dir label + accepted filenames ────────
    let docker = match get_docker_client() {
        Ok(d) => d,
        Err(e) => {
            return Err(ComposeErrorResponse {
                error: "Docker client error".to_string(),
                detail: e.to_string(),
            });
        }
    };

    let containers = match docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
    {
        Ok(c) => c,
        Err(e) => {
            return Err(ComposeErrorResponse {
                error: "Failed to list containers".to_string(),
                detail: e.to_string(),
            });
        }
    };

    let working_dir = containers.iter().find_map(|c| {
        let labels = c.labels.as_ref()?;
        if labels.get("com.docker.compose.project")?.as_str() != name {
            return None;
        }
        labels
            .get("com.docker.compose.project.working_dir")
            .cloned()
    });

    let Some(working_dir) = working_dir else {
        return Err(ComposeErrorResponse {
            error: "Stack not found".to_string(),
            detail: format!("No container found for stack '{name}'"),
        });
    };

    let base = PathBuf::from(&working_dir);
    let mut tried = Vec::new();

    for filename in COMPOSE_FILENAMES {
        let path = base.join(filename);
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => {
                return Ok((path, content));
            }
            Err(e) => {
                tried.push(format!("{}: {e}", path.display()));
            }
        }
    }

    Err(ComposeErrorResponse {
        error: format!("Could not read compose file for stack '{name}'"),
        detail: tried.join("\n"),
    })
}

/// Return the content of the compose file for a given stack.
///
/// Strategy (same as Dockge):
/// 1. Run `docker compose ls --all --format json` to get the canonical
///    `ConfigFiles` path for the requested stack.
/// 2. Try reading each comma-separated path from `ConfigFiles`.
/// 3. If that fails, fall back to the `working_dir` label + each accepted
///    compose filename (`compose.yaml`, `docker-compose.yml`, …).
async fn get_compose_file(Path(name): Path<String>) -> Response {
    match resolve_compose_file(&name).await {
        Ok((path, content)) => Json(ComposeFileResponse {
            path: path.to_string_lossy().into_owned(),
            content,
        })
        .into_response(),
        Err(error) => compose_error(error.error, error.detail),
    }
}

async fn update_compose_file(
    Path(name): Path<String>,
    Json(payload): Json<UpdateComposeFileRequest>,
) -> Response {
    if payload.content.trim().is_empty() {
        return compose_status(
            StatusCode::BAD_REQUEST,
            "Compose file content is required",
            "",
        );
    }

    let (path, _) = match resolve_compose_file(&name).await {
        Ok(file) => file,
        Err(error) => return compose_error(error.error, error.detail),
    };

    if let Err(error) = tokio::fs::write(&path, &payload.content).await {
        return compose_status(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Could not write compose file for stack '{name}'"),
            error.to_string(),
        );
    }

    Json(ComposeFileResponse {
        path: path.to_string_lossy().into_owned(),
        content: payload.content,
    })
    .into_response()
}
