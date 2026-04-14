use axum::extract::State;
use bollard::container::ListContainersOptions;
use bollard::image::ListImagesOptions;
use serde::Serialize;
use std::collections::HashMap;

use crate::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::state::AppState;

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
    pub containers: ContainerStats,
    pub volumes: usize,
    pub images: usize,
    pub cpu_count: i64,
    pub memory_total: i64,
}

pub async fn get_info(State(state): State<AppState>) -> ApiResult<EnvironmentInfo> {
    let docker = &state.docker;

    // System info: CPU, RAM, Docker version
    let sys = docker
        .info()
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    let cpu_count = sys.ncpu.unwrap_or(0) as i64;
    let memory_total = sys.mem_total.unwrap_or(0);
    let docker_version = sys.server_version.unwrap_or_else(|| "unknown".to_string());

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

    for c in &all_containers {
        let state_str = c.state.as_deref().unwrap_or("");
        match state_str {
            "running" => running += 1,
            "exited" | "stopped" => stopped += 1,
            _ => {}
        }
        let health = c.status.as_deref().unwrap_or("");
        if health.contains("healthy") && !health.contains("unhealthy") {
            healthy += 1;
        } else if health.contains("unhealthy") {
            unhealthy += 1;
        }
    }

    // Volumes
    let volumes_resp = docker
        .list_volumes::<String>(None)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;
    let volumes = volumes_resp.volumes.unwrap_or_default().len();

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

    Ok(ApiSuccess::default().with_data(EnvironmentInfo {
        docker_version,
        containers: ContainerStats {
            total: all_containers.len(),
            running,
            stopped,
            healthy,
            unhealthy,
        },
        volumes,
        images,
        cpu_count,
        memory_total,
    }))
}
