use axum::extract::State;
use serde::Serialize;

use crate::{
    infrastructure::{
        config::Config,
        web::response::{ApiResult, ApiSuccess},
    },
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct EffectiveConfigResponse {
    pub source: &'static str,
    pub rust_env: String,
    pub is_production: bool,
    pub server: ServerConfigView,
    pub logging: LoggingConfigView,
    pub cookie: CookieConfigView,
    pub upload: UploadConfigView,
    pub email: EmailConfigView,
    pub features: FeatureConfigView,
}

#[derive(Debug, Serialize)]
pub struct ServerConfigView {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CookieConfigView {
    pub same_site: String,
    pub secure: bool,
    pub http_only: bool,
}

#[derive(Debug, Serialize)]
pub struct LoggingConfigView {
    pub default_level: String,
}

#[derive(Debug, Serialize)]
pub struct UploadConfigView {
    pub upload_dir: String,
    pub base_url: String,
    pub max_avatar_size_bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct EmailConfigView {
    pub from_email: String,
    pub provider: &'static str,
}

#[derive(Debug, Serialize)]
pub struct FeatureConfigView {
    pub redis_enabled: bool,
    pub uploads_enabled: bool,
    pub email_enabled: bool,
}

pub async fn get_effective_config(
    State(state): State<AppState>,
) -> ApiResult<EffectiveConfigResponse> {
    Ok(ApiSuccess::default().with_data(config_snapshot(&state.config)))
}

fn config_snapshot(config: &Config) -> EffectiveConfigResponse {
    EffectiveConfigResponse {
        source: "toml + env override",
        rust_env: config.rust_env.clone(),
        is_production: config.is_production,
        server: ServerConfigView {
            port: config.server.port,
            cors_allowed_origins: config.server.cors_allowed_origins.clone(),
        },
        logging: LoggingConfigView {
            default_level: config.logging.default_level.clone(),
        },
        cookie: CookieConfigView {
            same_site: format!("{:?}", config.cookie.same_site).to_lowercase(),
            secure: config.cookie.secure,
            http_only: config.cookie.http_only,
        },
        upload: UploadConfigView {
            upload_dir: config.upload.upload_dir.clone(),
            base_url: config.upload.base_url.clone(),
            max_avatar_size_bytes: config.upload.max_avatar_size,
        },
        email: EmailConfigView {
            from_email: config.email.from_email.clone(),
            provider: "resend",
        },
        features: FeatureConfigView {
            redis_enabled: config.redis_url.is_some(),
            uploads_enabled: true,
            email_enabled: true,
        },
    }
}
