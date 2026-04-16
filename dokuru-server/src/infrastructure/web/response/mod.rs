pub mod codes;
mod error;
mod success;

pub use error::ApiError;
pub use success::ApiSuccess;

pub type ApiResult<T> = Result<ApiSuccess<T>, ApiError>;
