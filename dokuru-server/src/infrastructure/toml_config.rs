use config::{Config as ConfigBuilder, Environment, File, FileFormat};
use serde::Deserialize;
use std::path::PathBuf;
use toml_edit::{DocumentMut, Item};

#[derive(Debug, Clone, Deserialize)]
pub struct TomlConfig {
    pub app: AppConfig,
    pub bootstrap: BootstrapConfig,
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
pub struct BootstrapConfig {
    pub enabled: bool,
    pub admin_email: String,
    pub admin_username: String,
    pub admin_name: String,
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

pub fn config_dir() -> PathBuf {
    PathBuf::from("config")
}

pub fn local_config_path() -> PathBuf {
    config_dir().join("local.toml")
}

pub fn secrets_config_path() -> PathBuf {
    config_dir().join("secrets.toml")
}

pub fn read_toml_document(path: &std::path::Path) -> eyre::Result<Option<DocumentMut>> {
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|error| eyre::eyre!("Failed to read {}: {error}", path.display()))?;

    let value = content
        .parse::<DocumentMut>()
        .map_err(|error| eyre::eyre!("Failed to parse {}: {error}", path.display()))?;

    Ok(Some(value))
}

pub fn value_at_path<'a>(value: &'a DocumentMut, path: &[&str]) -> Option<&'a Item> {
    let mut current: &Item = value.as_item();

    for segment in path {
        current = current.get(*segment)?;
    }

    Some(current)
}

pub fn read_local_config_string() -> eyre::Result<String> {
    let path = local_config_path();
    if !path.exists() {
        return Ok(String::new());
    }

    std::fs::read_to_string(&path)
        .map_err(|error| eyre::eyre!("Failed to read {}: {error}", path.display()))
}

pub fn write_local_config_string(content: &str) -> eyre::Result<()> {
    let trimmed = content.trim();
    if !trimmed.is_empty() {
        trimmed
            .parse::<DocumentMut>()
            .map_err(|error| eyre::eyre!("Invalid TOML content: {error}"))?;
    }

    let path = local_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| eyre::eyre!("Failed to create {}: {error}", parent.display()))?;
    }

    std::fs::write(&path, if trimmed.is_empty() { "" } else { content })
        .map_err(|error| eyre::eyre!("Failed to write {}: {error}", path.display()))
}
