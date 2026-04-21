use axum::{Router, extract::Path, http::StatusCode, response::Json, routing::get};
use bollard::container::ListContainersOptions;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

use super::get_docker_client;

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
        .route("/docker/stacks/{name}/compose", get(get_compose_file))
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

#[derive(Serialize)]
struct ComposeFileResponse {
    path: String,
    content: String,
}

/// Read the docker-compose file from disk and return its raw content.
///
/// The path is taken from the `com.docker.compose.project.config_files` label
/// of any container belonging to the requested stack. Multiple config files
/// (comma-separated) are not uncommon; we read the first one that exists.
async fn get_compose_file(
    Path(name): Path<String>,
) -> Result<Json<ComposeFileResponse>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Find the config_files label for this stack.
    let config_files = containers
        .iter()
        .find_map(|c| {
            let labels = c.labels.as_ref()?;
            if labels.get("com.docker.compose.project")?.as_str() != name.as_str() {
                return None;
            }
            labels
                .get("com.docker.compose.project.config_files")
                .cloned()
        })
        .ok_or(StatusCode::NOT_FOUND)?;

    // The label may contain several comma-separated paths; try each in order.
    for raw in config_files.split(',') {
        let path = PathBuf::from(raw.trim());
        if let Ok(content) = tokio::fs::read_to_string(&path).await {
            return Ok(Json(ComposeFileResponse {
                path: path.to_string_lossy().into_owned(),
                content,
            }));
        }
    }

    Err(StatusCode::NOT_FOUND)
}
