use std::sync::{Arc, atomic::AtomicUsize};
use std::time::SystemTime;
use dashmap::DashMap;
use crate::infrastructure::Config;

#[derive(Debug, Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub current_sessions: Arc<AtomicUsize>,
    pub tickets: Arc<DashMap<String, (SystemTime, String)>>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        Self {
            config: Arc::new(config),
            current_sessions: Arc::new(AtomicUsize::new(0)),
            tickets: Arc::new(DashMap::new()),
        }
    }
}
