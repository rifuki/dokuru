use std::fmt::Display;

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Serialize;
use tracing::error;

use super::codes::ErrorCode;

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    success: bool,
    pub code: u16,
    pub error_code: Option<String>,
    pub message: String,
    pub details: Option<String>,
    timestamp: i64,
}

// Default implementation for ApiError
impl Default for ApiError {
    /// Default: 500 Internal Server Error (safe, no details exposed)
    fn default() -> Self {
        Self {
            success: false,
            code: 500,
            error_code: None,
            message: "An internal server error occurred".to_string(),
            details: None,
            timestamp: Utc::now().timestamp(),
        }
    }
}

// Builder methods
impl ApiError {
    /// Set HTTP status code
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.code = code.as_u16();
        self
    }

    /// Set structured error code (e.g. AUTH_001)
    pub fn with_error_code(mut self, error_code: ErrorCode) -> Self {
        self.error_code = Some(error_code.to_string());
        self
    }

    /// Set error message
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    /// Add error details
    ///
    /// ⚠️ **WARNING**: May expose sensitive info! Use `log_only()` or `with_debug()` instead.
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    /// Log error server-side, return generic error to client
    pub fn log_only(self, details: impl Display) -> Self {
        error!(target: "api_error", details = %details, "Error occurred");
        self
    }

    /// Add details in debug mode only (safe for production)
    pub fn with_debug(mut self, details: impl Into<String> + Display) -> Self {
        let details_str = details.to_string();
        error!(target: "api_error", details = %details_str, "Error occurred");

        if cfg!(debug_assertions) {
            self.details = Some(details_str);
        }
        self
    }
}

// Getters
impl ApiError {
    pub fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

// Convert ApiError into an HTTP response
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = Json(self);
        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default() {
        let err = ApiError::default();
        assert_eq!(err.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(err.details.is_none());
        assert!(err.error_code.is_none());
    }

    #[test]
    fn test_builder() {
        use crate::infrastructure::web::response::codes::auth;
        let err = ApiError::default()
            .with_code(StatusCode::UNAUTHORIZED)
            .with_error_code(auth::INVALID_CREDENTIALS)
            .with_message("Invalid credentials");

        assert_eq!(err.status_code(), StatusCode::UNAUTHORIZED);
        assert_eq!(err.message, "Invalid credentials");
        assert_eq!(err.error_code, Some("AUTH_001".to_string()));
    }

    #[test]
    fn test_debug_in_prod_hides_details() {
        let err = ApiError::default().with_debug("Secret");

        if cfg!(debug_assertions) {
            assert_eq!(err.details, Some("Secret".to_string()));
        } else {
            assert!(err.details.is_none());
        }
    }
}
