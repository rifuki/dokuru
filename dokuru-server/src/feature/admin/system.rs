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

use super::system_domain::{self, CONFIG_FIELD_SPECS};

#[derive(Debug, Serialize)]
pub struct ConfigSourceDetail {
    pub source: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct EffectiveConfigResponse {
    pub source: &'static str,
    pub local_config_path: String,
    pub is_production: bool,
    pub field_sources: BTreeMap<String, Vec<ConfigSourceDetail>>,
    pub app: AppConfigView,
    pub bootstrap: BootstrapConfigView,
    pub server: ServerConfigView,
    pub cookie: CookieConfigView,
    pub upload: UploadConfigView,
    pub email: EmailConfigView,
    pub database: DatabaseConfigView,
    pub redis: RedisConfigView,
    pub auth: AuthConfigView,
    pub features: FeatureConfigView,
}

#[derive(Debug, Serialize)]
pub struct AppConfigView {
    pub rust_env: String,
    pub rust_log: String,
}

#[derive(Debug, Serialize)]
pub struct ServerConfigView {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BootstrapConfigView {
    pub enabled: bool,
    pub admin_email: String,
    pub admin_username: String,
    pub admin_name: String,
}

#[derive(Debug, Serialize)]
pub struct CookieConfigView {
    pub same_site: String,
    pub secure: bool,
    pub http_only: bool,
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
pub struct DatabaseConfigView {
    pub url_configured: bool,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Serialize)]
pub struct RedisConfigView {
    pub url_configured: bool,
}

#[derive(Debug, Serialize)]
pub struct AuthConfigView {
    pub access_expiry_secs: i64,
    pub refresh_expiry_secs: i64,
    pub access_secret_configured: bool,
    pub refresh_secret_configured: bool,
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

#[derive(Debug, Deserialize)]
pub struct UpdateConfigFieldRequest {
    /// Dotted TOML path, e.g. `["server", "port"]`
    pub path: Vec<String>,
    /// The new value as a string (will be coerced to the right TOML type)
    pub value: String,
    /// "local" or "secrets" (defaults to "local" if omitted)
    pub target: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReloadConfigResponse {
    pub message: String,
    pub effective_config: EffectiveConfigResponse,
    pub applied_immediately: Vec<&'static str>,
    pub restart_required: Vec<&'static str>,
}

pub async fn get_effective_config(
    State(_state): State<AppState>,
) -> ApiResult<EffectiveConfigResponse> {
    let config = Config::load().map_err(|error| crate::ApiError::default().log_only(error))?;
    Ok(ApiSuccess::default().with_data(config_snapshot(&config)))
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

#[allow(clippy::unused_async)]
pub async fn reload_config(State(_state): State<AppState>) -> ApiResult<ReloadConfigResponse> {
    let config = Config::load().map_err(|error| crate::ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default().with_data(ReloadConfigResponse {
        message: "Configuration files reloaded for validation and preview. Some subsystems still require process restart to fully apply changes.".to_string(),
        effective_config: config_snapshot(&config),
        applied_immediately: vec![
            "settings preview",
            "field source tracing",
            "local.toml editor state",
        ],
        restart_required: vec![
            "server port",
            "cors layer",
            "database pool",
            "redis pool",
            "storage provider",
            "email client",
        ],
    }))
}

#[allow(clippy::unused_async)]
pub async fn update_config_field(
    Json(req): Json<UpdateConfigFieldRequest>,
) -> ApiResult<LocalConfigResponse> {
    if req.path.is_empty() {
        return Err(crate::ApiError::default().log_only(eyre::eyre!("path must not be empty")));
    }

    let target = req.target.as_deref().unwrap_or("local");
    let path_refs: Vec<&str> = req.path.iter().map(String::as_str).collect();

    toml_config::write_field_to_toml(target, &path_refs, &req.value)
        .map_err(|error| crate::ApiError::default().log_only(error))?;

    // Return updated local config content so the frontend can refresh the editor
    let local_path = toml_config::local_config_path();
    let content = toml_config::read_local_config_string()
        .map_err(|error| crate::ApiError::default().log_only(error))?;

    Ok(ApiSuccess::default()
        .with_data(LocalConfigResponse {
            path: local_path.display().to_string(),
            content,
            exists: local_path.exists(),
        })
        .with_message("Field updated"))
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
    let sources_for = |path: &[&str], env_keys: &[&str]| {
        let mut sources = Vec::new();

        // 1. Env vars (highest priority)
        if let Some(key) = env_keys.iter().find(|key| {
            std::env::var(*key)
                .ok()
                .is_some_and(|value| !value.trim().is_empty())
        }) && let Ok(value) = std::env::var(key)
        {
            sources.push(ConfigSourceDetail {
                source: format!("env:{key}"),
                value,
            });
        }

        let get_val_str = |doc: Option<&toml_edit::DocumentMut>, p: &[&str]| -> Option<String> {
            let item = toml_config::value_at_path(doc?, p)?;
            Some(system_domain::toml_value_to_string(item))
        };

        // 2. secrets.toml
        if let Some(val) = get_val_str(secrets_doc.as_ref(), path) {
            sources.push(ConfigSourceDetail {
                source: "file:secrets.toml".to_string(),
                value: val,
            });
        }

        // 3. local.toml
        if let Some(val) = get_val_str(local_doc.as_ref(), path) {
            sources.push(ConfigSourceDetail {
                source: "file:local.toml".to_string(),
                value: val,
            });
        }

        // 4. defaults.toml
        if let Some(val) = get_val_str(default_doc.as_ref(), path) {
            sources.push(ConfigSourceDetail {
                source: "file:defaults.toml".to_string(),
                value: val,
            });
        }

        sources
    };

    for spec in CONFIG_FIELD_SPECS {
        field_sources.insert(spec.key.to_string(), sources_for(spec.path, spec.env_keys));
    }

    EffectiveConfigResponse {
        source: "toml + env override",
        local_config_path: toml_config::local_config_path().display().to_string(),
        is_production: config.is_production,
        field_sources,
        app: AppConfigView {
            rust_env: config.rust_env.clone(),
            rust_log: config.logging.default_level.clone(),
        },
        bootstrap: BootstrapConfigView {
            enabled: config.bootstrap.enabled,
            admin_email: config.bootstrap.admin_email.clone(),
            admin_username: config.bootstrap.admin_username.clone(),
            admin_name: config.bootstrap.admin_name.clone(),
        },
        server: ServerConfigView {
            port: config.server.port,
            cors_allowed_origins: config.server.cors_allowed_origins.clone(),
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
            provider: if config.email.resend_api_key.is_empty() {
                "none"
            } else {
                "resend"
            },
        },
        database: DatabaseConfigView {
            url_configured: !config.database.url.is_empty(),
            max_connections: config.database.max_connections,
            min_connections: config.database.min_connections,
        },
        redis: RedisConfigView {
            url_configured: config.redis_url.is_some(),
        },
        auth: AuthConfigView {
            access_expiry_secs: config.auth.access_expiry_secs,
            refresh_expiry_secs: config.auth.refresh_expiry_secs,
            access_secret_configured: !config.auth.access_secret.is_empty(),
            refresh_secret_configured: !config.auth.refresh_secret.is_empty(),
        },
        features: FeatureConfigView {
            redis_enabled: config.redis_url.is_some(),
            uploads_enabled: true,
            email_enabled: !config.email.resend_api_key.is_empty(),
        },
    }
}
