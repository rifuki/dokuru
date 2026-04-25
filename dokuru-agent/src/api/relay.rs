use std::{collections::HashMap, pin::Pin, sync::Arc};

use base64::{Engine as _, engine::general_purpose};
use bollard::{
    Docker,
    container::LogOutput,
    exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults},
    system::EventsOptions,
};
use eyre::{Result, WrapErr};
use futures_util::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncWrite, AsyncWriteExt},
    net::TcpStream,
    sync::{Mutex, mpsc},
    task::JoinHandle,
};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::{
    api::Config,
    api::relay_docker,
    audit::{FixRequest, RuleRegistry},
};

const RELAY_SERVER: &str = "wss://api.dokuru.rifuki.dev/ws/agent";

type RelaySocket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type RelayWriter = SplitSink<RelaySocket, Message>;
type RelayReader = SplitStream<RelaySocket>;
type ActiveStreams = Arc<Mutex<HashMap<String, mpsc::UnboundedSender<StreamInput>>>>;
type ExecOutput = futures_util::stream::BoxStream<
    'static,
    std::result::Result<LogOutput, bollard::errors::Error>,
>;
type ExecInput = Pin<Box<dyn AsyncWrite + Send>>;

enum StreamInput {
    Data(Vec<u8>),
    Close,
}

/// WebSocket message types (must match server)
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsMessage {
    Auth {
        token: String,
    },
    AuthSuccess {
        agent_id: String,
    },
    AuthFailed {
        reason: String,
    },
    Command {
        id: String,
        command: String,
        payload: serde_json::Value,
    },
    Response {
        id: String,
        success: bool,
        data: serde_json::Value,
    },
    StreamOpen {
        id: String,
        stream: String,
        payload: serde_json::Value,
    },
    StreamData {
        id: String,
        data: String,
    },
    StreamClose {
        id: String,
        reason: Option<String>,
    },
    Ping,
    Pong,
}

#[derive(Debug, Deserialize)]
struct ExecStreamPayload {
    container_id: String,
    rows: Option<u16>,
    cols: Option<u16>,
    shell: Option<String>,
}

/// Start relay mode - connect to server via WebSocket
pub async fn start_relay_mode(config: Config) -> Result<()> {
    info!("Starting relay mode, connecting to {}", RELAY_SERVER);
    let token = relay_token(config)?;

    reconnect_loop(&token).await
}

fn relay_token(config: Config) -> Result<String> {
    config.auth.relay_token.ok_or_else(|| {
        eyre::eyre!(
            "No relay token configured. Please set relay_token in config or run onboarding."
        )
    })
}

async fn reconnect_loop(token: &str) -> Result<()> {
    loop {
        match connect_and_run(token).await {
            Ok(()) => {
                info!("Relay connection closed normally");
                break;
            }
            Err(e) => {
                error!("Relay connection error: {}", e);
                warn!("Reconnecting in 2 seconds...");
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
    }

    Ok(())
}

async fn connect_and_run(token: &str) -> Result<()> {
    let (ws_stream, _) = connect_async(RELAY_SERVER)
        .await
        .wrap_err("Failed to connect to relay server")?;

    info!("Connected to relay server");

    let (mut write, mut read) = ws_stream.split();
    authenticate_relay(&mut write, &mut read, token).await?;

    let (tx, rx) = mpsc::unbounded_channel::<Message>();
    let write_task = spawn_writer(write, rx);
    let keepalive_task = spawn_keepalive(tx.clone());
    let streams = Arc::new(Mutex::new(HashMap::new()));

    relay_read_loop(&mut read, &tx, streams.clone()).await;

    close_active_streams(streams).await;
    keepalive_task.abort();
    write_task.abort();
    Ok(())
}

async fn authenticate_relay(
    write: &mut RelayWriter,
    read: &mut RelayReader,
    token: &str,
) -> Result<()> {
    let auth_msg = serde_json::to_string(&WsMessage::Auth {
        token: token.to_string(),
    })?;
    write.send(Message::Text(auth_msg)).await?;

    match read.next().await {
        Some(Ok(Message::Text(text))) => {
            let agent_id = parse_auth_response(&text)?;
            info!("Authenticated as agent {}", agent_id);
            Ok(())
        }
        _ => Err(eyre::eyre!("Connection closed during auth")),
    }
}

fn parse_auth_response(text: &str) -> Result<String> {
    match serde_json::from_str(text)? {
        WsMessage::AuthSuccess { agent_id } => Ok(agent_id),
        WsMessage::AuthFailed { reason } => Err(eyre::eyre!("Authentication failed: {reason}")),
        _ => Err(eyre::eyre!("Unexpected auth response")),
    }
}

fn spawn_writer(
    mut write: RelayWriter,
    mut rx: mpsc::UnboundedReceiver<Message>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    })
}

fn spawn_keepalive(tx: mpsc::UnboundedSender<Message>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            if tx.send(Message::Ping(vec![])).is_err() {
                break;
            }
        }
    })
}

async fn relay_read_loop(
    read: &mut RelayReader,
    tx: &mpsc::UnboundedSender<Message>,
    streams: ActiveStreams,
) {
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_message(&text, tx, streams.clone()).await {
                    error!("Error handling message: {}", e);
                }
            }
            Ok(Message::Ping(_)) => {
                let _ = tx.send(Message::Pong(vec![]));
            }
            Ok(Message::Close(_)) => {
                info!("Server closed connection");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }
}

async fn close_active_streams(streams: ActiveStreams) {
    let active = streams
        .lock()
        .await
        .drain()
        .map(|(_, sender)| sender)
        .collect::<Vec<_>>();

    for sender in active {
        let _ = sender.send(StreamInput::Close);
    }
}

async fn handle_message(
    text: &str,
    tx: &mpsc::UnboundedSender<Message>,
    streams: ActiveStreams,
) -> Result<()> {
    let msg: WsMessage = serde_json::from_str(text)?;

    match msg {
        WsMessage::Command {
            id,
            command,
            payload,
        } => {
            info!("Received command: {} (id: {})", command, id);

            let response = match execute_command(&command, payload).await {
                Ok(data) => WsMessage::Response {
                    id,
                    success: true,
                    data,
                },
                Err(error) => WsMessage::Response {
                    id,
                    success: false,
                    data: serde_json::json!({ "error": error.to_string() }),
                },
            };

            queue_ws_message(tx, &response)?;
        }
        WsMessage::StreamOpen {
            id,
            stream,
            payload,
        } => {
            start_stream(id, stream, payload, tx.clone(), streams).await?;
        }
        WsMessage::StreamData { id, data } => {
            let data = general_purpose::STANDARD
                .decode(data)
                .wrap_err("Invalid relay stream data")?;
            let sender = streams.lock().await.get(&id).cloned();
            if let Some(sender) = sender {
                let _ = sender.send(StreamInput::Data(data));
            }
        }
        WsMessage::StreamClose { id, .. } => {
            let sender = streams.lock().await.remove(&id);
            if let Some(sender) = sender {
                let _ = sender.send(StreamInput::Close);
            }
        }
        WsMessage::Ping => {
            queue_ws_message(tx, &WsMessage::Pong)?;
        }
        _ => {}
    }

    Ok(())
}

fn queue_ws_message(tx: &mpsc::UnboundedSender<Message>, message: &WsMessage) -> Result<()> {
    tx.send(Message::Text(serde_json::to_string(message)?))
        .map_err(|_| eyre::eyre!("Relay writer closed"))
}

async fn start_stream(
    id: String,
    stream: String,
    payload: serde_json::Value,
    tx: mpsc::UnboundedSender<Message>,
    streams: ActiveStreams,
) -> Result<()> {
    let (input_tx, input_rx) = mpsc::unbounded_channel();
    streams.lock().await.insert(id.clone(), input_tx);

    tokio::spawn(async move {
        let result = execute_stream(&stream, payload, input_rx, &tx, &id).await;
        streams.lock().await.remove(&id);
        let reason = result.err().map(|error| error.to_string());
        let _ = queue_ws_message(&tx, &WsMessage::StreamClose { id, reason });
    });

    Ok(())
}

async fn execute_stream(
    stream: &str,
    payload: serde_json::Value,
    input_rx: mpsc::UnboundedReceiver<StreamInput>,
    tx: &mpsc::UnboundedSender<Message>,
    id: &str,
) -> Result<()> {
    match stream {
        "docker_exec" => docker_exec_stream(payload, input_rx, tx, id).await,
        "docker_events" => docker_events_stream(input_rx, tx, id).await,
        _ => Err(eyre::eyre!("Unknown stream: {stream}")),
    }
}

fn send_stream_data(tx: &mpsc::UnboundedSender<Message>, id: &str, data: Vec<u8>) -> Result<()> {
    queue_ws_message(
        tx,
        &WsMessage::StreamData {
            id: id.to_string(),
            data: general_purpose::STANDARD.encode(data),
        },
    )
}

async fn docker_events_stream(
    mut input_rx: mpsc::UnboundedReceiver<StreamInput>,
    tx: &mpsc::UnboundedSender<Message>,
    id: &str,
) -> Result<()> {
    let docker = crate::docker::get_docker_client()?;
    let mut events = docker.events(None::<EventsOptions<String>>);

    loop {
        tokio::select! {
            input = input_rx.recv() => {
                match input {
                    Some(StreamInput::Close) | None => break,
                    Some(StreamInput::Data(_)) => {}
                }
            }
            event = events.next() => {
                let Some(event) = event else { break };
                let event = event.wrap_err("Failed to read Docker event")?;
                let event_type = event.typ.map(|typ| format!("{typ:?}")).unwrap_or_default();
                let actor_id = event
                    .actor
                    .as_ref()
                    .and_then(|actor| actor.id.clone())
                    .unwrap_or_default();
                let attributes = event
                    .actor
                    .as_ref()
                    .and_then(|actor| actor.attributes.clone())
                    .unwrap_or_else(HashMap::new);

                let payload = serde_json::to_vec(&serde_json::json!({
                    "type": event_type,
                    "action": event.action.unwrap_or_default(),
                    "actor": {
                        "id": actor_id,
                        "attributes": attributes,
                    },
                    "time": event.time.unwrap_or_default(),
                }))?;
                send_stream_data(tx, id, payload)?;
            }
        }
    }

    Ok(())
}

async fn docker_exec_stream(
    payload: serde_json::Value,
    mut input_rx: mpsc::UnboundedReceiver<StreamInput>,
    tx: &mpsc::UnboundedSender<Message>,
    id: &str,
) -> Result<()> {
    let payload = serde_json::from_value::<ExecStreamPayload>(payload)
        .wrap_err("Invalid docker exec stream payload")?;
    let docker = Arc::new(crate::docker::get_docker_client()?);
    let (exec_id, mut output, mut input) = setup_exec(
        &docker,
        &payload.container_id,
        payload.shell,
        payload.rows.unwrap_or(24),
        payload.cols.unwrap_or(80),
    )
    .await?;

    loop {
        tokio::select! {
            output = output.next() => {
                match output {
                    Some(Ok(output)) => send_stream_data(tx, id, output.into_bytes().to_vec())?,
                    Some(Err(error)) => return Err(error).wrap_err("Failed to read exec output"),
                    None => break,
                }
            }
            input_event = input_rx.recv() => {
                match input_event {
                    Some(StreamInput::Data(data)) => {
                        handle_exec_input(data, &mut input, &docker, &exec_id).await?;
                    }
                    Some(StreamInput::Close) | None => break,
                }
            }
        }
    }

    Ok(())
}

async fn setup_exec(
    docker: &Docker,
    container_id: &str,
    preferred_shell: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(String, ExecOutput, ExecInput)> {
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
        .wrap_err("Failed to create Docker exec")?;
    let exec_id = exec.id;

    let StartExecResults::Attached { output, input } = docker
        .start_exec(
            &exec_id,
            Some(StartExecOptions {
                detach: false,
                tty: true,
                output_capacity: None,
            }),
        )
        .await
        .wrap_err("Failed to start Docker exec")?
    else {
        return Err(eyre::eyre!("Docker exec did not attach"));
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

    Ok((exec_id, output, input))
}

async fn resolve_shell(
    docker: &Docker,
    container_id: &str,
    preferred_shell: Option<String>,
) -> String {
    if let Some(shell) = preferred_shell
        && !shell.is_empty()
    {
        return shell;
    }

    for candidate in ["/bin/bash", "/bin/sh"] {
        let probe = docker
            .create_exec(
                container_id,
                CreateExecOptions::<String> {
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(false),
                    cmd: Some(vec![
                        "test".to_owned(),
                        "-f".to_owned(),
                        candidate.to_owned(),
                    ]),
                    ..Default::default()
                },
            )
            .await;

        if let Ok(exec) = probe
            && let Ok(StartExecResults::Attached { mut output, .. }) = docker
                .start_exec(
                    &exec.id,
                    Some(StartExecOptions {
                        detach: false,
                        tty: false,
                        output_capacity: None,
                    }),
                )
                .await
        {
            while output.next().await.is_some() {}
            if docker
                .inspect_exec(&exec.id)
                .await
                .ok()
                .and_then(|info| info.exit_code)
                == Some(0)
            {
                return candidate.to_string();
            }
        }
    }

    "/bin/sh".to_string()
}

async fn handle_exec_input(
    data: Vec<u8>,
    input: &mut ExecInput,
    docker: &Docker,
    exec_id: &str,
) -> Result<()> {
    if let Ok(text) = std::str::from_utf8(&data)
        && let Ok(json) = serde_json::from_str::<serde_json::Value>(text)
        && json.get("type").and_then(serde_json::Value::as_str) == Some("resize")
    {
        handle_exec_resize(json, docker, exec_id).await;
        return Ok(());
    }

    input
        .write_all(&data)
        .await
        .wrap_err("Failed to write exec input")?;
    input.flush().await.wrap_err("Failed to flush exec input")
}

async fn handle_exec_resize(json: serde_json::Value, docker: &Docker, exec_id: &str) {
    if let (Some(cols), Some(rows)) = (json["cols"].as_u64(), json["rows"].as_u64()) {
        let _ = docker
            .resize_exec(
                exec_id,
                ResizeExecOptions {
                    height: u16::try_from(rows).unwrap_or(24),
                    width: u16::try_from(cols).unwrap_or(80),
                },
            )
            .await;
    }
}

async fn execute_command(command: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
    match command {
        "health" => Ok(serde_json::json!({ "status": "healthy" })),
        "audit" => {
            let docker = bollard::Docker::connect_with_local_defaults()
                .wrap_err("Failed to connect to local Docker daemon")?;
            let registry = RuleRegistry::new();
            let report = registry.run_audit(&docker).await?;
            serde_json::to_value(report).wrap_err("Failed to serialize audit report")
        }
        "fix" => {
            let payload = serde_json::from_value::<FixRequest>(payload)
                .wrap_err("Invalid fix command payload")?;
            let docker = bollard::Docker::connect_with_local_defaults()
                .wrap_err("Failed to connect to local Docker daemon")?;
            let registry = RuleRegistry::new();
            let outcome = registry.fix_request(&payload, &docker).await?;
            serde_json::to_value(outcome).wrap_err("Failed to serialize fix outcome")
        }
        "docker" => relay_docker::execute(payload).await,
        _ => Err(eyre::eyre!("Unknown command: {}", command)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_auth_response_accepts_success() {
        let agent_id = parse_auth_response(r#"{"type":"auth_success","agent_id":"agent-1"}"#);

        assert_eq!(agent_id.unwrap(), "agent-1");
    }

    #[test]
    fn parse_auth_response_rejects_auth_failure() {
        let error = parse_auth_response(r#"{"type":"auth_failed","reason":"bad token"}"#)
            .unwrap_err()
            .to_string();

        assert!(error.contains("bad token"));
    }
}
