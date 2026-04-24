use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct DeployConfig {
    pub base_domain: String,
    pub landing_domain: String,
    pub www_domain: String,
    pub api_domain: String,
    pub db_name: String,
    pub db_user: String,
    pub db_password: String,
    pub jwt_access_secret: String,
    pub jwt_refresh_secret: String,
    pub resend_api_key: String,
}

impl DeployConfig {
    pub fn database_url(&self) -> String {
        format!(
            "postgres://{}:{}@dokuru-db:5432/{}",
            self.db_user, self.db_password, self.db_name
        )
    }

    pub fn cors_origins(&self) -> Vec<String> {
        vec![format!("https://{}", self.www_domain)]
    }

    pub fn upload_base_url(&self) -> String {
        format!("https://{}/media", self.api_domain)
    }
}

// TOML structures
#[derive(Debug, Serialize, Deserialize)]
pub struct LocalToml {
    pub app: AppConfig,
    pub server: ServerConfig,
    pub bootstrap: BootstrapConfig,
    pub upload: UploadConfig,
    pub cookie: CookieConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub rust_env: String,
    pub rust_log: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BootstrapConfig {
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadConfig {
    pub base_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CookieConfig {
    pub same_site: String,
    pub secure: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecretsToml {
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub auth: AuthConfig,
    pub email: EmailConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    pub access_secret: String,
    pub refresh_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailConfig {
    pub resend_api_key: String,
    pub from_email: String,
}
