use axum::{
    Router,
    extract::{Path, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post},
};
use bollard::image::{
    CreateImageOptions, ListImagesOptions, PruneImagesOptions, RemoveImageOptions,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::get_docker_client;

#[derive(Deserialize)]
pub struct ListQuery {
    all: Option<bool>,
}

#[derive(Deserialize)]
pub struct PullQuery {
    from_image: String,
    tag: Option<String>,
}

#[derive(Serialize)]
pub struct ImageResponse {
    pub id: String,
    pub repo_tags: Vec<String>,
    pub size: i64,
    pub created: i64,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/docker/images", get(list_images))
        .route(
            "/docker/images/:id",
            get(inspect_image).delete(remove_image),
        )
        .route("/docker/images/pull", post(pull_image))
        .route("/docker/images/prune", post(prune_images))
}

async fn list_images(
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<ImageResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(ListImagesOptions::<String> {
        all: query.all.unwrap_or(false),
        ..Default::default()
    });

    let images = docker
        .list_images(options)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response: Vec<ImageResponse> = images
        .into_iter()
        .map(|img| ImageResponse {
            id: img.id,
            repo_tags: img.repo_tags,
            size: img.size,
            created: img.created,
        })
        .collect();

    Ok(Json(response))
}

async fn inspect_image(Path(id): Path<String>) -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let image = docker
        .inspect_image(&id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::to_value(image).unwrap()))
}

async fn remove_image(Path(id): Path<String>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    docker
        .remove_image(
            &id,
            Some(RemoveImageOptions {
                force: true,
                ..Default::default()
            }),
            None,
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn pull_image(Query(query): Query<PullQuery>) -> Result<StatusCode, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(CreateImageOptions {
        from_image: query.from_image,
        tag: query.tag.unwrap_or_else(|| "latest".to_string()),
        ..Default::default()
    });

    let mut stream = docker.create_image(options, None, None);

    while let Some(result) = stream.next().await {
        result.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(StatusCode::OK)
}

async fn prune_images() -> Result<Json<Value>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = docker
        .prune_images(None::<PruneImagesOptions<String>>)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::to_value(result).unwrap()))
}
