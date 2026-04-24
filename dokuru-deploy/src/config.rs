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
