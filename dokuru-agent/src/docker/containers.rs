use std::pin::Pin;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
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
use std::process::Stdio;
use tokio::io::{AsyncWrite, AsyncWriteExt};
use tokio::{io::AsyncRead, io::AsyncReadExt, sync::mpsc};

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

#[derive(Clone, Copy, Debug)]
pub enum ContainerAction {
    Start,
    Stop,
    Restart,
    Delete,
}

impl ContainerAction {
    pub fn parse(action: &str) -> Option<Self> {
        match action {
            "start" => Some(Self::Start),
            "stop" => Some(Self::Stop),
            "restart" => Some(Self::Restart),
            "delete" | "remove" => Some(Self::Delete),
            _ => None,
        }
    }

    const fn verb(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
            Self::Delete => "rm",
        }
    }

    fn args(self, id: &str) -> Vec<String> {
        match self {
            Self::Delete => vec!["rm".to_string(), "-f".to_string(), id.to_string()],
            _ => vec![self.verb().to_string(), id.to_string()],
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ContainerActionStatus {
    pub id: String,
    pub name: Option<String>,
    pub state: Option<String>,
    pub status: Option<String>,
    pub exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContainerActionStreamEvent {
    Started {
        command: String,
    },
    Output {
        stream: &'static str,
        data: String,
    },
    Complete {
        success: bool,
        exit_code: Option<i32>,
        command: String,
        stdout: String,
        stderr: String,
        status: ContainerActionStatus,
    },
    Error {
        error: String,
        detail: String,
    },
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
        .route(
            "/docker/containers/{id}/{action}/stream",
            get(container_action_stream),
        )
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

async fn container_action_stream(
    Path((id, action)): Path<(String, String)>,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(action) = ContainerAction::parse(&action) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Unknown container action" })),
        )
            .into_response();
    };
    let docker = match get_docker_client() {
        Ok(docker) => docker,
        Err(error) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Docker client error", "detail": error.to_string() })),
            )
                .into_response();
        }
    };

    ws.on_upgrade(move |socket| stream_container_action_ws(socket, docker, id, action))
}

async fn stream_container_action_ws(
    mut socket: WebSocket,
    docker: Docker,
    id: String,
    action: ContainerAction,
) {
    let (tx, mut rx) = mpsc::unbounded_channel();
    tokio::spawn(stream_container_action(docker, id, action, tx));

    while let Some(event) = rx.recv().await {
        let Ok(text) = serde_json::to_string(&event) else {
            continue;
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            break;
        }
    }

    let _ = socket.close().await;
}

pub async fn stream_container_action(
    docker: Docker,
    id: String,
    action: ContainerAction,
    event_tx: mpsc::UnboundedSender<ContainerActionStreamEvent>,
) {
    if let Err((error, detail)) =
        stream_container_action_inner(&docker, &id, action, event_tx.clone()).await
    {
        let _ = event_tx.send(ContainerActionStreamEvent::Error { error, detail });
    }
}

async fn stream_container_action_inner(
    docker: &Docker,
    id: &str,
    action: ContainerAction,
    event_tx: mpsc::UnboundedSender<ContainerActionStreamEvent>,
) -> Result<(), (String, String)> {
    let args = action.args(id);
    let command_display = format!("docker {}", args.join(" "));
    let _ = event_tx.send(ContainerActionStreamEvent::Started {
        command: command_display.clone(),
    });

    let mut child = tokio::process::Command::new("docker")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| ("Failed to run docker".to_string(), error.to_string()))?;

    let stdout_task = child.stdout.take().map(|stdout| {
        tokio::spawn(read_container_action_output(
            stdout,
            "stdout",
            event_tx.clone(),
        ))
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        tokio::spawn(read_container_action_output(
            stderr,
            "stderr",
            event_tx.clone(),
        ))
    });

    let status = child
        .wait()
        .await
        .map_err(|error| ("Failed to wait for docker".to_string(), error.to_string()))?;
    let stdout = join_container_action_output(stdout_task).await;
    let stderr = join_container_action_output(stderr_task).await;
    let action_status = verified_container_action_status(docker, id, action).await;
    let success = status.success() || container_action_target_reached(action, &action_status);

    let _ = event_tx.send(ContainerActionStreamEvent::Complete {
        success,
        exit_code: status.code(),
        command: command_display,
        stdout,
        stderr,
        status: action_status,
    });

    Ok(())
}

async fn read_container_action_output<R>(
    mut reader: R,
    stream: &'static str,
    event_tx: mpsc::UnboundedSender<ContainerActionStreamEvent>,
) -> String
where
    R: AsyncRead + Unpin,
{
    let mut output = String::new();
    let mut buffer = [0_u8; 4096];

    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(bytes_read) => {
                let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                output.push_str(&chunk);
                let _ = event_tx.send(ContainerActionStreamEvent::Output {
                    stream,
                    data: chunk,
                });
            }
            Err(error) => {
                let _ = event_tx.send(ContainerActionStreamEvent::Output {
                    stream: "stderr",
                    data: format!("Failed to read {stream}: {error}\n"),
                });
                break;
            }
        }
    }

    output
}

async fn join_container_action_output(task: Option<tokio::task::JoinHandle<String>>) -> String {
    match task {
        Some(task) => task.await.unwrap_or_default(),
        None => String::new(),
    }
}

async fn verified_container_action_status(
    docker: &Docker,
    id: &str,
    action: ContainerAction,
) -> ContainerActionStatus {
    for attempt in 0..12 {
        let status = container_action_status(docker, id).await;
        if container_action_target_reached(action, &status) || attempt == 11 {
            return status;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }

    unreachable!()
}

async fn container_action_status(docker: &Docker, id: &str) -> ContainerActionStatus {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .unwrap_or_default();
    let normalized = id.trim_start_matches('/');

    for container in containers {
        let container_id = container.id.unwrap_or_default();
        let names = container.names.unwrap_or_default();
        let matches_id = container_id == normalized || container_id.starts_with(normalized);
        let matches_name = names
            .iter()
            .any(|name| name.trim_start_matches('/') == normalized);
        if matches_id || matches_name {
            return ContainerActionStatus {
                id: container_id,
                name: names
                    .first()
                    .map(|name| name.trim_start_matches('/').to_string()),
                state: container.state,
                status: container.status,
                exists: true,
            };
        }
    }

    ContainerActionStatus {
        id: id.to_string(),
        name: None,
        state: None,
        status: None,
        exists: false,
    }
}

fn container_action_target_reached(
    action: ContainerAction,
    status: &ContainerActionStatus,
) -> bool {
    match action {
        ContainerAction::Start | ContainerAction::Restart => {
            status.exists && status.state.as_deref() == Some("running")
        }
        ContainerAction::Stop => status.exists && status.state.as_deref() != Some("running"),
        ContainerAction::Delete => !status.exists,
    }
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
