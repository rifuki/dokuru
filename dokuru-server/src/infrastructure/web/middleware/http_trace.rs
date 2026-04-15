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

use crate::infrastructure::web::response::ApiError;

struct ClientInfo {
    user_agent: String,
    x_forwarded_for: Option<String>,
    x_real_ip: Option<String>,
}

impl ClientInfo {
    fn extract(req: &Request) -> ClientInfo {
        let headers = req.headers();

        ClientInfo {
            user_agent: headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("Unknown")
                .to_string(),
            x_forwarded_for: headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            x_real_ip: headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
        }
    }
}

fn log_level_for_status(status: StatusCode) -> Level {
    match status.as_u16() {
        100..=199 => Level::Debug,
        200..=299 => Level::Info,
        300..=399 => Level::Info,
        400..=499 => Level::Warn,
        500..=599 => Level::Error,
        _ => Level::Info,
    }
}

fn log_emoji_for_status(status: StatusCode) -> &'static str {
    match status.as_u16() {
        100..=199 => "ℹ️",
        200..=299 => "✅",
        300..=399 => "🔄",
        400..=499 => {
            if status.as_u16() == 429 {
                "🧱"
            } else {
                "⚠️"
            }
        }
        500..=599 => "🔥",
        _ => "ℹ️",
    }
}

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

    let span = info_span!(
        "http_request",
        method = %method,
        uri = %uri.path(),
        version = ?version,
        client_ip = %client_ip,
    );

    async move {
        debug!(
            target: "http_trace::on_request",
            "➡️ Started processing request - method: {method}, uri: {}, client_ip: {client_ip}, user_agent: {}",
            uri.path(),
            client_info.user_agent
        );

        let response = next.run(req).await;
        let latency = start.elapsed();
        let status = response.status();

        let emoji = log_emoji_for_status(status);
        let level = log_level_for_status(status);

        let skip_info_log = matches!(uri.path(), "/health" | "/ready" | "/live")
            && status.is_success()
            && level == Level::Info;

        if skip_info_log {
            return Ok(response);
        }

        log!(
            target: "http_trace::on_response",
            level,
            "{emoji} Responded - status: {status}, latency: {latency:?}, method: {method}, uri: {}, user_agent: {}, x_forwarded_for: {:?}, x_real_ip: {:?}",
            uri.path(),
            client_info.user_agent,
            client_info.x_forwarded_for,
            client_info.x_real_ip
        );

        if status.as_u16() == 429 {
            return Err(ApiError::default()
                .with_code(StatusCode::TOO_MANY_REQUESTS)
                .with_message("Rate limit exceeded. Please try again later."));
        }

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
