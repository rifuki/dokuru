use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post},
};
use bollard::container::{
    ListContainersOptions, LogsOptions, RemoveContainerOptions, StartContainerOptions, StatsOptions,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
