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
use std::path::{Path as FsPath, PathBuf};
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
const DEFAULT_COMPOSE_OVERRIDE_FILENAME: &str = "docker-compose.override.yml";

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
    pub dokuru_override_file: Option<String>,
    pub dokuru_override_exists: bool,
    pub dokuru_override_active: bool,
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
                dokuru_override_file: None,
                dokuru_override_exists: false,
                dokuru_override_active: false,
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
    for stack in &mut result {
        annotate_dokuru_override(stack).await;
    }
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
            dokuru_override_file: None,
            dokuru_override_exists: false,
            dokuru_override_active: false,
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

    if let Some(mut stack) = stack {
        annotate_dokuru_override(&mut stack).await;
        Ok(Json(stack))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn annotate_dokuru_override(stack: &mut StackResponse) {
    let Some(path) =
        stack_dokuru_override_path(stack.working_dir.as_deref(), stack.config_file.as_deref())
    else {
        return;
    };

    stack.dokuru_override_active = config_files_include_path(
        stack.config_file.as_deref(),
        stack.working_dir.as_deref(),
        &path,
    );
    stack.dokuru_override_exists = tokio::fs::metadata(&path)
        .await
        .is_ok_and(|metadata| metadata.is_file());
    stack.dokuru_override_file = Some(path.to_string_lossy().to_string());
}

fn stack_dokuru_override_path(
    working_dir: Option<&str>,
    config_files: Option<&str>,
) -> Option<PathBuf> {
    let config_paths = config_file_paths(config_files, working_dir);
    let filename = compose_override_filename(config_paths.first().map(PathBuf::as_path));

    if let Some(working_dir) = working_dir.filter(|value| !value.trim().is_empty()) {
        return Some(PathBuf::from(working_dir).join(filename));
    }

    config_paths
        .into_iter()
        .find_map(|path| path.parent().map(|parent| parent.join(filename.clone())))
}

fn compose_override_filename(compose_path: Option<&FsPath>) -> String {
    let Some(compose_path) = compose_path else {
        return DEFAULT_COMPOSE_OVERRIDE_FILENAME.to_string();
    };

    let extension = compose_path
        .extension()
        .and_then(|extension| extension.to_str())
        .filter(|extension| *extension == "yaml")
        .unwrap_or("yml");
    let filename = compose_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let prefix = if filename.starts_with("compose.") {
        "compose"
    } else {
        "docker-compose"
    };

    format!("{prefix}.override.{extension}")
}

fn config_files_include_path(
    config_files: Option<&str>,
    working_dir: Option<&str>,
    needle: &FsPath,
) -> bool {
    config_file_paths(config_files, working_dir)
        .iter()
        .any(|path| path == needle || path.file_name() == needle.file_name())
}

fn config_file_paths(config_files: Option<&str>, working_dir: Option<&str>) -> Vec<PathBuf> {
    let working_dir = working_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    config_files
        .unwrap_or_default()
        .split(',')
        .filter_map(|raw| {
            let raw = raw.trim();
            if raw.is_empty() {
                return None;
            }
            let path = PathBuf::from(raw);
            Some(if path.is_absolute() {
                path
            } else if let Some(working_dir) = &working_dir {
                working_dir.join(path)
            } else {
                path
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Compose file reading — mirrors Dockge's approach
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct ComposeFileResponse {
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
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

    match write_compose_content(&path, payload.content, &name).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => compose_status(StatusCode::INTERNAL_SERVER_ERROR, error.error, error.detail),
    }
}

async fn write_compose_content(
    path: &FsPath,
    content: String,
    stack_name: &str,
) -> Result<ComposeFileResponse, ComposeErrorResponse> {
    if let Err(error) = tokio::fs::write(path, &content).await {
        return Err(ComposeErrorResponse {
            error: format!("Could not write compose file for stack '{stack_name}'"),
            detail: error.to_string(),
        });
    }

    Ok(ComposeFileResponse {
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_COMPOSE_OVERRIDE_FILENAME, config_files_include_path, stack_dokuru_override_path,
        write_compose_content,
    };
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_compose_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dokuru-{name}-{}-{nanos}.compose.yaml",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn write_compose_content_updates_file_on_disk() {
        let path = temp_compose_path("write");
        let original = "services:\n  app:\n    image: nginx:alpine\n";
        let updated = "services:\n  app:\n    image: caddy:2-alpine\n";

        tokio::fs::write(&path, original).await.unwrap();
        let response = write_compose_content(&path, updated.to_string(), "dokuru-lab")
            .await
            .unwrap();

        assert_eq!(response.path, path.to_string_lossy().as_ref());
        assert_eq!(response.content, updated);
        assert_eq!(tokio::fs::read_to_string(&path).await.unwrap(), updated);

        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn write_compose_content_returns_write_error() {
        let missing_parent = temp_compose_path("missing-parent").join("compose.yaml");
        let error = write_compose_content(&missing_parent, "services: {}\n".to_string(), "missing")
            .await
            .unwrap_err();

        assert_eq!(
            error.error,
            "Could not write compose file for stack 'missing'"
        );
        assert!(!error.detail.is_empty());
    }

    #[test]
    fn stack_override_path_uses_working_dir_with_standard_filename() {
        let path = stack_dokuru_override_path(Some("/srv/app"), Some("docker-compose.yml"))
            .expect("override path should be derived from working_dir");

        assert_eq!(
            path,
            PathBuf::from("/srv/app").join(DEFAULT_COMPOSE_OVERRIDE_FILENAME)
        );
    }

    #[test]
    fn config_files_include_path_handles_relative_docker_compose_names() {
        let override_path = PathBuf::from("/srv/app").join("docker-compose.override.yaml");
        let config_files = "docker-compose.yaml,docker-compose.override.yaml";

        assert!(config_files_include_path(
            Some(config_files),
            Some("/srv/app"),
            &override_path,
        ));
    }
}
