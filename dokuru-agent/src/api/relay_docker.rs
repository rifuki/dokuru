use std::{collections::HashMap, path::PathBuf};

use bollard::{
    Docker,
    container::{
        ListContainersOptions, LogsOptions, RemoveContainerOptions, StartContainerOptions,
        StatsOptions,
    },
    exec::{CreateExecOptions, StartExecOptions},
    image::{CreateImageOptions, ListImagesOptions, PruneImagesOptions, RemoveImageOptions},
    models::HistoryResponseItem,
    network::ListNetworksOptions,
    volume::{ListVolumesOptions, PruneVolumesOptions},
};
use eyre::{Result, WrapErr, eyre};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::docker::{self, containers::ContainerResponse};

const COMPOSE_FILENAMES: &[&str] = &[
    "compose.yaml",
    "docker-compose.yaml",
    "docker-compose.yml",
    "compose.yml",
];

#[derive(Debug, Deserialize)]
pub struct DockerCommandPayload {
    method: String,
    path: String,
    #[serde(default)]
    query: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct DockerCommandResponse {
    status: u16,
    data: Option<Value>,
}

#[derive(Serialize)]
struct ImageResponse {
    id: String,
    repo_tags: Vec<String>,
    size: i64,
    created: i64,
}

#[derive(Serialize)]
struct NetworkResponse {
    id: String,
    name: String,
    driver: String,
    scope: String,
}

#[derive(Serialize)]
struct VolumeResponse {
    name: String,
    driver: String,
    mountpoint: String,
}

#[derive(Serialize)]
struct StackContainer {
    id: String,
    name: String,
    image: String,
    state: String,
    status: String,
    service: String,
}

#[derive(Serialize)]
struct StackResponse {
    name: String,
    working_dir: Option<String>,
    config_file: Option<String>,
    containers: Vec<StackContainer>,
    running: usize,
    total: usize,
}

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
#[serde(rename_all = "PascalCase")]
struct ComposeLsEntry {
    name: String,
    config_files: String,
}

pub async fn execute(payload: Value) -> Result<Value> {
    let payload = serde_json::from_value::<DockerCommandPayload>(payload)
        .wrap_err("Invalid docker command payload")?;
    let docker = docker::get_docker_client()?;
    let response = route(&docker, &payload).await?;

    serde_json::to_value(response).wrap_err("Failed to serialize docker command response")
}

async fn route(docker: &Docker, payload: &DockerCommandPayload) -> Result<DockerCommandResponse> {
    let method = payload.method.to_ascii_uppercase();
    let segments: Vec<&str> = payload
        .path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    match segments.as_slice() {
        ["docker", "containers"] if method == "GET" => list_containers(docker, payload).await,
        ["docker", "containers", id] if method == "GET" => inspect_container(docker, id).await,
        ["docker", "containers", id] if method == "DELETE" => remove_container(docker, id).await,
        ["docker", "containers", id, "start"] if method == "POST" => {
            start_container(docker, id).await
        }
        ["docker", "containers", id, "stop"] if method == "POST" => {
            stop_container(docker, id).await
        }
        ["docker", "containers", id, "restart"] if method == "POST" => {
            restart_container(docker, id).await
        }
        ["docker", "containers", id, "logs"] if method == "GET" => container_logs(docker, id).await,
        ["docker", "containers", id, "stats"] if method == "GET" => {
            container_stats(docker, id).await
        }
        ["docker", "containers", id, "shell"] if method == "GET" => detect_shell(docker, id).await,

        ["docker", "images"] if method == "GET" => list_images(docker, payload).await,
        ["docker", "images", "pull"] if method == "POST" => pull_image(docker, payload).await,
        ["docker", "images", "prune"] if method == "POST" => prune_images(docker).await,
        ["docker", "images", id] if method == "GET" => inspect_image(docker, id).await,
        ["docker", "images", id] if method == "DELETE" => remove_image(docker, id).await,
        ["docker", "images", id, "history"] if method == "GET" => image_history(docker, id).await,

        ["docker", "networks"] if method == "GET" => list_networks(docker).await,
        ["docker", "networks", id] if method == "GET" => inspect_network(docker, id).await,
        ["docker", "networks", id] if method == "DELETE" => remove_network(docker, id).await,

        ["docker", "volumes"] if method == "GET" => list_volumes(docker).await,
        ["docker", "volumes", name] if method == "GET" => inspect_volume(docker, name).await,
        ["docker", "volumes", name] if method == "DELETE" => remove_volume(docker, name).await,
        ["docker", "volumes", "prune"] if method == "POST" => prune_volumes(docker).await,

        ["docker", "stacks"] if method == "GET" => list_stacks(docker).await,
        ["docker", "stacks", name] if method == "GET" => get_stack(docker, name).await,
        ["docker", "stacks", name, "compose"] if method == "GET" => {
            get_compose_file(docker, name).await
        }

        _ => Ok(json_response(
            404,
            serde_json::json!({ "error": "Unsupported relay docker operation" }),
        )),
    }
}

async fn list_containers(
    docker: &Docker,
    payload: &DockerCommandPayload,
) -> Result<DockerCommandResponse> {
    let options = Some(ListContainersOptions::<String> {
        all: query_bool(payload, "all").unwrap_or(false),
        ..Default::default()
    });

    let containers = docker
        .list_containers(options)
        .await
        .wrap_err("Failed to list containers")?;

    let response: Vec<ContainerResponse> = containers
        .into_iter()
        .map(|container| ContainerResponse {
            id: container.id.unwrap_or_default(),
            names: container.names.unwrap_or_default(),
            image: container.image.unwrap_or_default(),
            state: container.state.unwrap_or_default(),
            status: container.status.unwrap_or_default(),
            created: container.created.unwrap_or_default(),
        })
        .collect();

    json_ok(response)
}

async fn inspect_container(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    match docker.inspect_container(id, None).await {
        Ok(container) => json_ok(container),
        Err(error) => Ok(json_response(
            404,
            serde_json::json!({ "error": error.to_string() }),
        )),
    }
}

async fn start_container(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .start_container(id, None::<StartContainerOptions<String>>)
        .await
        .wrap_err("Failed to start container")?;
    Ok(empty_response(204))
}

async fn stop_container(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .stop_container(id, None)
        .await
        .wrap_err("Failed to stop container")?;
    Ok(empty_response(204))
}

async fn restart_container(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .restart_container(id, None)
        .await
        .wrap_err("Failed to restart container")?;
    Ok(empty_response(204))
}

async fn remove_container(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .remove_container(
            id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await
        .wrap_err("Failed to remove container")?;
    Ok(empty_response(204))
}

async fn container_logs(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    let options = Some(LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: "100".to_string(),
        ..Default::default()
    });
    let mut stream = docker.logs(id, options);
    let mut logs = Vec::new();

    while let Some(output) = stream.next().await {
        if let Ok(line) = output {
            logs.push(line.to_string());
        }
    }

    json_ok(logs)
}

async fn container_stats(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    let options = Some(StatsOptions {
        stream: false,
        ..Default::default()
    });
    let mut stream = docker.stats(id, options);

    match stream.next().await {
        Some(Ok(stats)) => json_ok(stats),
        Some(Err(error)) => Ok(json_response(
            500,
            serde_json::json!({ "error": error.to_string() }),
        )),
        None => Ok(json_response(
            500,
            serde_json::json!({ "error": "No stats returned" }),
        )),
    }
}

async fn detect_shell(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    let shell = resolve_shell(docker, id).await;
    json_ok(serde_json::json!({ "shell": shell }))
}

async fn resolve_shell(docker: &Docker, container_id: &str) -> String {
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
            && let Ok(bollard::exec::StartExecResults::Attached { mut output, .. }) = docker
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

async fn list_images(
    docker: &Docker,
    payload: &DockerCommandPayload,
) -> Result<DockerCommandResponse> {
    let options = Some(ListImagesOptions::<String> {
        all: query_bool(payload, "all").unwrap_or(false),
        ..Default::default()
    });

    let images = docker
        .list_images(options)
        .await
        .wrap_err("Failed to list images")?;

    let response: Vec<ImageResponse> = images
        .into_iter()
        .map(|image| ImageResponse {
            id: image.id,
            repo_tags: image.repo_tags,
            size: image.size,
            created: image.created,
        })
        .collect();

    json_ok(response)
}

async fn inspect_image(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    match docker.inspect_image(id).await {
        Ok(image) => json_ok(image),
        Err(error) => Ok(json_response(
            404,
            serde_json::json!({ "error": error.to_string() }),
        )),
    }
}

async fn image_history(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    match docker.image_history(id).await {
        Ok(history) => json_ok::<Vec<HistoryResponseItem>>(history),
        Err(error) => Ok(json_response(
            404,
            serde_json::json!({ "error": error.to_string() }),
        )),
    }
}

async fn remove_image(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .remove_image(
            id,
            Some(RemoveImageOptions {
                force: true,
                ..Default::default()
            }),
            None,
        )
        .await
        .wrap_err("Failed to remove image")?;
    Ok(empty_response(204))
}

async fn pull_image(
    docker: &Docker,
    payload: &DockerCommandPayload,
) -> Result<DockerCommandResponse> {
    let from_image = payload
        .query
        .get("from_image")
        .ok_or_else(|| eyre!("Missing from_image query parameter"))?
        .clone();
    let tag = payload
        .query
        .get("tag")
        .cloned()
        .unwrap_or_else(|| "latest".to_string());
    let options = Some(CreateImageOptions {
        from_image,
        tag,
        ..Default::default()
    });
    let mut stream = docker.create_image(options, None, None);

    while let Some(result) = stream.next().await {
        result.wrap_err("Failed to pull image")?;
    }

    Ok(empty_response(200))
}

async fn prune_images(docker: &Docker) -> Result<DockerCommandResponse> {
    let result = docker
        .prune_images(None::<PruneImagesOptions<String>>)
        .await
        .wrap_err("Failed to prune images")?;
    json_ok(result)
}

async fn list_networks(docker: &Docker) -> Result<DockerCommandResponse> {
    let networks = docker
        .list_networks(None::<ListNetworksOptions<String>>)
        .await
        .wrap_err("Failed to list networks")?;

    let response: Vec<NetworkResponse> = networks
        .into_iter()
        .map(|network| NetworkResponse {
            id: network.id.unwrap_or_default(),
            name: network.name.unwrap_or_default(),
            driver: network.driver.unwrap_or_default(),
            scope: network.scope.unwrap_or_default(),
        })
        .collect();

    json_ok(response)
}

async fn inspect_network(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    match docker.inspect_network::<String>(id, None).await {
        Ok(network) => json_ok(network),
        Err(error) => Ok(json_response(
            404,
            serde_json::json!({ "error": error.to_string() }),
        )),
    }
}

async fn remove_network(docker: &Docker, id: &str) -> Result<DockerCommandResponse> {
    docker
        .remove_network(id)
        .await
        .wrap_err("Failed to remove network")?;
    Ok(empty_response(204))
}

async fn list_volumes(docker: &Docker) -> Result<DockerCommandResponse> {
    let result = docker
        .list_volumes(None::<ListVolumesOptions<String>>)
        .await
        .wrap_err("Failed to list volumes")?;

    let response: Vec<VolumeResponse> = result
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|volume| VolumeResponse {
            name: volume.name,
            driver: volume.driver,
            mountpoint: volume.mountpoint,
        })
        .collect();

    json_ok(response)
}

async fn inspect_volume(docker: &Docker, name: &str) -> Result<DockerCommandResponse> {
    match docker.inspect_volume(name).await {
        Ok(volume) => json_ok(volume),
        Err(error) => Ok(json_response(
            404,
            serde_json::json!({ "error": error.to_string() }),
        )),
    }
}

async fn remove_volume(docker: &Docker, name: &str) -> Result<DockerCommandResponse> {
    docker
        .remove_volume(name, None)
        .await
        .wrap_err("Failed to remove volume")?;
    Ok(empty_response(204))
}

async fn prune_volumes(docker: &Docker) -> Result<DockerCommandResponse> {
    let result = docker
        .prune_volumes(None::<PruneVolumesOptions<String>>)
        .await
        .wrap_err("Failed to prune volumes")?;
    json_ok(result)
}

async fn list_stacks(docker: &Docker) -> Result<DockerCommandResponse> {
    let stacks = collect_stacks(docker).await?;
    json_ok(stacks)
}

async fn get_stack(docker: &Docker, name: &str) -> Result<DockerCommandResponse> {
    let stack = collect_stacks(docker)
        .await?
        .into_iter()
        .find(|stack| stack.name == name);

    stack.map_or_else(
        || {
            Ok(json_response(
                404,
                serde_json::json!({ "error": "Stack not found" }),
            ))
        },
        json_ok,
    )
}

async fn collect_stacks(docker: &Docker) -> Result<Vec<StackResponse>> {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .wrap_err("Failed to list containers for stacks")?;

    let mut stacks: HashMap<String, StackResponse> = HashMap::new();

    for container in &containers {
        let Some(labels) = container.labels.as_ref() else {
            continue;
        };
        let Some(project) = labels.get("com.docker.compose.project").cloned() else {
            continue;
        };

        let state = container.state.as_deref().unwrap_or("").to_string();
        let is_running = state == "running";
        let stack_container = StackContainer {
            id: container.id.as_deref().unwrap_or("").to_string(),
            name: container
                .names
                .as_deref()
                .and_then(|names| names.first())
                .map(|name| name.trim_start_matches('/').to_string())
                .unwrap_or_default(),
            image: container.image.as_deref().unwrap_or("").to_string(),
            state: state.clone(),
            status: container.status.as_deref().unwrap_or("").to_string(),
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
        entry.containers.push(stack_container);
    }

    let mut result: Vec<StackResponse> = stacks.into_values().collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

async fn get_compose_file(docker: &Docker, name: &str) -> Result<DockerCommandResponse> {
    if let Some(entry) = compose_ls()
        .await
        .and_then(|list| list.into_iter().find(|entry| entry.name == name))
    {
        for raw in entry.config_files.split(',') {
            let path = PathBuf::from(raw.trim());
            match tokio::fs::read_to_string(&path).await {
                Ok(content) => {
                    return json_ok(ComposeFileResponse {
                        path: path.to_string_lossy().into_owned(),
                        content,
                    });
                }
                Err(error) => warn!("compose ls path {}: {error}", path.display()),
            }
        }
    }

    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .wrap_err("Failed to list containers for compose lookup")?;
    let working_dir = containers.iter().find_map(|container| {
        let labels = container.labels.as_ref()?;
        if labels.get("com.docker.compose.project")?.as_str() != name {
            return None;
        }
        labels
            .get("com.docker.compose.project.working_dir")
            .cloned()
    });
    let Some(working_dir) = working_dir else {
        return json_status(
            422,
            ComposeErrorResponse {
                error: "Stack not found".to_string(),
                detail: format!("No container found for stack '{name}'"),
            },
        );
    };

    let base = PathBuf::from(&working_dir);
    let mut tried = Vec::new();
    for filename in COMPOSE_FILENAMES {
        let path = base.join(filename);
        match tokio::fs::read_to_string(&path).await {
            Ok(content) => {
                return json_ok(ComposeFileResponse {
                    path: path.to_string_lossy().into_owned(),
                    content,
                });
            }
            Err(error) => tried.push(format!("{}: {error}", path.display())),
        }
    }

    json_status(
        422,
        ComposeErrorResponse {
            error: format!("Could not read compose file for stack '{name}'"),
            detail: tried.join("\n"),
        },
    )
}

async fn compose_ls() -> Option<Vec<ComposeLsEntry>> {
    let output = tokio::process::Command::new("docker")
        .args(["compose", "ls", "--all", "--format", "json"])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    serde_json::from_slice(&output.stdout).ok()
}

fn query_bool(payload: &DockerCommandPayload, key: &str) -> Option<bool> {
    payload
        .query
        .get(key)
        .and_then(|value| match value.as_str() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        })
}

const fn empty_response(status: u16) -> DockerCommandResponse {
    DockerCommandResponse { status, data: None }
}

const fn json_response(status: u16, data: Value) -> DockerCommandResponse {
    DockerCommandResponse {
        status,
        data: Some(data),
    }
}

fn json_ok<T: Serialize>(data: T) -> Result<DockerCommandResponse> {
    json_status(200, data)
}

fn json_status<T: Serialize>(status: u16, data: T) -> Result<DockerCommandResponse> {
    Ok(DockerCommandResponse {
        status,
        data: Some(serde_json::to_value(data)?),
    })
}
