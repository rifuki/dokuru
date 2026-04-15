use axum::{
    body::Body,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiSuccess<T: Serialize> {
    success: bool,
    code: u16,
    pub data: Option<T>,
    pub message: String,
    timestamp: i64,

    #[serde(skip)]
    headers: HeaderMap,
}

impl<T: Serialize> Default for ApiSuccess<T> {
    fn default() -> Self {
        Self {
            success: true,
            code: 200,
            data: None,
            message: "Success".to_string(),
            timestamp: Utc::now().timestamp(),
            headers: HeaderMap::new(),
        }
    }
}

impl<T: Serialize> ApiSuccess<T> {
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.code = code.as_u16();
        self
    }

    pub fn with_data(mut self, data: T) -> Self {
        self.data = Some(data);
        self
    }

    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    pub fn with_header(mut self, key: HeaderName, value: &str) -> Self {
        if let Ok(val) = HeaderValue::from_str(value) {
            self.headers.insert(key, val);
        }
        self
    }
}

impl<T: Serialize> ApiSuccess<T> {
    pub fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.code).unwrap_or(StatusCode::OK)
    }
}

impl<T: Serialize> IntoResponse for ApiSuccess<T> {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = serde_json::to_string(&self)
            .expect("Failed to serialize ApiSuccess. This should never happen.");

        let mut builder = Response::builder().status(status);

        for (key, value) in self.headers {
            if let Some(k) = key {
                builder = builder.header(k, value);
            }
        }

        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .expect("Failed to build response. This should never happen.")
    }
}
