use axum::Json;
use axum::extract::State;
use serde_json::Value;
use std::collections::HashMap;

use crate::state::AppState;

pub async fn health_detail(State(state): State<AppState>) -> Json<Value> {
    let docker_version = match state.docker.version().await {
        Ok(v) => v.version,
        Err(_) => None,
    };
    
    Json(serde_json::json!({
        "status": "ok",
        "docker_connected": docker_version.is_some(),
        "docker_version": docker_version,
    }))
}
