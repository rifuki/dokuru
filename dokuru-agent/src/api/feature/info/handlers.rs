use axum::extract::State;
use bollard::container::ListContainersOptions;
use bollard::image::ListImagesOptions;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, RwLock};

use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;

const INFO_CACHE_TTL: Duration = Duration::from_secs(5);

static INFO_CACHE: LazyLock<RwLock<Option<CachedEnvironmentInfo>>> =
    LazyLock::new(|| RwLock::new(None));
static INFO_REFRESH_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone)]
struct CachedEnvironmentInfo {
    value: EnvironmentInfo,
    refreshed_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContainerStats {
    pub total: usize,
    pub running: usize,
    pub stopped: usize,
    pub healthy: usize,
    pub unhealthy: usize,
}

#[derive(Debug, Clone, Serialize)]
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
    if let Some(info) = cached_environment_info().await {
        return Ok(ApiSuccess::default().with_data(info));
    }

    let _guard = INFO_REFRESH_LOCK.lock().await;
    if let Some(info) = cached_environment_info().await {
        return Ok(ApiSuccess::default().with_data(info));
    }

    let info = fetch_environment_info(&state).await?;
    *INFO_CACHE.write().await = Some(CachedEnvironmentInfo {
        value: info.clone(),
        refreshed_at: Instant::now(),
    });

    Ok(ApiSuccess::default().with_data(info))
}

async fn cached_environment_info() -> Option<EnvironmentInfo> {
    let cache = INFO_CACHE.read().await;
    cache
        .as_ref()
        .filter(|entry| entry.refreshed_at.elapsed() < INFO_CACHE_TTL)
        .map(|entry| entry.value.clone())
}

async fn fetch_environment_info(state: &AppState) -> Result<EnvironmentInfo, ApiError> {
    let docker = &state.docker;

    let info_fut = docker.info();
    let version_fut = async {
        Ok::<Option<String>, bollard::errors::Error>(
            docker.version().await.ok().and_then(|v| v.api_version),
        )
    };
    let containers_fut = docker.list_containers(Some(ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    }));
    let volumes_fut = docker.list_volumes::<String>(None);
    let images_fut = docker.list_images(Some(ListImagesOptions::<String> {
        all: false,
        filters: HashMap::new(),
        ..Default::default()
    }));
    let networks_fut = docker.list_networks::<String>(None);

    let (sys, api_version, all_containers, volumes_response, images_response, networks_response) =
        tokio::try_join!(
            info_fut,
            version_fut,
            containers_fut,
            volumes_fut,
            images_fut,
            networks_fut,
        )
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

    let volumes = volumes_response.volumes.unwrap_or_default().len();
    let images = images_response.len();
    let networks = networks_response.len();

    Ok(EnvironmentInfo {
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
    })
}
