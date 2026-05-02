use axum::extract::State;
use serde::Serialize;
use std::path::PathBuf;

use crate::api::infrastructure::web::response::{ApiResult, ApiSuccess};
use crate::api::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct BootstrapInfo {
    pub token: String,
    pub url: String,
    pub name: String,
}

fn read_plain_token() -> Option<String> {
    let token_path = PathBuf::from("/etc/dokuru/.token");
    std::fs::read_to_string(token_path)
        .ok()
        .map(|s| s.trim().to_string())
}

pub async fn get_bootstrap(State(state): State<AppState>) -> ApiResult<BootstrapInfo> {
    let config = &state.config;

    // Try to read plain token from file, fallback to relay_token from config
    let token = read_plain_token()
        .or_else(|| config.auth.relay_token.clone())
        .unwrap_or_default();

    let url = if config.access.url.is_empty() {
        format!("http://localhost:{}", config.server.port)
    } else {
        config.access.url.clone()
    };

    let name = "Local Agent".to_string();

    Ok(ApiSuccess::default().with_data(BootstrapInfo { token, url, name }))
}
