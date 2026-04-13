use std::sync::Arc;
use bollard::Docker;
use crate::infrastructure::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub docker: Docker,
}

impl AppState {
    pub fn new(config: Arc<Config>, docker: Docker) -> Self {
        Self { config, docker }
    }
}
