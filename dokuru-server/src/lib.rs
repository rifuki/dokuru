pub mod bootstrap;
pub mod feature;
pub mod infrastructure;
pub mod routes;
pub mod state;

// Re-export commonly used types
pub use infrastructure::web::response::{ApiError, ApiResult, ApiSuccess, ErrorCode};

/// Initialize crypto provider for rustls
/// This should be called before any crypto operations
pub fn init_crypto() {
    if rustls::crypto::ring::default_provider()
        .install_default()
        .is_err()
    {
        // Provider already installed, that's fine
        tracing::debug!("Crypto provider already installed");
    }
}
