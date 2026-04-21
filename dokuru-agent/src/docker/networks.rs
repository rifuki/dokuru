use axum::{Router, extract::Path, http::StatusCode, response::Json, routing::get};
use bollard::network::{CreateNetworkOptions, ListNetworksOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::get_docker_client;

#[derive(Deserialize)]
pub struct CreateNetworkRequest {
    pub name: String,
    pub driver: Option<String>,
}

#[derive(Serialize)]
pub struct NetworkResponse {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/networks", get(list_networks).post(create_network))
        .route(
            "/docker/networks/:id",
            get(inspect_network).delete(remove_network),
        )
}

async fn list_networks() -> Result<Json<Vec<NetworkResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let networks = docker
        .list_networks(None::<ListNetworksOptions<String>>)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<NetworkResponse> = networks
        .into_iter()
        .map(|net| NetworkResponse {
            id: net.id.unwrap_or_default(),
            name: net.name.unwrap_or_default(),
            driver: net.driver.unwrap_or_default(),
            scope: net.scope.unwrap_or_default(),
        })
        .collect();

    Ok(Json(response))
}

async fn inspect_network(Path(id): Path<String>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let network = docker
        .inspect_network::<String>(&id, None)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::to_value(network).unwrap()))
}

async fn create_network(Json(req): Json<CreateNetworkRequest>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = CreateNetworkOptions {
        name: req.name,
        driver: req.driver.unwrap_or_else(|| "bridge".to_string()),
        ..Default::default()
    };

    let result = docker
        .create_network(options)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(result).unwrap()))
}

async fn remove_network(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .remove_network(&id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}
