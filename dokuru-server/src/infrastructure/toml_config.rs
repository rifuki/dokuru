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
    pub cookie: CookieConfig,
    pub upload: UploadConfig,
    pub email: EmailConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub rust_env: String,
    pub rust_log: String,
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
    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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

#[must_use]
pub fn config_dir() -> PathBuf {
    PathBuf::from("config")
}

#[must_use]
pub fn local_config_path() -> PathBuf {
    config_dir().join("local.toml")
}

#[must_use]
pub fn secrets_config_path() -> PathBuf {
    config_dir().join("secrets.toml")
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
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

#[must_use]
pub fn value_at_path<'a>(value: &'a DocumentMut, path: &[&str]) -> Option<&'a Item> {
    let mut current: &Item = value.as_item();

    for segment in path {
        current = current.get(*segment)?;
    }

    Some(current)
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn read_local_config_string() -> eyre::Result<String> {
    let path = local_config_path();
    if !path.exists() {
        return Ok(String::new());
    }

    std::fs::read_to_string(&path)
        .map_err(|error| eyre::eyre!("Failed to read {}: {error}", path.display()))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
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

/// Update a single field inside a TOML config file (local.toml or secrets.toml),
/// creating the file and any missing tables if needed. Preserves existing content.
/// # Panics
///
/// Panics if required runtime invariants are violated.
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn write_field_to_toml(target: &str, path: &[&str], value: &str) -> eyre::Result<()> {
    let file_path = match target {
        "secrets" => secrets_config_path(),
        _ => local_config_path(),
    };

    // Load or create document
    let mut doc = if file_path.exists() {
        let raw = std::fs::read_to_string(&file_path)
            .map_err(|e| eyre::eyre!("Failed to read {}: {e}", file_path.display()))?;
        raw.parse::<DocumentMut>()
            .map_err(|e| eyre::eyre!("Failed to parse {}: {e}", file_path.display()))?
    } else {
        DocumentMut::new()
    };

    if path.is_empty() {
        return Err(eyre::eyre!("Empty path provided"));
    }

    // Navigate / create tables up to the last segment
    let (table_path, field_key) = path.split_at(path.len() - 1);
    let field_key = field_key[0];

    let mut table = doc.as_table_mut();
    for &segment in table_path {
        if !table.contains_key(segment) {
            table.insert(segment, toml_edit::Item::Table(toml_edit::Table::new()));
        }
        table = table
            .get_mut(segment)
            .and_then(|item| item.as_table_mut())
            .ok_or_else(|| eyre::eyre!("Path segment '{segment}' is not a table"))?;
    }

    // Detect best TOML type from value string
    let toml_value = if value == "true" || value == "false" {
        toml_edit::value(value.parse::<bool>().unwrap())
    } else if let Ok(n) = value.parse::<i64>() {
        toml_edit::value(n)
    } else if let Ok(f) = value.parse::<f64>() {
        toml_edit::value(f)
    } else {
        toml_edit::value(value)
    };

    table.insert(field_key, toml_value);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| eyre::eyre!("Failed to create dir {}: {e}", parent.display()))?;
    }

    std::fs::write(&file_path, doc.to_string())
        .map_err(|e| eyre::eyre!("Failed to write {}: {e}", file_path.display()))
}
