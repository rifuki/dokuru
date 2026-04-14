use std::sync::Arc;
use bollard::Docker;
use tokio::sync::RwLock;
use crate::feature::environments::Environment;
use crate::infrastructure::config::Config;

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
