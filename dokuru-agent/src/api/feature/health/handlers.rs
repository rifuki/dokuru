use axum::extract::State;
use chrono::Utc;
use serde::Serialize;

use crate::api::{
    infrastructure::web::response::{ApiResult, ApiSuccess},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct HealthDetail {
    status: &'static str,
    version: &'static str,
    timestamp: String,
    docker_connected: bool,
    docker_version: Option<String>,
}

pub async fn health_check() -> ApiResult<()> {
    Ok(ApiSuccess::default().with_message("Service is healthy"))
}

pub async fn health_detail(State(state): State<AppState>) -> ApiResult<HealthDetail> {
    let docker_version = match state.docker.version().await {
        Ok(v) => v.version,
        Err(_) => None,
    };

    Ok(ApiSuccess::default().with_data(HealthDetail {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
        timestamp: Utc::now().to_rfc3339(),
        docker_connected: docker_version.is_some(),
        docker_version,
    }))
}
