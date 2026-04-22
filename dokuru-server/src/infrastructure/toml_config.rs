use config::{Config as ConfigBuilder, Environment, File, FileFormat};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct TomlConfig {
    pub app: AppConfig,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub auth: AuthConfig,
    pub logging: LoggingConfig,
    pub cookie: CookieConfig,
    pub upload: UploadConfig,
    pub email: EmailConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub rust_env: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: Option<String>,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    pub access_secret: Option<String>,
    pub refresh_secret: Option<String>,
    pub access_expiry_secs: i64,
    pub refresh_expiry_secs: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingConfig {
    pub default_level: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CookieConfig {
    pub same_site: String,
    pub secure: bool,
    pub http_only: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UploadConfig {
    pub dir: String,
    pub base_url: String,
    pub max_avatar_size: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmailConfig {
    pub resend_api_key: Option<String>,
    pub from_email: String,
}

impl TomlConfig {
    pub fn load() -> eyre::Result<Self> {
        ConfigBuilder::builder()
            .add_source(File::from_str(
                include_str!("../../config/defaults.toml"),
                FileFormat::Toml,
            ))
            .add_source(File::with_name("config/local").required(false))
            .add_source(File::with_name("config/secrets").required(false))
            .add_source(
                Environment::with_prefix("DOKURU")
                    .separator("__")
                    .list_separator(",")
                    .with_list_parse_key("server.cors_allowed_origins")
                    .try_parsing(true),
            )
            .build()
            .map_err(|error| eyre::eyre!("Failed to load TOML config: {error}"))?
            .try_deserialize()
            .map_err(|error| eyre::eyre!("Failed to deserialize TOML config: {error}"))
    }
}
