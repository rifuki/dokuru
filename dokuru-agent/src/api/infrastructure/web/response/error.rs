use std::fmt::Display;

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Serialize;
use tracing::error;

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    success: bool,
    pub code: u16,
    pub error_code: Option<String>,
    pub message: String,
    pub details: Option<String>,
    timestamp: i64,
}

impl Default for ApiError {
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

impl ApiError {
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.code = code.as_u16();
        self
    }

    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn with_debug(mut self, details: impl Into<String> + Display) -> Self {
        let details_str = details.to_string();
        error!(target: "api_error", details = %details_str, "Error occurred");

        if cfg!(debug_assertions) {
            self.details = Some(details_str);
        }
        self
    }
}

impl ApiError {
    pub fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = Json(self);
        (status, body).into_response()
    }
}
