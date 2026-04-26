use std::pin::Pin;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::{Json, Response},
    routing::{get, post},
};
use bollard::Docker;
use bollard::container::{
    ListContainersOptions, LogOutput, LogsOptions, RemoveContainerOptions, StartContainerOptions,
    StatsOptions, UpdateContainerOptions,
};
use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncWrite, AsyncWriteExt};

use super::get_docker_client;

#[derive(Deserialize)]
pub struct ListQuery {
    pub all: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct ContainerResponse {
    pub id: String,
    pub names: Vec<String>,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created: i64,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/containers", get(list_containers))
        .route(
            "/docker/containers/{id}",
            get(inspect_container).delete(remove_container),
        )
        .route("/docker/containers/{id}/start", post(start_container))
        .route("/docker/containers/{id}/stop", post(stop_container))
        .route("/docker/containers/{id}/restart", post(restart_container))
        .route("/docker/containers/{id}/update", post(update_container))
        .route("/docker/containers/{id}/logs", get(container_logs))
        .route("/docker/containers/{id}/stats", get(container_stats))
        .route("/docker/containers/{id}/exec", get(container_exec))
        .route("/docker/containers/{id}/shell", get(detect_shell_handler))
}

async fn list_containers(
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<ContainerResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(ListContainersOptions::<String> {
        all: query.all.unwrap_or(false),
        ..Default::default()
    });

    let containers = docker
        .list_containers(options)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<ContainerResponse> = containers
        .into_iter()
        .map(|c| ContainerResponse {
            id: c.id.unwrap_or_default(),
            names: c.names.unwrap_or_default(),
            image: c.image.unwrap_or_default(),
            state: c.state.unwrap_or_default(),
            status: c.status.unwrap_or_default(),
            created: c.created.unwrap_or_default(),
        })
        .collect();

    Ok(Json(response))
}

async fn inspect_container(Path(id): Path<String>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let container = docker
        .inspect_container(&id, None)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::to_value(container).unwrap()))
}

async fn start_container(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .start_container(&id, None::<StartContainerOptions<String>>)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn stop_container(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .stop_container(&id, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn restart_container(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .restart_container(&id, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn remove_container(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .remove_container(
            &id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct UpdateContainerRequest {
    memory: Option<i64>,
    cpu_shares: Option<isize>,
    pids_limit: Option<i64>,
}

async fn update_container(
    Path(id): Path<String>,
    Json(payload): Json<UpdateContainerRequest>,
) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if payload.memory.is_none() && payload.cpu_shares.is_none() && payload.pids_limit.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    if payload.memory.is_some_and(|memory| memory <= 0)
        || payload.cpu_shares.is_some_and(|cpu_shares| cpu_shares <= 0)
        || payload.pids_limit.is_some_and(|pids_limit| pids_limit <= 0)
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    docker
        .update_container(
            &id,
            UpdateContainerOptions::<String> {
                memory: payload.memory,
                cpu_shares: payload.cpu_shares,
                pids_limit: payload.pids_limit,
                ..Default::default()
            },
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn container_logs(Path(id): Path<String>) -> Result<Json<Vec<String>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: "100".to_string(),
        ..Default::default()
    });

    let mut stream = docker.logs(&id, options);
    let mut logs = Vec::new();

    while let Some(log) = stream.next().await {
        if let Ok(output) = log {
            logs.push(output.to_string());
        }
    }

    Ok(Json(logs))
}

async fn container_stats(Path(id): Path<String>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(StatsOptions {
        stream: false,
        ..Default::default()
    });

    let mut stream = docker.stats(&id, options);

    if let Some(Ok(stats)) = stream.next().await {
        return Ok(Json(serde_json::to_value(stats).unwrap()));
    }

    Err(StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Deserialize)]
struct ExecQuery {
    rows: Option<u16>,
    cols: Option<u16>,
    /// Shell to use. Defaults to auto-detect (bash → sh).
    shell: Option<String>,
}

/// Shells tried in priority order when `shell` param is not provided.
const SHELL_PRIORITY: &[&str] = &["/bin/bash", "/bin/sh"];
type ExecOutput = futures::stream::BoxStream<'static, Result<LogOutput, bollard::errors::Error>>;
type ExecInput = Pin<Box<dyn AsyncWrite + Send>>;

async fn resolve_shell(docker: &Docker, container_id: &str, preferred: Option<String>) -> String {
    if let Some(s) = preferred
        && !s.is_empty()
        && container_has_shell(docker, container_id, &s).await
    {
        return s;
    }

    for candidate in SHELL_PRIORITY {
        if container_has_shell(docker, container_id, candidate).await {
            return (*candidate).to_string();
        }
    }

    "/bin/sh".to_owned()
}

async fn container_has_shell(docker: &Docker, container_id: &str, shell: &str) -> bool {
    let Ok(exec) = docker
        .create_exec(
            container_id,
            CreateExecOptions::<String> {
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                tty: Some(false),
                cmd: Some(vec!["test".to_owned(), "-f".to_owned(), shell.to_owned()]),
                ..Default::default()
            },
        )
        .await
    else {
        return false;
    };

    let Ok(StartExecResults::Attached { mut output, .. }) = docker
        .start_exec(
            &exec.id,
            Some(StartExecOptions {
                detach: false,
                tty: false,
                output_capacity: None,
            }),
        )
        .await
    else {
        return false;
    };

    while output.next().await.is_some() {}

    docker
        .inspect_exec(&exec.id)
        .await
        .is_ok_and(|info| info.exit_code == Some(0))
}

/// GET /docker/containers/{id}/shell — returns the best available shell for the container.
async fn detect_shell_handler(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let shell = resolve_shell(&docker, &id, None).await;
    Ok(Json(serde_json::json!({ "shell": shell })))
}

async fn container_exec(
    Path(id): Path<String>,
    Query(query): Query<ExecQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let rows = query.rows.unwrap_or(24);
    let cols = query.cols.unwrap_or(80);
    let shell = query.shell;
    ws.on_upgrade(move |socket| handle_exec(id, socket, rows, cols, shell))
}

async fn handle_exec(
    container_id: String,
    ws: WebSocket,
    rows: u16,
    cols: u16,
    preferred_shell: Option<String>,
) {
    let Ok(docker) = get_docker_client() else {
        return;
    };
    let docker = Arc::new(docker);

    let Some((exec_id, output, input)) =
        setup_exec(&docker, &container_id, preferred_shell, rows, cols).await
    else {
        return;
    };

    run_exec_loop(ws, output, input, docker, exec_id).await;
}

async fn setup_exec(
    docker: &Docker,
    container_id: &str,
    preferred_shell: Option<String>,
    rows: u16,
    cols: u16,
) -> Option<(String, ExecOutput, ExecInput)> {
    let shell = resolve_shell(docker, container_id, preferred_shell).await;

    let exec = docker
        .create_exec(
            container_id,
            CreateExecOptions::<String> {
                attach_stdin: Some(true),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                tty: Some(true),
                cmd: Some(vec![shell]),
                ..Default::default()
            },
        )
        .await
        .ok()?;

    let exec_id = exec.id;

    let Ok(StartExecResults::Attached { output, input }) = docker
        .start_exec(
            &exec_id,
            Some(StartExecOptions {
                detach: false,
                tty: true,
                output_capacity: None,
            }),
        )
        .await
    else {
        return None;
    };

    let _ = docker
        .resize_exec(
            &exec_id,
            ResizeExecOptions {
                height: rows,
                width: cols,
            },
        )
        .await;

    Some((exec_id, output, input))
}

async fn run_exec_loop(
    ws: WebSocket,
    mut output: ExecOutput,
    mut input: ExecInput,
    docker: Arc<Docker>,
    exec_id: String,
) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    let send_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = output.next().await {
            if ws_tx.send(Message::Binary(msg.into_bytes())).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            if handle_ws_message(msg, &mut input, &docker, &exec_id)
                .await
                .is_err()
            {
                break;
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

async fn handle_ws_message(
    msg: Message,
    input: &mut ExecInput,
    docker: &Docker,
    exec_id: &str,
) -> Result<(), std::io::Error> {
    match msg {
        Message::Binary(data) => {
            input.write_all(&data).await?;
            input.flush().await
        }
        Message::Text(text) => handle_text_input(text.to_string(), input, docker, exec_id).await,
        Message::Close(_) => Err(std::io::Error::new(
            std::io::ErrorKind::ConnectionAborted,
            "closed",
        )),
        _ => Ok(()),
    }
}

async fn handle_text_input(
    text: String,
    input: &mut ExecInput,
    docker: &Docker,
    exec_id: &str,
) -> Result<(), std::io::Error> {
    if let Ok(json) = serde_json::from_str::<Value>(&text)
        && json.get("type").and_then(Value::as_str) == Some("resize")
    {
        handle_resize(json, docker, exec_id).await;
        return Ok(());
    }
    input.write_all(text.as_bytes()).await?;
    input.flush().await
}

async fn handle_resize(json: Value, docker: &Docker, exec_id: &str) {
    if let (Some(c), Some(r)) = (json["cols"].as_u64(), json["rows"].as_u64()) {
        let _ = docker
            .resize_exec(
                exec_id,
                ResizeExecOptions {
                    height: u16::try_from(r).unwrap_or(24),
                    width: u16::try_from(c).unwrap_or(80),
                },
            )
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_container_response_creation() {
        let response = ContainerResponse {
            id: "abc123".to_string(),
            names: vec!["/nginx".to_string()],
            image: "nginx:latest".to_string(),
            state: "running".to_string(),
            status: "Up 2 hours".to_string(),
            created: 1_234_567_890,
        };
        assert_eq!(response.id, "abc123");
        assert_eq!(response.state, "running");
    }

    #[test]
    fn test_list_query_default() {
        let query = ListQuery { all: None };
        assert!(query.all.is_none());
    }

    #[test]
    fn test_list_query_all_true() {
        let query = ListQuery { all: Some(true) };
        assert_eq!(query.all, Some(true));
    }

    #[test]
    fn test_container_response_serialization() {
        let response = ContainerResponse {
            id: "test123".to_string(),
            names: vec!["/test".to_string()],
            image: "alpine".to_string(),
            state: "exited".to_string(),
            status: "Exited".to_string(),
            created: 1_700_000_000,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test123"));
    }
}
