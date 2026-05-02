use axum::extract::State;
use serde::Serialize;

use crate::api::infrastructure::web::response::{ApiResult, ApiSuccess};
use crate::api::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct BootstrapInfo {
    pub token: String,
    pub url: String,
    pub name: String,
}

pub async fn get_bootstrap(State(state): State<AppState>) -> ApiResult<BootstrapInfo> {
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
