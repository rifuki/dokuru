use std::{
    net::SocketAddr,
    time::{Duration as StdDuration, Instant},
};

use axum::{
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use tracing::{
    Instrument, debug, info_span,
    log::{Level, log},
};

use crate::infrastructure::web::{middleware::request_id::RequestId, response::ApiError};

/// Struct to capture client-related info for logging purposes.
struct ClientInfo {
    user_agent: String,
    x_forwarded_for: Option<String>,
    x_real_ip: Option<String>,
}

impl ClientInfo {
    fn extract(req: &Request) -> Self {
        let headers = req.headers();

        Self {
            user_agent: headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("Unknown")
                .to_string(),
            x_forwarded_for: headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .map(std::string::ToString::to_string),
            x_real_ip: headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(std::string::ToString::to_string),
        }
    }
}

/// Determines log level based on status code.
const fn log_level_for_status(status: StatusCode) -> Level {
    match status.as_u16() {
        100..=199 => Level::Debug, // Informational responses
        400..=499 => Level::Warn,  // Client errors
        500..=599 => Level::Error, // Server errors
        _ => Level::Info,          // Default (200-399 and others)
    }
}

const fn log_emoji_for_status(status: StatusCode) -> &'static str {
    match status.as_u16() {
        200..=299 => "✅", // Successful responses
        300..=399 => "🔄", // Redirection messages
        429 => "🧱",       // Rate limit exceeded
        400..=499 => "⚠️", // Client errors
        500..=599 => "🔥", // Server errors
        _ => "ℹ️",         // Default (including 100-199 informational)
    }
}

/// HTTP middleware to trace requests and log responses conditionally.
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn http_trace_middleware(
    ConnectInfo(client_ip): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();
    let version = req.version();
    let client_info = ClientInfo::extract(&req);
    let request_id = req
        .extensions()
        .get::<RequestId>()
        .map_or_else(|| "unknown".to_string(), |r| r.0.clone());

    // Create a span that will wrap the entire request-response lifecycle.
    let span = info_span!(
        "http_request",
        method = %method,
        uri = %uri.path(),
        version = ?version,
        client_ip = %client_ip,
        request_id = %request_id,
    );

    // The `.instrument()` call is crucial. It ensures that any log created
    // within this async block will automatically be associated with our span.
    async move {
        // Log the start of the request at DEBUG level.
        debug!(
            target: "http_trace::on_request",
            "➡️ Started processing request - method: {method}, uri: {}, client_ip: {client_ip}, user_agent: {}",
            uri.path(),
            client_info.user_agent
        );

        // Process the request by calling the next middleware or the handler.
        let response = next.run(req).await;
        let latency = start.elapsed();
        let status = response.status();

        let emoji = log_emoji_for_status(status);
        let level = log_level_for_status(status);

        // Determine if info-level log should be skipped for noisy health endpoints
        let skip_info_log = matches!(uri.path(), "/health" | "/ready" | "/live")
            && status.is_success()
            && level == Level::Info;

        if skip_info_log {
            return Ok(response);
        }

        // Log with dynamic level
        log!(
            target: "http_trace::on_response",
            level,
            "{emoji} Responded - status: {status}, latency: {latency:?}, method: {method}, uri: {}, user_agent: {}, x_forwarded_for: {:?}, x_real_ip: {:?}",
            uri.path(),
            client_info.user_agent,
            client_info.x_forwarded_for,
            client_info.x_real_ip
        );

        // If the status code is 429 (Too Many Requests), return a custom error.
        if status.as_u16() == 429 {
            return Err(ApiError::default()
                .with_code(StatusCode::TOO_MANY_REQUESTS)
                .with_message("Rate limit exceeded. Please try again later."));
        }

        // Log slow responses
        let slow_threshold = StdDuration::from_millis(500);
        if latency > slow_threshold {
            log!(
                target: "http_trace::slow",
                Level::Warn,
                "⏳ Slow response - status: {}, latency: {:?}, method: {}, uri: {}, user_agent: {}, x_forwarded_for: {:?}, x_real_ip: {:?}",
                status,
                latency,
                method,
                uri.path(),
                client_info.user_agent,
                client_info.x_forwarded_for,
                client_info.x_real_ip
            );
        }

        Ok(response)
    }
    .instrument(span)
    .await
}
