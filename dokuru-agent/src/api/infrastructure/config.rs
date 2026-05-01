use eyre::{Result, WrapErr};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Config {
    pub server: ServerConfig,
    pub docker: DockerConfig,
    pub auth: AuthConfig,
    pub access: AccessConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DockerConfig {
    pub socket: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AuthConfig {
    pub token_hash: String,
    /// Actual token for relay mode (stored securely, only used for WebSocket auth)
    pub relay_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AccessConfig {
    pub mode: AccessMode,
    pub url: String,
    pub cloudflare_tunnel_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AccessMode {
    Direct,
    #[default]
    Cloudflare,
    Domain,
    Relay,
}

impl Default for AccessConfig {
    fn default() -> Self {
        Self {
            mode: AccessMode::Cloudflare,
            url: String::new(),
            cloudflare_tunnel_id: None,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3939,
            host: "0.0.0.0".to_string(),
            cors_origins: vec!["*".to_string()],
        }
    }
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            socket: "/var/run/docker.sock".to_string(),
        }
    }
}

pub fn config_path_in(config_dir: &Path) -> PathBuf {
    config_dir.join("config.toml")
}

pub fn resolve_config_path() -> PathBuf {
    if let Ok(path) = std::env::var("DOKURU_CONFIG") {
        return PathBuf::from(path);
    }

    let production = config_path_in(Path::new("/etc/dokuru"));
    if production.exists() {
        return production;
    }

    if let Ok(current_dir) = std::env::current_dir() {
        let local = current_dir.join("config.toml");
        if local.exists() {
            return local;
        }
    }

    production
}

impl Config {
    pub fn load() -> Result<Self> {
        Self::load_from_path(resolve_config_path())
    }

    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let path_string = path.to_string_lossy().to_string();

        let settings = config::Config::builder()
            .add_source(config::File::new(&path_string, config::FileFormat::Toml).required(false))
            .add_source(
                config::Environment::with_prefix("DOKURU")
                    .separator("__")
                    .list_separator(",")
                    .with_list_parse_key("server.cors_origins"),
            )
            .build()
            .wrap_err_with(|| format!("Failed to load Dokuru config from {}", path.display()))?;

        settings
            .try_deserialize::<Self>()
            .wrap_err_with(|| format!("Failed to parse Dokuru config from {}", path.display()))
    }

    pub fn server_addr(&self) -> Result<SocketAddr> {
        let addr = format!("{}:{}", self.server.host, self.server.port);
        addr.parse()
            .wrap_err_with(|| format!("Invalid host:port combination: {addr}"))
    }
}
