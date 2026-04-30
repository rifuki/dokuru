use axum::extract::State;
use bollard::container::ListContainersOptions;
use bollard::image::ListImagesOptions;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    future::Future,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ContainerStats {
    pub total: usize,
    pub running: usize,
    pub stopped: usize,
    pub healthy: usize,
    pub unhealthy: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
    let info = get_cached_or_fetch(|| fetch_environment_info(&state)).await?;
    Ok(ApiSuccess::default().with_data(info))
}

async fn get_cached_or_fetch<F, Fut>(fetch: F) -> Result<EnvironmentInfo, ApiError>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<EnvironmentInfo, ApiError>>,
{
    if let Some(info) = cached_environment_info().await {
        return Ok(info);
    }

    let _guard = INFO_REFRESH_LOCK.lock().await;
    if let Some(info) = cached_environment_info().await {
        return Ok(info);
    }

    let info = fetch().await?;
    *INFO_CACHE.write().await = Some(CachedEnvironmentInfo {
        value: info.clone(),
        refreshed_at: Instant::now(),
    });

    Ok(info)
}

async fn cached_environment_info() -> Option<EnvironmentInfo> {
    let cache = INFO_CACHE.read().await;
    cache
        .as_ref()
        .filter(|entry| entry.refreshed_at.elapsed() < INFO_CACHE_TTL)
        .map(|entry| entry.value.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    static TEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    fn sample_info(version: &str) -> EnvironmentInfo {
        EnvironmentInfo {
            docker_version: version.to_string(),
            api_version: Some("1.45".to_string()),
            os: "linux".to_string(),
            architecture: "x86_64".to_string(),
            hostname: Some("test-host".to_string()),
            kernel_version: Some("6.8".to_string()),
            docker_root_dir: Some("/var/lib/docker".to_string()),
            storage_driver: Some("overlay2".to_string()),
            logging_driver: Some("json-file".to_string()),
            containers: ContainerStats {
                total: 2,
                running: 1,
                stopped: 1,
                healthy: 1,
                unhealthy: 0,
            },
            stacks: 1,
            volumes: 3,
            images: 4,
            networks: 5,
            cpu_count: 2,
            memory_total: 4 * 1024 * 1024 * 1024,
        }
    }

    async fn set_cache(value: EnvironmentInfo, refreshed_at: Instant) {
        *INFO_CACHE.write().await = Some(CachedEnvironmentInfo {
            value,
            refreshed_at,
        });
    }

    async fn clear_cache() {
        *INFO_CACHE.write().await = None;
    }

    #[tokio::test]
    async fn returns_fresh_cached_info_without_fetching() {
        let _guard = TEST_LOCK.lock().await;
        clear_cache().await;

        let cached = sample_info("cached");
        set_cache(cached.clone(), Instant::now()).await;

        let fetch_count = Arc::new(AtomicUsize::new(0));
        let result = get_cached_or_fetch({
            let fetch_count = Arc::clone(&fetch_count);
            || async move {
                fetch_count.fetch_add(1, Ordering::SeqCst);
                Ok(sample_info("fresh"))
            }
        })
        .await
        .expect("cache lookup should succeed");

        assert_eq!(result, cached);
        assert_eq!(fetch_count.load(Ordering::SeqCst), 0);
        clear_cache().await;
    }

    #[tokio::test]
    async fn refreshes_expired_cache() {
        let _guard = TEST_LOCK.lock().await;
        clear_cache().await;

        let expired_at = Instant::now()
            .checked_sub(INFO_CACHE_TTL + Duration::from_secs(1))
            .expect("expired cache timestamp should be representable");
        set_cache(sample_info("expired"), expired_at).await;

        let fetch_count = Arc::new(AtomicUsize::new(0));
        let fresh = sample_info("fresh");
        let result = get_cached_or_fetch({
            let fetch_count = Arc::clone(&fetch_count);
            let fresh = fresh.clone();
            || async move {
                fetch_count.fetch_add(1, Ordering::SeqCst);
                Ok(fresh)
            }
        })
        .await
        .expect("refresh should succeed");

        assert_eq!(result, fresh);
        assert_eq!(fetch_count.load(Ordering::SeqCst), 1);
        clear_cache().await;
    }

    #[tokio::test]
    async fn concurrent_cache_misses_share_one_refresh() {
        let _guard = TEST_LOCK.lock().await;
        clear_cache().await;

        let fetch_count = Arc::new(AtomicUsize::new(0));
        let fresh = sample_info("fresh");
        let tasks: Vec<_> = (0..8)
            .map(|_| {
                let fetch_count = Arc::clone(&fetch_count);
                let fresh = fresh.clone();
                tokio::spawn(async move {
                    get_cached_or_fetch(|| async move {
                        fetch_count.fetch_add(1, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(25)).await;
                        Ok(fresh)
                    })
                    .await
                })
            })
            .collect();

        for task in tasks {
            let result = task
                .await
                .expect("task should join")
                .expect("fetch should succeed");
            assert_eq!(result.docker_version, "fresh");
        }

        assert_eq!(fetch_count.load(Ordering::SeqCst), 1);
        clear_cache().await;
    }
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
