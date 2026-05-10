use axum::http::{Method, header};
use tower_http::cors::{Any, CorsLayer};

use crate::api::infrastructure::config::Config;

pub fn build_cors_layer(config: &Config) -> CorsLayer {
    let origins = normalized_cors_origins(&config.server.cors_origins);
    let allow_any_origin = origins.iter().any(|origin| origin == "*");

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
            .into_iter()
            .map(|origin| origin.parse().expect("Invalid CORS origin in config"))
            .collect();
        cors.allow_origin(allowed_origins)
    }
}

fn normalized_cors_origins(origins: &[String]) -> Vec<String> {
    let normalized = origins
        .iter()
        .map(|origin| origin.trim())
        .filter(|origin| !origin.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        vec!["*".to_string()]
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::normalized_cors_origins;

    #[test]
    fn defaults_empty_cors_origin_list_to_any_origin() {
        assert_eq!(normalized_cors_origins(&[]), vec!["*".to_string()]);
        assert_eq!(
            normalized_cors_origins(&[" ".to_string()]),
            vec!["*".to_string()]
        );
    }

    #[test]
    fn trims_configured_cors_origins() {
        assert_eq!(
            normalized_cors_origins(&[" https://app.dokuru.rifuki.dev ".to_string()]),
            vec!["https://app.dokuru.rifuki.dev".to_string()],
        );
    }
}
