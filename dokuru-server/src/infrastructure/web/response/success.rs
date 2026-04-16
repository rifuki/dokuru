use axum::{
    body::Body,
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use axum_extra::extract::{CookieJar, cookie::Cookie};
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
    pub cookie_jar: CookieJar,
    #[serde(skip)]
    headers: HeaderMap,
}

// Default implementation for ApiSuccess
impl<T: Serialize> Default for ApiSuccess<T> {
    /// Default: 200 OK
    fn default() -> Self {
        Self {
            success: true,
            code: 200,
            data: None,
            message: "Success".to_string(),
            timestamp: Utc::now().timestamp(),
            cookie_jar: CookieJar::new(),
            headers: HeaderMap::new(),
        }
    }
}

// Builder methods
impl<T: Serialize> ApiSuccess<T> {
    /// Set HTTP status code
    pub fn with_code(mut self, code: StatusCode) -> Self {
        self.code = code.as_u16();
        self
    }

    /// Attach data payload
    pub fn with_data(mut self, data: T) -> Self {
        self.data = Some(data);
        self
    }

    /// Set message
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }

    /// Add cookie
    pub fn with_cookie(mut self, cookie: Cookie<'static>) -> Self {
        self.cookie_jar = self.cookie_jar.add(cookie);
        self
    }

    /// Attaches a `CookieJar` to the response, for setting multiple cookies.
    pub fn with_jar(mut self, jar: CookieJar) -> Self {
        self.cookie_jar = jar;
        self
    }

    /// Add custom header
    pub fn with_header(mut self, key: HeaderName, value: &str) -> Self {
        if let Ok(val) = HeaderValue::from_str(value) {
            self.headers.insert(key, val);
        }
        self
    }
}

// Getters
impl<T: Serialize> ApiSuccess<T> {
    /// Get the HTTP status code for this response
    pub fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.code).unwrap_or(StatusCode::OK)
    }
}

// Convert ApiSuccess into an HTTP response
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

        for cookie in self.cookie_jar.iter() {
            builder = builder.header(header::SET_COOKIE, cookie.to_string());
        }

        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .expect("Failed to build response. This should never happen.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Serialize)]
    struct User {
        id: i32,
    }

    #[test]
    fn test_default() {
        let res: ApiSuccess<User> = ApiSuccess::default();
        assert_eq!(res.status_code(), StatusCode::OK);
        assert_eq!(res.message, "Success");
    }

    #[test]
    fn test_builder() {
        let res = ApiSuccess::default()
            .with_code(StatusCode::CREATED)
            .with_data(User { id: 1 })
            .with_message("Created");

        assert_eq!(res.status_code(), StatusCode::CREATED);
        assert_eq!(res.message, "Created");
        assert!(res.data.is_some());
    }
}
