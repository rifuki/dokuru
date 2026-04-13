use axum::{Json, extract::State};
use bollard::models::ContainerSummary;

use crate::state::AppState;

pub async fn list_containers(State(state): State<AppState>) -> Result<Json<Vec<ContainerSummary>>, axum::http::StatusCode> {
    match state.docker.list_containers::<String>(None).await {
        Ok(containers) => Ok(Json(containers)),
        Err(_) => Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR),
    }
}
