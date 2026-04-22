use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::{Json, Response},
    routing::{get, post},
};
use bollard::container::{
    ListContainersOptions, LogsOptions, RemoveContainerOptions, StartContainerOptions, StatsOptions,
};
use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::AsyncWriteExt;

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

/// Resolve which shell to use. Tries `shell` param first, then falls back
/// to the priority list by checking if the binary exists in the container.
async fn resolve_shell(docker: &bollard::Docker, container_id: &str, preferred: Option<String>) -> String {
    if let Some(s) = preferred {
        if !s.is_empty() {
            return s;
        }
    }
    // Auto-detect: run `test -f <shell>` for each candidate.
    for candidate in SHELL_PRIORITY {
        let probe = docker
            .create_exec(
                container_id,
                bollard::exec::CreateExecOptions::<String> {
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(false),
                    cmd: Some(vec!["test".to_owned(), "-f".to_owned(), candidate.to_string()]),
                    ..Default::default()
                },
            )
            .await;
        if let Ok(exec) = probe {
            if let Ok(bollard::exec::StartExecResults::Attached { mut output, .. }) = docker
                .start_exec(&exec.id, Some(bollard::exec::StartExecOptions { detach: false, tty: false, output_capacity: None }))
                .await
            {
                // Drain output; exit code 0 means the file exists.
                while output.next().await.is_some() {}
                let info = docker.inspect_exec(&exec.id).await.unwrap_or_default();
                if info.exit_code == Some(0) {
                    return candidate.to_string();
                }
            }
        }
    }
    "/bin/sh".to_owned()
}

/// GET /docker/containers/{id}/shell — returns the best available shell for the container.
async fn detect_shell_handler(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
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

#[allow(clippy::too_many_lines)]
async fn handle_exec(container_id: String, ws: WebSocket, rows: u16, cols: u16, preferred_shell: Option<String>) {
    let Ok(docker) = get_docker_client() else {
        return;
    };
    let docker = Arc::new(docker);

    let shell = resolve_shell(&docker, &container_id, preferred_shell).await;

    let Ok(exec) = docker
        .create_exec(
            &container_id,
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
    else {
        return;
    };

    let exec_id = exec.id;

    let attached = match docker
        .start_exec(
            &exec_id,
            Some(StartExecOptions {
                detach: false,
                tty: true,
                output_capacity: None,
            }),
        )
        .await
    {
        Ok(StartExecResults::Attached { output, input }) => (output, input),
        _ => return,
    };
    let (mut output, mut input) = attached;

    // Apply initial terminal dimensions
    let _ = docker
        .resize_exec(
            &exec_id,
            ResizeExecOptions {
                height: rows,
                width: cols,
            },
        )
        .await;

    let (mut ws_tx, mut ws_rx) = ws.split();

    // Docker PTY output → WebSocket binary frames
    let send_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = output.next().await {
            let bytes = msg.into_bytes();
            if ws_tx.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
    });

    // WebSocket → Docker exec stdin; text JSON messages handle resize
    let docker_resize = Arc::clone(&docker);
    let exec_id_resize = exec_id.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Binary(data) => {
                    if input.write_all(&data).await.is_err() {
                        break;
                    }
                    let _ = input.flush().await;
                }
                Message::Text(text) => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if json.get("type").and_then(Value::as_str) == Some("resize") {
                            if let (Some(c), Some(r)) =
                                (json["cols"].as_u64(), json["rows"].as_u64())
                            {
                                let _ = docker_resize
                                    .resize_exec(
                                        &exec_id_resize,
                                        ResizeExecOptions {
                                            height: u16::try_from(r).unwrap_or(24),
                                            width: u16::try_from(c).unwrap_or(80),
                                        },
                                    )
                                    .await;
                            }
                        } else {
                            // Plain text input
                            if input.write_all(text.as_bytes()).await.is_err() {
                                break;
                            }
                            let _ = input.flush().await;
                        }
                    } else {
                        // Non-JSON text — forward as-is to stdin
                        if input.write_all(text.as_bytes()).await.is_err() {
                            break;
                        }
                        let _ = input.flush().await;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
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
            created: 1234567890,
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
            created: 1700000000,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test123"));
    }
}
