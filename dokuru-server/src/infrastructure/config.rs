use eyre::{Result, WrapErr};
use std::env;
use std::collections::HashMap;

fn require_env(key: &str) -> Result<String> {
    env::var(key).wrap_err_with(|| format!("Missing required environment variable: {key}"))
}

fn get_rust_env() -> Result<String> {
    let rust_env = require_env("RUST_ENV")?;
    if cfg!(debug_assertions) && rust_env == "production" {
        eyre::bail!("RUST_ENV cannot be 'production' in debug mode");
    } else if !cfg!(debug_assertions) && rust_env != "production" {
        eyre::bail!("RUST_ENV must be 'production' in release mode");
    } else {
        Ok(rust_env)
    }
}

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
    pub max_sessions: usize,
}

#[derive(Debug, Clone)]
pub struct TerminalConfig {
    pub sandbox_images: HashMap<String, String>,
    pub memory: String,
    pub cpus: String,
    pub pids_limit: u32,
    pub tmpfs_size: String,
    pub storage_size: Option<String>,
}

impl TerminalConfig {
    fn from_env() -> Result<Self> {
        let arch_image = require_env("SANDBOX_IMAGE_ARCH")?;
        let alpine_image = require_env("SANDBOX_IMAGE_ALPINE")?;
        let debian_image = require_env("SANDBOX_IMAGE_DEBIAN")?;

        let mut sandbox_images = HashMap::new();
        sandbox_images.insert("arch".to_string(), arch_image);
        sandbox_images.insert("alpine".to_string(), alpine_image);
        sandbox_images.insert("debian".to_string(), debian_image);

        let memory = require_env("TERMINAL_MEMORY")?;
        let cpus = require_env("TERMINAL_CPUS")?;
        let pids_limit = require_env("TERMINAL_PIDS_LIMIT")?
            .parse::<u32>()
            .wrap_err("TERMINAL_PIDS_LIMIT must be a valid u32 integer")?;
        let tmpfs_size = require_env("TERMINAL_TMPFS_SIZE")?;
        let storage_size = env::var("TERMINAL_STORAGE_SIZE").ok();

        Ok(Self { 
            sandbox_images,
            memory,
            cpus,
            pids_limit,
            tmpfs_size,
            storage_size,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LastFmConfig {
    pub api_key: String,
    pub shared_secret: String,
    pub username: String,
}

impl LastFmConfig {
    fn from_env() -> Result<Self> {
        Ok(Self {
            api_key: require_env("LASTFM_API_KEY")?,
            shared_secret: require_env("LASTFM_SHARED_SECRET")?,
            username: require_env("LASTFM_USERNAME")?,
        })
    }
}

impl ServerConfig {
    fn from_env() -> Result<Self> {
        let port = require_env("PORT")?
            .parse::<u16>()
            .wrap_err("PORT must be a valid u16 integer")?;
        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();
        let max_sessions = require_env("MAX_SESSIONS")?
            .parse::<usize>()
            .wrap_err("MAX_SESSIONS must be a valid usize integer")?;

        Ok(Self {
            port,
            cors_allowed_origins,
            max_sessions,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub rust_env: String,
    pub is_production: bool,
    pub server: ServerConfig,
    pub terminal: TerminalConfig,
    pub lastfm: LastFmConfig,
}

impl Config {
    pub fn load() -> Result<Self> {
        let rust_env = get_rust_env()?;
        let is_production = rust_env == "production";

        Ok(Self {
            rust_env,
            is_production,
            server: ServerConfig::from_env()?,
            terminal: TerminalConfig::from_env()?,
            lastfm: LastFmConfig::from_env()?,
        })
    }
}
