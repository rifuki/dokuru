use serde::Deserialize;

/// Log level change request
#[derive(Debug, Deserialize)]
pub struct SetLogLevelRequest {
    /// Log level filter string, e.g. "debug", "info", "warn", "error"
    /// Supports full tracing filter syntax: "api=debug,sqlx=warn"
    pub level: String,
}
