use std::{
    collections::{HashMap, HashSet},
    path::{Path as FsPath, PathBuf},
};

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
    system::EventsOptions,
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
    #[serde(default)]
    body: Option<Value>,
}

#[derive(Debug, Serialize)]
struct DockerCommandResponse {
    status: u16,
    data: Option<Value>,
}

#[derive(Serialize)]
struct ContainerStatsResponse {
    total: usize,
    running: usize,
    stopped: usize,
    healthy: usize,
    unhealthy: usize,
}

#[derive(Serialize)]
struct EnvironmentInfoResponse {
    docker_version: String,
    api_version: Option<String>,
    os: String,
    architecture: String,
    hostname: Option<String>,
    kernel_version: Option<String>,
    docker_root_dir: Option<String>,
    storage_driver: Option<String>,
    logging_driver: Option<String>,
    containers: ContainerStatsResponse,
    stacks: usize,
    volumes: usize,
    images: usize,
    networks: usize,
    cpu_count: i64,
    memory_total: i64,
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

#[derive(Debug, Serialize)]
struct ComposeFileResponse {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct UpdateComposeFileRequest {
    content: String,
}

#[derive(Debug, Serialize)]
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
        ["docker", "info"] if method == "GET" => docker_info(docker).await,
        ["docker", "events"] if method == "GET" => docker_events(docker, payload).await,

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
        ["docker", "stacks", name, "compose"] if method == "PUT" => {
            update_compose_file(docker, name, payload).await
        }

        _ => Ok(json_response(
            404,
            serde_json::json!({ "error": "Unsupported relay docker operation" }),
        )),
    }
}

async fn docker_info(docker: &Docker) -> Result<DockerCommandResponse> {
    let sys = docker.info().await.wrap_err("Failed to get Docker info")?;
    let all_containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .wrap_err("Failed to list containers for Docker info")?;

    let mut running = 0usize;
    let mut stopped = 0usize;
    let mut healthy = 0usize;
    let mut unhealthy = 0usize;
    let mut stack_names = HashSet::new();

    for container in &all_containers {
        match container.state.as_deref().unwrap_or("") {
            "running" => running += 1,
            "exited" | "stopped" => stopped += 1,
            _ => {}
        }

        let status = container.status.as_deref().unwrap_or("");
        if status.contains("unhealthy") {
            unhealthy += 1;
        } else if status.contains("healthy") {
            healthy += 1;
        }

        if let Some(labels) = &container.labels
            && let Some(project) = labels.get("com.docker.compose.project")
        {
            stack_names.insert(project.clone());
        }
    }

    let volumes = docker
        .list_volumes::<String>(None)
        .await
        .wrap_err("Failed to list volumes for Docker info")?
        .volumes
        .unwrap_or_default()
        .len();
    let images = docker
        .list_images(Some(ListImagesOptions::<String> {
            all: false,
            filters: HashMap::new(),
            ..Default::default()
        }))
        .await
        .wrap_err("Failed to list images for Docker info")?
        .len();
    let networks = docker
        .list_networks::<String>(None)
        .await
        .wrap_err("Failed to list networks for Docker info")?
        .len();
    let api_version = docker
        .version()
        .await
        .ok()
        .and_then(|version| version.api_version);

    json_ok(EnvironmentInfoResponse {
        docker_version: sys.server_version.unwrap_or_else(|| "unknown".to_string()),
        api_version,
        os: sys
            .operating_system
            .unwrap_or_else(|| "unknown".to_string()),
        architecture: sys.architecture.unwrap_or_else(|| "unknown".to_string()),
        hostname: sys.name,
        kernel_version: sys.kernel_version,
        docker_root_dir: sys.docker_root_dir,
        storage_driver: sys.driver,
        logging_driver: sys.logging_driver,
        containers: ContainerStatsResponse {
            total: all_containers.len(),
            running,
            stopped,
            healthy,
            unhealthy,
        },
        stacks: stack_names.len(),
        volumes,
        images,
        networks,
        cpu_count: sys.ncpu.unwrap_or(0),
        memory_total: sys.mem_total.unwrap_or(0),
    })
}

async fn docker_events(
    docker: &Docker,
    payload: &DockerCommandPayload,
) -> Result<DockerCommandResponse> {
    let options = Some(EventsOptions::<String> {
        since: payload.query.get("since").cloned(),
        until: payload.query.get("until").cloned(),
        ..Default::default()
    });
    let mut stream = docker.events(options);
    let mut events = Vec::new();

    while let Some(event) = stream.next().await {
        if events.len() >= 100 {
            break;
        }

        let event = match event {
            Ok(event) => event,
            Err(error) => {
                return Ok(json_response(
                    500,
                    serde_json::json!({ "error": error.to_string() }),
                ));
            }
        };
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

        events.push(serde_json::json!({
            "type": event_type,
            "action": event.action.unwrap_or_default(),
            "actor": {
                "id": actor_id,
                "attributes": attributes,
            },
            "time": event.time.unwrap_or_default(),
        }));
    }

    json_ok(events)
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

async fn resolve_compose_file(
    docker: &Docker,
    name: &str,
) -> Result<(PathBuf, String), ComposeErrorResponse> {
    if let Some(entry) = compose_ls()
        .await
        .and_then(|list| list.into_iter().find(|entry| entry.name == name))
    {
        for raw in entry.config_files.split(',') {
            let path = PathBuf::from(raw.trim());
            match tokio::fs::read_to_string(&path).await {
                Ok(content) => {
                    return Ok((path, content));
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
        .map_err(|error| ComposeErrorResponse {
            error: "Failed to list containers for compose lookup".to_string(),
            detail: error.to_string(),
        })?;
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
            Err(error) => tried.push(format!("{}: {error}", path.display())),
        }
    }

    Err(ComposeErrorResponse {
        error: format!("Could not read compose file for stack '{name}'"),
        detail: tried.join("\n"),
    })
}

async fn get_compose_file(docker: &Docker, name: &str) -> Result<DockerCommandResponse> {
    match resolve_compose_file(docker, name).await {
        Ok((path, content)) => json_ok(ComposeFileResponse {
            path: path.to_string_lossy().into_owned(),
            content,
        }),
        Err(error) => json_status(422, error),
    }
}

async fn update_compose_file(
    docker: &Docker,
    name: &str,
    payload: &DockerCommandPayload,
) -> Result<DockerCommandResponse> {
    let request = match payload
        .body
        .clone()
        .and_then(|body| serde_json::from_value::<UpdateComposeFileRequest>(body).ok())
    {
        Some(request) => request,
        None => {
            return json_status(
                400,
                ComposeErrorResponse {
                    error: "Invalid compose update payload".to_string(),
                    detail: "Expected JSON body with a content field".to_string(),
                },
            );
        }
    };

    if request.content.trim().is_empty() {
        return json_status(
            400,
            ComposeErrorResponse {
                error: "Compose file content is required".to_string(),
                detail: String::new(),
            },
        );
    }

    let (path, _) = match resolve_compose_file(docker, name).await {
        Ok(file) => file,
        Err(error) => return json_status(422, error),
    };

    match write_compose_content(&path, request.content, name).await {
        Ok(response) => json_ok(response),
        Err(error) => json_status(500, error),
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

#[cfg(test)]
mod tests {
    use super::write_compose_content;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_compose_path(name: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dokuru-relay-{name}-{}-{nanos}.compose.yaml",
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
}
