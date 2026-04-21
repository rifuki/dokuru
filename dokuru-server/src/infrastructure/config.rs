use std::env;

use axum_extra::extract::cookie::SameSite;
use eyre::{Result, WrapErr};

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
}

impl ServerConfig {
    fn from_env() -> Result<Self> {
        let port = require_env("PORT")?
            .parse()
            .wrap_err("PORT must be a valid number")?;

        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();

        Ok(Self {
            port,
            cors_allowed_origins,
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
    fn from_env() -> Result<Self> {
        let url = require_env("DATABASE_URL")?;
        let max_connections = env::var("DB_MAX_CONNECTIONS")
            .unwrap_or_else(|_| "10".to_string())
            .parse()
            .wrap_err("DB_MAX_CONNECTIONS must be a valid number")?;
        let min_connections = env::var("DB_MIN_CONNECTIONS")
            .unwrap_or_else(|_| "1".to_string())
            .parse()
            .wrap_err("DB_MIN_CONNECTIONS must be a valid number")?;

        Ok(Self {
            url,
            max_connections,
            min_connections,
        })
    }
}

/// Cookie SameSite policy - configurable via env for flexibility
///
/// Use cases:
/// - "strict": Same domain only, maximum security
/// - "lax": Top-level navigation allowed (default for cross-port dev)
/// - "none": Cross-domain with HTTPS + Secure flag
#[derive(Debug, Clone)]
pub struct CookieConfig {
    pub same_site: SameSite,
    pub secure: bool,
    pub http_only: bool,
}

impl CookieConfig {
    fn from_env(is_production: bool) -> Self {
        // Parse SameSite from env, fallback based on environment
        let same_site = env::var("COOKIE_SAMESITE").map_or_else(
            |_| Self::default_same_site(is_production),
            |s| match s.to_lowercase().as_str() {
                "strict" => SameSite::Strict,
                "lax" => SameSite::Lax,
                "none" => SameSite::None,
                _ => {
                    eprintln!("Warning: Invalid COOKIE_SAMESITE '{s}', using default");
                    Self::default_same_site(is_production)
                }
            },
        );

        // Secure flag: env override or default based on production
        let secure = env::var("COOKIE_SECURE")
            .map(|s| s.parse().unwrap_or(is_production))
            .unwrap_or(is_production);

        // httpOnly is always true for auth cookies (security)
        let http_only = env::var("COOKIE_HTTPONLY")
            .map(|s| s.parse().unwrap_or(true))
            .unwrap_or(true);

        Self {
            same_site,
            secure,
            http_only,
        }
    }

    const fn default_same_site(is_production: bool) -> SameSite {
        if is_production {
            SameSite::Strict
        } else {
            // Development: Lax allows cross-port (localhost:5173 -> localhost:8080)
            SameSite::Lax
        }
    }
}

#[derive(Debug, Clone)]
pub struct UploadConfig {
    /// Directory where uploaded files are stored (env: UPLOAD_DIR, default: "./uploads").
    pub upload_dir: String,
    /// Base URL used to build public URLs for uploaded files
    /// (env: UPLOAD_BASE_URL, default: "http://localhost:8080/media").
    pub base_url: String,
    /// Maximum allowed avatar file size in bytes
    /// (env: MAX_AVATAR_SIZE, default: 2 MiB).
    pub max_avatar_size: usize,
}

impl UploadConfig {
    fn from_env() -> Self {
        let upload_dir = env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".to_string());

        let base_url = env::var("UPLOAD_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:8080/media".to_string());

        let max_avatar_size = env::var("MAX_AVATAR_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2_097_152); // 2 MiB

        Self {
            upload_dir,
            base_url,
            max_avatar_size,
        }
    }
}

#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub resend_api_key: String,
    pub from_email: String,
}

impl EmailConfig {
    fn from_env() -> Result<Self> {
        let resend_api_key = require_env("RESEND_API_KEY")?;
        let from_email = require_env("RESEND_FROM_EMAIL")?;

        Ok(Self {
            resend_api_key,
            from_email,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub rust_env: String,
    pub is_production: bool,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis_url: Option<String>,
    pub cookie: CookieConfig,
    pub upload: UploadConfig,
    pub email: EmailConfig,
}

impl Config {
    pub fn load() -> Result<Self> {
        let rust_env = get_rust_env()?;
        let is_production = rust_env == "production";

        // Validate required JWT secrets at startup (fail fast)
        require_env("JWT_ACCESS_SECRET")?;
        require_env("JWT_REFRESH_SECRET")?;

        // Redis is optional - if not configured, caching features will be disabled
        let redis_url = env::var("REDIS_URL").ok();

        Ok(Self {
            rust_env,
            is_production,
            server: ServerConfig::from_env()?,
            database: DatabaseConfig::from_env()?,
            redis_url,
            cookie: CookieConfig::from_env(is_production),
            upload: UploadConfig::from_env(),
            email: EmailConfig::from_env()?,
        })
    }
}
