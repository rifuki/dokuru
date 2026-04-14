use axum::http::{header, Method};
use tower_http::cors::{Any, CorsLayer};

use crate::infrastructure::config::Config;

pub fn build_cors_layer(config: &Config) -> CorsLayer {
    let origins = &config.server.cors_origins;
    let allow_any_origin = origins.len() == 1 && origins[0] == "*";

    if allow_any_origin {
        eprintln!("WARNING: CORS_ALLOWED_ORIGINS='*' — use specific origins in production");
    }

    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers(Any)
        .expose_headers([header::CONTENT_TYPE])
        .allow_credentials(false);

    if allow_any_origin {
        cors.allow_origin(Any)
    } else {
        let allowed_origins: Vec<axum::http::HeaderValue> = origins
            .iter()
            .map(|o| o.parse().expect("Invalid CORS origin in config"))
            .collect();
        cors.allow_origin(allowed_origins)
    }
}
