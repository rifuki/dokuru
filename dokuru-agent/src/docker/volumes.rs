use axum::{
    Router,
    extract::Path,
    http::StatusCode,
    response::Json,
    routing::{get, post},
};
use bollard::volume::{CreateVolumeOptions, ListVolumesOptions, PruneVolumesOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::get_docker_client;

#[derive(Deserialize)]
pub struct CreateVolumeRequest {
    pub name: String,
    pub driver: Option<String>,
}

#[derive(Serialize)]
pub struct VolumeResponse {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/volumes", get(list_volumes).post(create_volume))
        .route(
            "/docker/volumes/{name}",
            get(inspect_volume).delete(remove_volume),
        )
        .route("/docker/volumes/prune", post(prune_volumes))
}

async fn list_volumes() -> Result<Json<Vec<VolumeResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = docker
        .list_volumes(None::<ListVolumesOptions<String>>)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<VolumeResponse> = result
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|vol| VolumeResponse {
            name: vol.name,
            driver: vol.driver,
            mountpoint: vol.mountpoint,
        })
        .collect();

    Ok(Json(response))
}

async fn inspect_volume(Path(name): Path<String>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let volume = docker
        .inspect_volume(&name)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::to_value(volume).unwrap()))
}

async fn create_volume(Json(req): Json<CreateVolumeRequest>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = CreateVolumeOptions {
        name: req.name,
        driver: req.driver.unwrap_or_else(|| "local".to_string()),
        ..Default::default()
    };

    let result = docker
        .create_volume(options)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(result).unwrap()))
}

async fn remove_volume(Path(name): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .remove_volume(&name, None)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn prune_volumes() -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = docker
        .prune_volumes(None::<PruneVolumesOptions<String>>)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(result).unwrap()))
}
