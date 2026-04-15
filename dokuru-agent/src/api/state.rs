use super::feature::environments::Environment;
use super::infrastructure::config::Config;
use bollard::Docker;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub docker: Docker,
    /// Registry of remote environments (persisted to disk)
    pub environments: Arc<RwLock<Vec<Environment>>>,
}

impl AppState {
    pub fn new(config: Arc<Config>, docker: Docker, environments: Vec<Environment>) -> Self {
        Self {
            config,
            docker,
            environments: Arc::new(RwLock::new(environments)),
        }
    }
}
