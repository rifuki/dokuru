pub mod codes;
pub mod error;
pub mod success;

pub use codes::ErrorCode;
pub use error::ApiError;
pub use success::ApiSuccess;

/// Type alias for API handler results
pub type ApiResult<T> = Result<ApiSuccess<T>, ApiError>;
