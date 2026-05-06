use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
};
use bollard::{Docker, container::ListContainersOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::ErrorKind;
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
const COMPOSE_SEARCH_DIRS: &[&str] = &["/root/apps"];
const DEFAULT_COMPOSE_OVERRIDE_FILENAME: &str = "docker-compose.override.yml";
const STACK_CACHE_FILENAME: &str = "compose-stacks.json";

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

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StackCacheEntry {
    pub name: String,
    pub working_dir: Option<String>,
    pub config_file: Option<String>,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/stacks", get(list_stacks))
        .route("/docker/stacks/{name}", get(get_stack))
        .route("/docker/stacks/{name}/up", post(compose_up_stack))
        .route("/docker/stacks/{name}/down", post(compose_down_stack))
        .route(
            "/docker/stacks/{name}/compose",
            get(get_compose_file).put(update_compose_file),
        )
}

async fn list_stacks() -> Result<Json<Vec<StackResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    collect_stacks(&docker)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_stack(Path(name): Path<String>) -> Result<Json<StackResponse>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    collect_stacks(&docker)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .into_iter()
        .find(|stack| stack.name == name)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn collect_stacks(docker: &Docker) -> Result<Vec<StackResponse>, bollard::errors::Error> {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await?;

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

    merge_compose_ls_stacks(&mut stacks).await;
    merge_cached_stacks(&mut stacks).await;
    merge_scanned_stacks(&mut stacks).await;

    let mut result: Vec<StackResponse> = stacks.into_values().collect();
    for stack in &mut result {
        annotate_dokuru_override(stack).await;
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    write_stack_cache_from_stacks(&result).await;
    Ok(result)
}

async fn merge_compose_ls_stacks(stacks: &mut HashMap<String, StackResponse>) {
    let Some(entries) = compose_ls().await else {
        return;
    };

    for entry in entries {
        if stacks.contains_key(&entry.name) || entry.config_files.trim().is_empty() {
            continue;
        }
        stacks.insert(
            entry.name.clone(),
            StackResponse {
                name: entry.name,
                working_dir: None,
                config_file: Some(entry.config_files),
                dokuru_override_file: None,
                dokuru_override_exists: false,
                dokuru_override_active: false,
                containers: Vec::new(),
                running: 0,
                total: 0,
            },
        );
    }
}

async fn merge_cached_stacks(stacks: &mut HashMap<String, StackResponse>) {
    for entry in read_stack_cache().await {
        if stacks.contains_key(&entry.name) || !stack_cache_entry_is_usable(&entry).await {
            continue;
        }
        stacks.insert(entry.name.clone(), stack_from_cache_entry(entry));
    }
}

async fn merge_scanned_stacks(stacks: &mut HashMap<String, StackResponse>) {
    for entry in scan_compose_stack_entries().await {
        if stacks.contains_key(&entry.name) {
            continue;
        }
        stacks.insert(entry.name.clone(), stack_from_cache_entry(entry));
    }
}

fn stack_from_cache_entry(entry: StackCacheEntry) -> StackResponse {
    StackResponse {
        name: entry.name,
        working_dir: entry.working_dir,
        config_file: entry.config_file,
        dokuru_override_file: None,
        dokuru_override_exists: false,
        dokuru_override_active: false,
        containers: Vec::new(),
        running: 0,
        total: 0,
    }
}

fn dokuru_data_dir() -> PathBuf {
    std::env::var("DOKURU_DATA_DIR").map_or_else(
        |_| {
            if cfg!(debug_assertions) {
                std::env::current_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(".dokuru")
            } else {
                PathBuf::from("/var/lib/dokuru")
            }
        },
        PathBuf::from,
    )
}

fn stack_cache_path() -> PathBuf {
    dokuru_data_dir().join(STACK_CACHE_FILENAME)
}

async fn read_stack_cache() -> Vec<StackCacheEntry> {
    let path = stack_cache_path();
    match tokio::fs::read(&path).await {
        Ok(json) => match serde_json::from_slice::<Vec<StackCacheEntry>>(&json) {
            Ok(entries) => entries,
            Err(error) => {
                warn!(path = %path.display(), %error, "Failed to parse compose stack cache");
                Vec::new()
            }
        },
        Err(error) if error.kind() == ErrorKind::NotFound => Vec::new(),
        Err(error) => {
            warn!(path = %path.display(), %error, "Failed to read compose stack cache");
            Vec::new()
        }
    }
}

async fn write_stack_cache(entries: &[StackCacheEntry]) {
    let path = stack_cache_path();
    let Some(parent) = path.parent() else {
        return;
    };
    if let Err(error) = tokio::fs::create_dir_all(parent).await {
        warn!(path = %parent.display(), %error, "Failed to create compose stack cache directory");
        return;
    }
    let json = match serde_json::to_vec_pretty(entries) {
        Ok(json) => json,
        Err(error) => {
            warn!(%error, "Failed to serialize compose stack cache");
            return;
        }
    };
    if let Err(error) = tokio::fs::write(&path, json).await {
        warn!(path = %path.display(), %error, "Failed to write compose stack cache");
    }
}

async fn write_stack_cache_from_stacks(stacks: &[StackResponse]) {
    let mut entries = Vec::new();
    for stack in stacks {
        if let Some(entry) = stack_cache_entry_from_stack(stack) {
            entries.push(entry);
        }
    }
    write_stack_cache(&entries).await;
}

fn stack_cache_entry_from_stack(stack: &StackResponse) -> Option<StackCacheEntry> {
    if stack.working_dir.is_none() && stack.config_file.is_none() {
        return None;
    }
    Some(StackCacheEntry {
        name: stack.name.clone(),
        working_dir: stack.working_dir.clone(),
        config_file: stack.config_file.clone(),
    })
}

pub async fn cached_stack_entry(name: &str) -> Option<StackCacheEntry> {
    read_stack_cache().await.into_iter().find(|entry| {
        entry.name == name && (entry.working_dir.is_some() || entry.config_file.is_some())
    })
}

async fn scanned_stack_entry(name: &str) -> Option<StackCacheEntry> {
    scan_compose_stack_entries()
        .await
        .into_iter()
        .find(|entry| entry.name == name)
}

async fn scan_compose_stack_entries() -> Vec<StackCacheEntry> {
    let mut entries = Vec::new();
    for base_dir in COMPOSE_SEARCH_DIRS {
        let Ok(mut dirs) = tokio::fs::read_dir(base_dir).await else {
            continue;
        };

        loop {
            let entry = match dirs.next_entry().await {
                Ok(Some(entry)) => entry,
                Ok(None) => break,
                Err(error) => {
                    warn!(path = %base_dir, %error, "Failed to scan compose stack directory");
                    break;
                }
            };

            let Ok(file_type) = entry.file_type().await else {
                continue;
            };
            if !file_type.is_dir() {
                continue;
            }

            let working_dir = entry.path();
            let Some(compose_path) = first_existing_compose_path(&working_dir).await else {
                continue;
            };
            let Some(name) = working_dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            entries.push(StackCacheEntry {
                name: name.to_string(),
                working_dir: Some(working_dir.to_string_lossy().into_owned()),
                config_file: Some(compose_path.to_string_lossy().into_owned()),
            });
        }
    }

    entries.sort_by(|left, right| left.name.cmp(&right.name));
    entries.dedup_by(|left, right| left.name == right.name);
    entries
}

async fn first_existing_compose_path(working_dir: &FsPath) -> Option<PathBuf> {
    for filename in COMPOSE_FILENAMES {
        let path = working_dir.join(filename);
        if tokio::fs::metadata(&path)
            .await
            .is_ok_and(|metadata| metadata.is_file())
        {
            return Some(path);
        }
    }
    None
}

async fn remember_stack_context(name: &str, context: &StackComposeCommandContext) {
    let config_file = context
        .compose_paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(",");
    let mut entries = read_stack_cache().await;
    entries.retain(|entry| entry.name != name);
    entries.push(StackCacheEntry {
        name: name.to_string(),
        working_dir: context.working_dir.clone(),
        config_file: if config_file.is_empty() {
            None
        } else {
            Some(config_file)
        },
    });
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    write_stack_cache(&entries).await;
}

async fn stack_cache_entry_is_usable(entry: &StackCacheEntry) -> bool {
    for path in config_file_paths(entry.config_file.as_deref(), entry.working_dir.as_deref()) {
        if tokio::fs::metadata(&path)
            .await
            .is_ok_and(|metadata| metadata.is_file())
        {
            return true;
        }
    }

    if let Some(working_dir) = entry
        .working_dir
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        let base = PathBuf::from(working_dir);
        for filename in COMPOSE_FILENAMES {
            if tokio::fs::metadata(base.join(filename))
                .await
                .is_ok_and(|metadata| metadata.is_file())
            {
                return true;
            }
        }
    }

    false
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

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn requested_compose_path(raw: &str, working_dir: Option<&str>) -> Option<PathBuf> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    let path = PathBuf::from(raw);
    Some(if path.is_absolute() {
        path
    } else if let Some(working_dir) = working_dir.filter(|value| !value.trim().is_empty()) {
        PathBuf::from(working_dir).join(path)
    } else {
        path
    })
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
pub struct ComposeErrorResponse {
    pub error: String,
    pub detail: String,
}

#[derive(Deserialize)]
struct UpdateComposeFileRequest {
    content: String,
}

#[derive(Deserialize)]
struct ComposeUpRequest {
    #[serde(default = "default_compose_up_detach")]
    detach: bool,
    #[serde(default)]
    force_recreate: bool,
}

impl Default for ComposeUpRequest {
    fn default() -> Self {
        Self {
            detach: true,
            force_recreate: false,
        }
    }
}

#[derive(Deserialize, Default)]
struct ComposeDownRequest {
    #[serde(default)]
    volumes: bool,
}

#[derive(Debug, Serialize)]
pub struct ComposeActionResponse {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
}

struct StackComposeCommandContext {
    working_dir: Option<String>,
    compose_paths: Vec<PathBuf>,
}

#[derive(Clone, Copy)]
pub enum ComposeStackAction {
    Up { detach: bool, force_recreate: bool },
    Down { volumes: bool },
}

const fn default_compose_up_detach() -> bool {
    true
}

#[derive(Deserialize, Default)]
struct ComposeFileQuery {
    path: Option<String>,
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

async fn compose_file_candidates(
    name: &str,
) -> Result<(Vec<PathBuf>, Option<String>), ComposeErrorResponse> {
    let mut paths = Vec::new();
    let compose_ls_entry = compose_ls()
        .await
        .and_then(|list| list.into_iter().find(|e| e.name == name));

    if let Some(entry) = &compose_ls_entry {
        for path in config_file_paths(Some(&entry.config_files), None) {
            push_unique_path(&mut paths, path);
        }
    }

    let docker = match get_docker_client() {
        Ok(d) => d,
        Err(e) => {
            if !paths.is_empty() {
                return Ok((paths, None));
            }
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
            if !paths.is_empty() {
                return Ok((paths, None));
            }
            return Err(ComposeErrorResponse {
                error: "Failed to list containers".to_string(),
                detail: e.to_string(),
            });
        }
    };

    let labels = containers.iter().find_map(|c| {
        let labels = c.labels.as_ref()?;
        if labels.get("com.docker.compose.project")?.as_str() != name {
            return None;
        }
        Some((
            labels
                .get("com.docker.compose.project.working_dir")
                .cloned(),
            labels
                .get("com.docker.compose.project.config_files")
                .cloned(),
        ))
    });

    let Some((working_dir, config_files)) = labels else {
        if let Some(working_dir) = saved_compose_file_candidates(name, &mut paths).await {
            return Ok((paths, working_dir));
        }
        if !paths.is_empty() {
            return Ok((paths, None));
        }
        return Err(ComposeErrorResponse {
            error: "Stack not found".to_string(),
            detail: format!("No container found for stack '{name}'"),
        });
    };

    for path in config_file_paths(config_files.as_deref(), working_dir.as_deref()) {
        push_unique_path(&mut paths, path);
    }

    if let Some(working_dir) = &working_dir {
        let base = PathBuf::from(working_dir);
        for filename in COMPOSE_FILENAMES {
            push_unique_path(&mut paths, base.join(filename));
        }
    }

    if let Some(path) = stack_dokuru_override_path(working_dir.as_deref(), config_files.as_deref())
    {
        push_unique_path(&mut paths, path);
    }

    Ok((paths, working_dir))
}

async fn saved_compose_file_candidates(
    name: &str,
    paths: &mut Vec<PathBuf>,
) -> Option<Option<String>> {
    if let Some(entry) = cached_stack_entry(name).await {
        let working_dir = push_stack_entry_compose_paths(paths, &entry);
        if !paths.is_empty() {
            return Some(working_dir);
        }
    }

    if let Some(entry) = scanned_stack_entry(name).await {
        let working_dir = push_stack_entry_compose_paths(paths, &entry);
        if !paths.is_empty() {
            return Some(working_dir);
        }
    }

    None
}

fn push_stack_entry_compose_paths(
    paths: &mut Vec<PathBuf>,
    entry: &StackCacheEntry,
) -> Option<String> {
    for path in config_file_paths(entry.config_file.as_deref(), entry.working_dir.as_deref()) {
        push_unique_path(paths, path);
    }
    if let Some(working_dir) = &entry.working_dir {
        let base = PathBuf::from(working_dir);
        for filename in COMPOSE_FILENAMES {
            push_unique_path(paths, base.join(filename));
        }
    }
    if let Some(path) =
        stack_dokuru_override_path(entry.working_dir.as_deref(), entry.config_file.as_deref())
    {
        push_unique_path(paths, path);
    }
    entry.working_dir.clone()
}

async fn resolve_compose_file(
    name: &str,
    requested_path: Option<&str>,
) -> Result<(PathBuf, String), ComposeErrorResponse> {
    let (candidates, working_dir) = compose_file_candidates(name).await?;
    let paths = if let Some(requested_path) = requested_path {
        let Some(requested_path) = requested_compose_path(requested_path, working_dir.as_deref())
        else {
            return Err(ComposeErrorResponse {
                error: "Compose file path is required".to_string(),
                detail: String::new(),
            });
        };

        if !candidates.iter().any(|path| path == &requested_path) {
            return Err(ComposeErrorResponse {
                error: "Compose file does not belong to this stack".to_string(),
                detail: requested_path.to_string_lossy().into_owned(),
            });
        }

        vec![requested_path]
    } else {
        candidates
    };

    let mut tried = Vec::new();
    for path in paths {
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => {
                return Ok((path, content));
            }
            Err(e) => {
                tried.push(format!("{}: {e}", path.display()));
                warn!("compose path {}: {e}", path.display());
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
/// 2. Try the requested path if it belongs to the stack, otherwise read the first
///    readable comma-separated path from `ConfigFiles`.
/// 3. If that fails, fall back to the `working_dir` label + each accepted
///    compose filename (`compose.yaml`, `docker-compose.yml`, …).
async fn get_compose_file(
    Path(name): Path<String>,
    Query(query): Query<ComposeFileQuery>,
) -> Response {
    match resolve_compose_file(&name, query.path.as_deref()).await {
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
    Query(query): Query<ComposeFileQuery>,
    Json(payload): Json<UpdateComposeFileRequest>,
) -> Response {
    if payload.content.trim().is_empty() {
        return compose_status(
            StatusCode::BAD_REQUEST,
            "Compose file content is required",
            "",
        );
    }

    let (path, _) = match resolve_compose_file(&name, query.path.as_deref()).await {
        Ok(file) => file,
        Err(error) => return compose_error(error.error, error.detail),
    };

    match write_compose_content(&path, payload.content, &name).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => compose_status(StatusCode::INTERNAL_SERVER_ERROR, error.error, error.detail),
    }
}

async fn compose_up_stack(
    Path(name): Path<String>,
    Json(payload): Json<ComposeUpRequest>,
) -> Response {
    let docker = match get_docker_client() {
        Ok(docker) => docker,
        Err(error) => {
            return compose_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Docker client error",
                error.to_string(),
            );
        }
    };

    match run_stack_compose_action(
        &docker,
        &name,
        ComposeStackAction::Up {
            detach: payload.detach,
            force_recreate: payload.force_recreate,
        },
    )
    .await
    {
        Ok(response) => Json(response).into_response(),
        Err(error) => compose_error(error.error, error.detail),
    }
}

async fn compose_down_stack(
    Path(name): Path<String>,
    Json(payload): Json<ComposeDownRequest>,
) -> Response {
    let docker = match get_docker_client() {
        Ok(docker) => docker,
        Err(error) => {
            return compose_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Docker client error",
                error.to_string(),
            );
        }
    };

    match run_stack_compose_action(
        &docker,
        &name,
        ComposeStackAction::Down {
            volumes: payload.volumes,
        },
    )
    .await
    {
        Ok(response) => Json(response).into_response(),
        Err(error) => compose_error(error.error, error.detail),
    }
}

pub async fn run_stack_compose_action(
    docker: &Docker,
    name: &str,
    action: ComposeStackAction,
) -> Result<ComposeActionResponse, ComposeErrorResponse> {
    let context = stack_compose_command_context(docker, name).await?;
    remember_stack_context(name, &context).await;
    let args = stack_compose_command_args(name, &context.compose_paths, action);
    let command_display = compose_command_display(&args);

    let mut command = tokio::process::Command::new("docker");
    command.args(&args);
    if let Some(working_dir) = &context.working_dir {
        command.current_dir(working_dir);
    }

    let output = command
        .output()
        .await
        .map_err(|error| ComposeErrorResponse {
            error: "Failed to run docker compose".to_string(),
            detail: error.to_string(),
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(ComposeErrorResponse {
            error: "docker compose command failed".to_string(),
            detail: if stderr.is_empty() { stdout } else { stderr },
        });
    }

    Ok(ComposeActionResponse {
        command: command_display,
        stdout,
        stderr,
    })
}

async fn stack_compose_command_context(
    docker: &Docker,
    name: &str,
) -> Result<StackComposeCommandContext, ComposeErrorResponse> {
    let mut paths = Vec::new();
    let mut working_dir = None;

    if let Some(entry) = compose_ls()
        .await
        .and_then(|list| list.into_iter().find(|entry| entry.name == name))
    {
        for path in config_file_paths(Some(&entry.config_files), None) {
            push_unique_path(&mut paths, path);
        }
    }

    match docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
    {
        Ok(containers) => {
            if let Some((detected_working_dir, config_files)) = containers.iter().find_map(|c| {
                let labels = c.labels.as_ref()?;
                if labels.get("com.docker.compose.project")?.as_str() != name {
                    return None;
                }
                Some((
                    labels
                        .get("com.docker.compose.project.working_dir")
                        .cloned(),
                    labels
                        .get("com.docker.compose.project.config_files")
                        .cloned(),
                ))
            }) {
                working_dir = detected_working_dir;
                for path in config_file_paths(config_files.as_deref(), working_dir.as_deref()) {
                    push_unique_path(&mut paths, path);
                }

                if paths.is_empty()
                    && let Some(working_dir) = &working_dir
                {
                    let base = PathBuf::from(working_dir);
                    for filename in COMPOSE_FILENAMES {
                        push_unique_path(&mut paths, base.join(filename));
                    }
                }
            }
        }
        Err(error) => {
            if paths.is_empty() {
                return Err(ComposeErrorResponse {
                    error: "Failed to list containers".to_string(),
                    detail: error.to_string(),
                });
            }
        }
    }

    if let Some(entry) = cached_stack_entry(name).await {
        if working_dir.is_none() {
            working_dir.clone_from(&entry.working_dir);
        }
        for path in config_file_paths(entry.config_file.as_deref(), working_dir.as_deref()) {
            push_unique_path(&mut paths, path);
        }
        if let Some(working_dir) = &working_dir {
            let base = PathBuf::from(working_dir);
            for filename in COMPOSE_FILENAMES {
                push_unique_path(&mut paths, base.join(filename));
            }
        }
    }

    if let Some(entry) = scanned_stack_entry(name).await {
        if working_dir.is_none() {
            working_dir.clone_from(&entry.working_dir);
        }
        for path in config_file_paths(entry.config_file.as_deref(), working_dir.as_deref()) {
            push_unique_path(&mut paths, path);
        }
    }

    if paths.is_empty() {
        return Err(ComposeErrorResponse {
            error: "Stack not found".to_string(),
            detail: format!("No Compose metadata found for stack '{name}'"),
        });
    }

    let compose_paths = existing_compose_paths(paths).await;
    if compose_paths.is_empty() {
        return Err(ComposeErrorResponse {
            error: format!("Could not locate compose files for stack '{name}'"),
            detail: "The stack has no readable Compose config files in Docker labels or docker compose ls.".to_string(),
        });
    }

    Ok(StackComposeCommandContext {
        working_dir,
        compose_paths,
    })
}

async fn existing_compose_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut existing = Vec::new();
    for path in paths {
        if tokio::fs::metadata(&path)
            .await
            .is_ok_and(|metadata| metadata.is_file())
        {
            push_unique_path(&mut existing, path);
        }
    }
    existing
}

fn stack_compose_command_args(
    name: &str,
    compose_paths: &[PathBuf],
    action: ComposeStackAction,
) -> Vec<String> {
    let mut args = Vec::with_capacity(6 + compose_paths.len() * 2);
    args.push("compose".to_string());
    for path in compose_paths {
        args.push("-f".to_string());
        args.push(path.to_string_lossy().into_owned());
    }
    args.push("-p".to_string());
    args.push(name.to_string());

    match action {
        ComposeStackAction::Up {
            detach,
            force_recreate,
        } => {
            args.push("up".to_string());
            if detach {
                args.push("--detach".to_string());
            }
            if force_recreate {
                args.push("--force-recreate".to_string());
            }
        }
        ComposeStackAction::Down { volumes } => {
            args.push("down".to_string());
            if volumes {
                args.push("--volumes".to_string());
            }
        }
    }

    args
}

fn compose_command_display(args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push("docker");
    parts.extend(args.iter().map(String::as_str));
    parts.join(" ")
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
        ComposeStackAction, DEFAULT_COMPOSE_OVERRIDE_FILENAME, config_files_include_path,
        requested_compose_path, stack_compose_command_args, stack_dokuru_override_path,
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

    #[test]
    fn requested_compose_path_resolves_relative_to_working_dir() {
        assert_eq!(
            requested_compose_path("docker-compose.override.yml", Some("/srv/app")),
            Some(PathBuf::from("/srv/app/docker-compose.override.yml")),
        );
        assert_eq!(
            requested_compose_path("/srv/app/docker-compose.yml", Some("/other")),
            Some(PathBuf::from("/srv/app/docker-compose.yml")),
        );
        assert_eq!(requested_compose_path("  ", Some("/srv/app")), None);
    }

    #[test]
    fn compose_up_command_args_include_selected_options() {
        let args = stack_compose_command_args(
            "dokuru-lab",
            &[PathBuf::from("/srv/app/docker-compose.yml")],
            ComposeStackAction::Up {
                detach: true,
                force_recreate: true,
            },
        );

        assert_eq!(
            args,
            [
                "compose",
                "-f",
                "/srv/app/docker-compose.yml",
                "-p",
                "dokuru-lab",
                "up",
                "--detach",
                "--force-recreate",
            ]
        );
    }

    #[test]
    fn compose_down_command_args_include_volumes_option() {
        let args = stack_compose_command_args(
            "dokuru-lab",
            &[
                PathBuf::from("/srv/app/docker-compose.yml"),
                PathBuf::from("/srv/app/docker-compose.override.yml"),
            ],
            ComposeStackAction::Down { volumes: true },
        );

        assert_eq!(
            args,
            [
                "compose",
                "-f",
                "/srv/app/docker-compose.yml",
                "-f",
                "/srv/app/docker-compose.override.yml",
                "-p",
                "dokuru-lab",
                "down",
                "--volumes",
            ]
        );
    }
}
