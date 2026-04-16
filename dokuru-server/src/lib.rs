// Allow some pedantic/nursery lints that are too noisy for production code
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::must_use_candidate)]
#![allow(clippy::return_self_not_must_use)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::doc_markdown)]
#![allow(clippy::cognitive_complexity)]
#![allow(clippy::too_many_lines)]
#![allow(clippy::needless_pass_by_value)]
#![allow(clippy::trait_duplication_in_bounds)]

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
