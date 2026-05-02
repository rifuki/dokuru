use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
};
use serde::Serialize;
use std::net::SocketAddr;

use crate::api::infrastructure::web::{
    local_request,
    response::{ApiError, ApiResult, ApiSuccess},
};
use crate::api::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct BootstrapInfo {
    pub token: String,
    pub url: String,
    pub name: String,
}

pub async fn get_bootstrap(
    ConnectInfo(client_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> ApiResult<BootstrapInfo> {
    let trusted_local = local_request::is_trusted_loopback_request(&headers, client_addr);
    if !trusted_local {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("Bootstrap is only available from localhost"));
    }

    let config = &state.config;

    let token = config.auth.token.clone().unwrap_or_default();

    let url = if config.access.url.is_empty() {
        format!("http://localhost:{}", config.server.port)
    } else {
        config.access.url.clone()
    };

    let name = "Local Agent".to_string();

    Ok(ApiSuccess::default().with_data(BootstrapInfo { token, url, name }))
}
