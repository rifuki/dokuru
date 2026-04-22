use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::{
    infrastructure::{
        config::Config,
        toml_config,
        web::response::{ApiResult, ApiSuccess},
    },
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct EffectiveConfigResponse {
    pub source: &'static str,
    pub local_config_path: String,
    pub rust_env: String,
    pub is_production: bool,
    pub field_sources: BTreeMap<String, String>,
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

#[derive(Debug, Serialize)]
pub struct LocalConfigResponse {
    pub path: String,
    pub content: String,
    pub exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct SaveLocalConfigRequest {
    pub content: String,
}

pub async fn get_effective_config(
    State(state): State<AppState>,
) -> ApiResult<EffectiveConfigResponse> {
    Ok(ApiSuccess::default().with_data(config_snapshot(&state.config)))
}

pub async fn get_local_config() -> ApiResult<LocalConfigResponse> {
    let path = toml_config::local_config_path();
    let exists = path.exists();
    let content = toml_config::read_local_config_string()
        .map_err(|error| crate::ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default().with_data(LocalConfigResponse {
        path: path.display().to_string(),
        content,
        exists,
    }))
}

pub async fn save_local_config(
    Json(req): Json<SaveLocalConfigRequest>,
) -> ApiResult<LocalConfigResponse> {
    toml_config::write_local_config_string(&req.content)
        .map_err(|error| crate::ApiError::default().log_only(error))?;

    let path = toml_config::local_config_path();
    let content = toml_config::read_local_config_string()
        .map_err(|error| crate::ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default()
        .with_data(LocalConfigResponse {
            path: path.display().to_string(),
            content,
            exists: path.exists(),
        })
        .with_message("Local config saved"))
}

#[allow(clippy::too_many_lines)]
fn config_snapshot(config: &Config) -> EffectiveConfigResponse {
    let default_doc =
        toml_config::read_toml_document(&toml_config::config_dir().join("defaults.toml"))
            .ok()
            .flatten();
    let local_doc = toml_config::read_toml_document(&toml_config::local_config_path())
        .ok()
        .flatten();
    let secrets_doc = toml_config::read_toml_document(&toml_config::secrets_config_path())
        .ok()
        .flatten();

    let mut field_sources = BTreeMap::new();
    let source_for = |path: &[&str], env_keys: &[&str]| {
        if env_keys.iter().any(|key| {
            std::env::var(key)
                .ok()
                .is_some_and(|value| !value.trim().is_empty())
        }) {
            return "env override".to_string();
        }
        if local_doc
            .as_ref()
            .and_then(|doc| toml_config::value_at_path(doc, path))
            .is_some()
        {
            return "local.toml".to_string();
        }
        if secrets_doc
            .as_ref()
            .and_then(|doc| toml_config::value_at_path(doc, path))
            .is_some()
        {
            return "secrets.toml".to_string();
        }
        if default_doc
            .as_ref()
            .and_then(|doc| toml_config::value_at_path(doc, path))
            .is_some()
        {
            return "defaults.toml".to_string();
        }
        "runtime".to_string()
    };

    field_sources.insert(
        "server.port".to_string(),
        source_for(&["server", "port"], &["PORT", "DOKURU__SERVER__PORT"]),
    );
    field_sources.insert(
        "server.cors_allowed_origins".to_string(),
        source_for(
            &["server", "cors_allowed_origins"],
            &[
                "CORS_ALLOWED_ORIGINS",
                "DOKURU__SERVER__CORS_ALLOWED_ORIGINS",
            ],
        ),
    );
    field_sources.insert(
        "logging.default_level".to_string(),
        source_for(
            &["logging", "default_level"],
            &["RUST_LOG", "DOKURU__LOGGING__DEFAULT_LEVEL"],
        ),
    );
    field_sources.insert(
        "cookie.same_site".to_string(),
        source_for(
            &["cookie", "same_site"],
            &["COOKIE_SAMESITE", "DOKURU__COOKIE__SAME_SITE"],
        ),
    );
    field_sources.insert(
        "cookie.http_only".to_string(),
        source_for(
            &["cookie", "http_only"],
            &["COOKIE_HTTPONLY", "DOKURU__COOKIE__HTTP_ONLY"],
        ),
    );
    field_sources.insert(
        "upload.dir".to_string(),
        source_for(&["upload", "dir"], &["UPLOAD_DIR", "DOKURU__UPLOAD__DIR"]),
    );
    field_sources.insert(
        "upload.base_url".to_string(),
        source_for(
            &["upload", "base_url"],
            &["UPLOAD_BASE_URL", "DOKURU__UPLOAD__BASE_URL"],
        ),
    );
    field_sources.insert(
        "email.from_email".to_string(),
        source_for(
            &["email", "from_email"],
            &["RESEND_FROM_EMAIL", "DOKURU__EMAIL__FROM_EMAIL"],
        ),
    );

    EffectiveConfigResponse {
        source: "toml + env override",
        local_config_path: toml_config::local_config_path().display().to_string(),
        rust_env: config.rust_env.clone(),
        is_production: config.is_production,
        field_sources,
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
