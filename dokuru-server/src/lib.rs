// Allow overly noisy pedantic/nursery lints
#![allow(clippy::must_use_candidate)] // Too many false positives on getters
#![allow(clippy::doc_markdown)] // Backticks in docs - style preference
#![allow(clippy::missing_panics_doc)] // Most panics are in test/setup code
#![allow(clippy::module_name_repetitions)] // e.g. ApiKeyService in api_key module is fine
#![allow(clippy::missing_errors_doc)] // Would require 70+ doc comments - add gradually

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
