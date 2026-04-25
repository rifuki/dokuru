use std::{env, sync::OnceLock};

use axum_extra::extract::cookie::SameSite;
use eyre::{ContextCompat, Result, WrapErr};

use crate::infrastructure::toml_config::TomlConfig;

pub(crate) static AUTH_RUNTIME: OnceLock<AuthConfig> = OnceLock::new();

fn env_override(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn require_value(value: Option<String>, key: &str) -> Result<String> {
    value.wrap_err_with(|| format!("Missing required configuration value: {key}"))
}

fn parse_bool(value: Option<String>, default: bool) -> bool {
    value
        .and_then(|raw| raw.parse::<bool>().ok())
        .unwrap_or(default)
}

fn parse_u16(value: Option<String>, default: u16, key: &str) -> Result<u16> {
    value.map_or(Ok(default), |raw| {
        raw.parse()
            .wrap_err_with(|| format!("{key} must be a valid number"))
    })
}

fn parse_u32(value: Option<String>, default: u32, key: &str) -> Result<u32> {
    value.map_or(Ok(default), |raw| {
        raw.parse()
            .wrap_err_with(|| format!("{key} must be a valid number"))
    })
}

fn parse_i64(value: Option<String>, default: i64, key: &str) -> Result<i64> {
    value.map_or(Ok(default), |raw| {
        raw.parse()
            .wrap_err_with(|| format!("{key} must be a valid number"))
    })
}

fn parse_usize(value: Option<String>, default: usize, key: &str) -> Result<usize> {
    value.map_or(Ok(default), |raw| {
        raw.parse()
            .wrap_err_with(|| format!("{key} must be a valid number"))
    })
}

fn parse_same_site(value: &str, is_production: bool) -> SameSite {
    match value.to_lowercase().as_str() {
        "strict" => SameSite::Strict,
        "lax" => SameSite::Lax,
        "none" => SameSite::None,
        _ => {
            eprintln!("Warning: Invalid cookie.same_site '{value}', using default");
            if is_production {
                SameSite::Strict
            } else {
                SameSite::Lax
            }
        }
    }
}

fn split_csv(value: Option<String>, default: &[String]) -> Vec<String> {
    value.map_or_else(
        || default.to_vec(),
        |raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
                .collect()
        },
    )
}

fn get_rust_env(default: &str) -> Result<String> {
    let rust_env = env_override("DOKURU__APP__RUST_ENV").unwrap_or_else(|| default.to_string());

    if cfg!(debug_assertions) && rust_env == "production" {
        eyre::bail!("RUST_ENV cannot be 'production' in debug mode");
    }

    if !cfg!(debug_assertions) && rust_env != "production" {
        eyre::bail!("RUST_ENV must be 'production' in release mode");
    }

    Ok(rust_env)
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct BootstrapConfig {
    pub enabled: bool,
    pub admin_email: String,
    pub admin_username: String,
    pub admin_name: String,
}

impl BootstrapConfig {
    fn from_sources(toml: &TomlConfig) -> Self {
        Self {
            enabled: parse_bool(
                env_override("DOKURU__BOOTSTRAP__ENABLED"),
                toml.bootstrap.enabled,
            ),
            admin_email: env_override("DOKURU__BOOTSTRAP__ADMIN_EMAIL")
                .unwrap_or_else(|| toml.bootstrap.admin_email.clone()),
            admin_username: env_override("DOKURU__BOOTSTRAP__ADMIN_USERNAME")
                .unwrap_or_else(|| toml.bootstrap.admin_username.clone()),
            admin_name: env_override("DOKURU__BOOTSTRAP__ADMIN_NAME")
                .unwrap_or_else(|| toml.bootstrap.admin_name.clone()),
        }
    }
}

impl ServerConfig {
    fn from_sources(toml: &TomlConfig) -> Result<Self> {
        Ok(Self {
            port: parse_u16(
                env_override("DOKURU__SERVER__PORT").or_else(|| env_override("PORT")),
                toml.server.port,
                "PORT",
            )?,
            cors_allowed_origins: split_csv(
                env_override("DOKURU__SERVER__CORS_ALLOWED_ORIGINS"),
                &toml.server.cors_allowed_origins,
            ),
        })
    }
}

#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
}

impl DatabaseConfig {
    fn from_sources(toml: &TomlConfig) -> Result<Self> {
        Ok(Self {
            url: require_value(
                env_override("DOKURU__DATABASE__URL").or_else(|| toml.database.url.clone()),
                "DOKURU__DATABASE__URL",
            )?,
            max_connections: parse_u32(
                env_override("DOKURU__DATABASE__MAX_CONNECTIONS"),
                toml.database.max_connections,
                "DOKURU__DATABASE__MAX_CONNECTIONS",
            )?,
            min_connections: parse_u32(
                env_override("DOKURU__DATABASE__MIN_CONNECTIONS"),
                toml.database.min_connections,
                "DOKURU__DATABASE__MIN_CONNECTIONS",
            )?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub access_secret: String,
    pub refresh_secret: String,
    pub access_expiry_secs: i64,
    pub refresh_expiry_secs: i64,
}

impl AuthConfig {
    fn from_sources(toml: &TomlConfig) -> Result<Self> {
        Ok(Self {
            access_secret: require_value(
                env_override("DOKURU__AUTH__ACCESS_SECRET")
                    .or_else(|| toml.auth.access_secret.clone()),
                "DOKURU__AUTH__ACCESS_SECRET",
            )?,
            refresh_secret: require_value(
                env_override("DOKURU__AUTH__REFRESH_SECRET")
                    .or_else(|| toml.auth.refresh_secret.clone()),
                "DOKURU__AUTH__REFRESH_SECRET",
            )?,
            access_expiry_secs: parse_i64(
                env_override("DOKURU__AUTH__ACCESS_EXPIRY_SECS"),
                toml.auth.access_expiry_secs,
                "DOKURU__AUTH__ACCESS_EXPIRY_SECS",
            )?,
            refresh_expiry_secs: parse_i64(
                env_override("DOKURU__AUTH__REFRESH_EXPIRY_SECS"),
                toml.auth.refresh_expiry_secs,
                "DOKURU__AUTH__REFRESH_EXPIRY_SECS",
            )?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LoggingConfig {
    pub default_level: String,
}

impl LoggingConfig {
    fn from_sources(toml: &TomlConfig) -> Self {
        Self {
            default_level: env_override("DOKURU__APP__RUST_LOG")
                .unwrap_or_else(|| toml.app.rust_log.clone()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CookieConfig {
    pub same_site: SameSite,
    pub secure: bool,
    pub http_only: bool,
}

impl CookieConfig {
    fn from_sources(toml: &TomlConfig, is_production: bool) -> Self {
        let same_site = env_override("DOKURU__COOKIE__SAME_SITE")
            .unwrap_or_else(|| toml.cookie.same_site.clone());

        Self {
            same_site: parse_same_site(&same_site, is_production),
            secure: parse_bool(env_override("DOKURU__COOKIE__SECURE"), toml.cookie.secure),
            http_only: parse_bool(
                env_override("DOKURU__COOKIE__HTTP_ONLY"),
                toml.cookie.http_only,
            ),
        }
    }
}

#[derive(Debug, Clone)]
pub struct UploadConfig {
    pub upload_dir: String,
    pub base_url: String,
    pub max_avatar_size: usize,
}

impl UploadConfig {
    fn from_sources(toml: &TomlConfig) -> Result<Self> {
        Ok(Self {
            upload_dir: env_override("DOKURU__UPLOAD__DIR")
                .unwrap_or_else(|| toml.upload.dir.clone()),
            base_url: env_override("DOKURU__UPLOAD__BASE_URL")
                .unwrap_or_else(|| toml.upload.base_url.clone()),
            max_avatar_size: parse_usize(
                env_override("DOKURU__UPLOAD__MAX_AVATAR_SIZE"),
                toml.upload.max_avatar_size,
                "DOKURU__UPLOAD__MAX_AVATAR_SIZE",
            )?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub resend_api_key: String,
    pub from_email: String,
}

impl EmailConfig {
    fn from_sources(toml: &TomlConfig) -> Result<Self> {
        Ok(Self {
            resend_api_key: require_value(
                env_override("DOKURU__EMAIL__RESEND_API_KEY")
                    .or_else(|| toml.email.resend_api_key.clone()),
                "DOKURU__EMAIL__RESEND_API_KEY",
            )?,
            from_email: require_value(
                env_override("DOKURU__EMAIL__FROM_EMAIL")
                    .or_else(|| Some(toml.email.from_email.clone())),
                "DOKURU__EMAIL__FROM_EMAIL",
            )?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub rust_env: String,
    pub is_production: bool,
    pub bootstrap: BootstrapConfig,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis_url: Option<String>,
    pub auth: AuthConfig,
    pub logging: LoggingConfig,
    pub cookie: CookieConfig,
    pub upload: UploadConfig,
    pub email: EmailConfig,
}

impl Config {
    pub fn load() -> Result<Self> {
        let toml = TomlConfig::load()?;
        let rust_env = get_rust_env(&toml.app.rust_env)?;
        let is_production = rust_env == "production";

        let config = Self {
            rust_env,
            is_production,
            bootstrap: BootstrapConfig::from_sources(&toml),
            server: ServerConfig::from_sources(&toml)?,
            database: DatabaseConfig::from_sources(&toml)?,
            redis_url: env_override("DOKURU__REDIS__URL").or_else(|| toml.redis.url.clone()),
            auth: AuthConfig::from_sources(&toml)?,
            logging: LoggingConfig::from_sources(&toml),
            cookie: CookieConfig::from_sources(&toml, is_production),
            upload: UploadConfig::from_sources(&toml)?,
            email: EmailConfig::from_sources(&toml)?,
        };

        let _ = AUTH_RUNTIME.set(config.auth.clone());
        Ok(config)
    }
}

pub fn auth_runtime() -> &'static AuthConfig {
    AUTH_RUNTIME
        .get()
        .expect("Auth runtime config must be initialized before use")
}
