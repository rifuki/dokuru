use serde::{Deserialize, Serialize};

/// Log level change request
#[derive(Debug, Deserialize)]
pub struct SetLogLevelRequest {
    /// Log level filter string, e.g. "debug", "info", "warn", "error"
    /// Supports full tracing filter syntax: "api=debug,sqlx=warn"
    pub level: String,
}

#[derive(Debug, Serialize)]
pub struct AdminLogsResponse {
    pub lines: Vec<String>,
    pub log_file: Option<String>,
    pub runtime_level: String,
}
