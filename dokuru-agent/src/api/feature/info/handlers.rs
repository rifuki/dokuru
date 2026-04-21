use axum::extract::State;
use bollard::container::ListContainersOptions;
use bollard::image::ListImagesOptions;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;

#[derive(Debug, Serialize)]
pub struct ContainerStats {
    pub total: usize,
    pub running: usize,
    pub stopped: usize,
    pub healthy: usize,
    pub unhealthy: usize,
}

#[derive(Debug, Serialize)]
pub struct EnvironmentInfo {
    pub docker_version: String,
    pub api_version: Option<String>,
    pub os: String,
    pub architecture: String,
    pub hostname: Option<String>,
    pub kernel_version: Option<String>,
    pub docker_root_dir: Option<String>,
    pub storage_driver: Option<String>,
    pub logging_driver: Option<String>,
    pub containers: ContainerStats,
    pub stacks: usize,
    pub volumes: usize,
    pub images: usize,
    pub networks: usize,
    pub cpu_count: i64,
    pub memory_total: i64,
}

pub async fn get_info(State(state): State<AppState>) -> ApiResult<EnvironmentInfo> {
    let docker = &state.docker;

    // System info
    let sys = docker
        .info()
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let cpu_count = sys.ncpu.unwrap_or(0);
    let memory_total = sys.mem_total.unwrap_or(0);
    let docker_version = sys.server_version.unwrap_or_else(|| "unknown".to_string());
    let os = sys
        .operating_system
        .unwrap_or_else(|| "unknown".to_string());
    let architecture = sys.architecture.unwrap_or_else(|| "unknown".to_string());
    let hostname = sys.name;
    let kernel_version = sys.kernel_version;
    let docker_root_dir = sys.docker_root_dir;
    let storage_driver = sys.driver;
    let logging_driver = sys.logging_driver;
    let api_version = docker.version().await.ok().and_then(|v| v.api_version);

    // Containers
    let all_containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let mut running = 0usize;
    let mut stopped = 0usize;
    let mut healthy = 0usize;
    let mut unhealthy = 0usize;
    let mut stack_names: HashSet<String> = HashSet::new();

    for c in &all_containers {
        match c.state.as_deref().unwrap_or("") {
            "running" => running += 1,
            "exited" | "stopped" => stopped += 1,
            _ => {}
        }
        let status = c.status.as_deref().unwrap_or("");
        if status.contains("unhealthy") {
            unhealthy += 1;
        } else if status.contains("healthy") {
            healthy += 1;
        }
        // Detect compose stacks via label
        if let Some(labels) = &c.labels
            && let Some(project) = labels.get("com.docker.compose.project")
        {
            stack_names.insert(project.clone());
        }
    }

    // Volumes
    let volumes = docker
        .list_volumes::<String>(None)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?
        .volumes
        .unwrap_or_default()
        .len();

    // Images
    let images = docker
        .list_images(Some(ListImagesOptions::<String> {
            all: false,
            filters: HashMap::new(),
            ..Default::default()
        }))
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?
        .len();

    // Networks
    let networks = docker
        .list_networks::<String>(None)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?
        .len();

    Ok(ApiSuccess::default().with_data(EnvironmentInfo {
        docker_version,
        api_version,
        os,
        architecture,
        hostname,
        kernel_version,
        docker_root_dir,
        storage_driver,
        logging_driver,
        containers: ContainerStats {
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
        cpu_count,
        memory_total,
    }))
}
