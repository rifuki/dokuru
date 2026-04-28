use axum::http::{HeaderMap, header};
use url::Url;

use crate::infrastructure::config::Config;

const DEV_FRONTEND_ORIGIN: &str = "http://localhost:5173";
const PRODUCTION_FRONTEND_ORIGIN: &str = "https://app.dokuru.rifuki.dev";

#[must_use]
pub(crate) fn frontend_origin(headers: &HeaderMap, config: &Config) -> String {
    header_origin(headers)
        .or_else(|| referer_origin(headers))
        .filter(|origin| is_allowed_origin(origin, config))
        .or_else(|| configured_frontend_origin(config))
        .unwrap_or_else(|| fallback_frontend_origin(config).to_string())
}

fn header_origin(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(trim_trailing_slash)
}

fn referer_origin(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::REFERER)
        .and_then(|value| value.to_str().ok())
        .and_then(|referer| Url::parse(referer).ok())
        .map(|url| url.origin().ascii_serialization())
}

fn is_allowed_origin(origin: &str, config: &Config) -> bool {
    config.server.cors_allowed_origins.iter().any(|allowed| {
        allowed == "*" || trim_trailing_slash(allowed.trim()) == trim_trailing_slash(origin)
    })
}

fn configured_frontend_origin(config: &Config) -> Option<String> {
    if config.is_production {
        config
            .server
            .cors_allowed_origins
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .find(|origin| origin.starts_with("https://") && !is_localhost_origin(origin))
            .map(trim_trailing_slash)
    } else {
        config
            .server
            .cors_allowed_origins
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .find(|origin| origin.starts_with("http://localhost"))
            .map(trim_trailing_slash)
    }
}

const fn fallback_frontend_origin(config: &Config) -> &'static str {
    if config.is_production {
        PRODUCTION_FRONTEND_ORIGIN
    } else {
        DEV_FRONTEND_ORIGIN
    }
}

fn is_localhost_origin(origin: &str) -> bool {
    origin.contains("//localhost") || origin.contains("//127.0.0.1")
}

fn trim_trailing_slash(origin: &str) -> String {
    origin.trim_end_matches('/').to_string()
}
