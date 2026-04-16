pub use http_body_util::BodyExt;
pub use tower::ServiceExt;

use std::sync::OnceLock;

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, Response, StatusCode, header},
};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use testcontainers::{ContainerAsync, runners::AsyncRunner};
use testcontainers_modules::postgres::Postgres;

use dokuru_server::{
    infrastructure::{config::Config, persistence::Database},
    routes::app_routes,
    state::AppState,
};

static ENV_INIT: OnceLock<()> = OnceLock::new();

fn setup_env() {
    // Initialize crypto provider first (must be done before any JWT operations)
    dokuru_server::init_crypto();

    ENV_INIT.get_or_init(|| {
        unsafe {
            std::env::set_var("RUST_ENV", "development");
            std::env::set_var("PORT", "9393");
            std::env::set_var("JWT_ACCESS_SECRET", "test-access-secret-min-32-chars-ok!!");
            std::env::set_var("JWT_REFRESH_SECRET", "test-refresh-secret-min-32-chars-ok!");
            std::env::set_var("CORS_ALLOWED_ORIGINS", "*");
            // Placeholder — Config::load() requires it, but we use from_pool() instead
            std::env::set_var("DATABASE_URL", "postgres://test:test@localhost/placeholder");
        }
    });
}

/// Start a fresh Postgres container, run migrations, return (Router, container).
/// Keep `_container` alive for the duration of the test — dropping it stops the DB.
pub async fn build_test_app() -> (Router, ContainerAsync<Postgres>) {
    setup_env();

    let container = Postgres::default()
        .start()
        .await
        .expect("Failed to start Postgres container");

    let port = container.get_host_port_ipv4(5432).await.unwrap();
    let url = format!("postgresql://postgres:postgres@127.0.0.1:{port}/postgres");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .expect("Failed to connect to test container");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let config = Config::load().expect("Failed to load config");
    let db = Database::from_pool(pool);
    let state = AppState::new_for_test(config, db);

    (app_routes(state), container)
}

// ─── Request helpers ──────────────────────────────────────────────────────────

pub async fn post_json(app: Router, uri: &str, body: &Value) -> (StatusCode, Value) {
    let (status, _, json) = raw_request(app, build_post(uri, body, None)).await;
    (status, json)
}

pub async fn post_json_with_cookie(
    app: Router,
    uri: &str,
    body: &Value,
    cookie: &str,
) -> (StatusCode, Value) {
    let (status, _, json) = raw_request(app, build_post(uri, body, Some(cookie))).await;
    (status, json)
}

pub async fn get_authed(app: Router, uri: &str, token: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

pub async fn patch_authed(
    app: Router,
    uri: &str,
    token: &str,
    body: &Value,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("PATCH")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let (status, _, json) = raw_request(app, req).await;
    (status, json)
}

/// Returns full response including headers — needed when callers need Set-Cookie
pub async fn raw_request(app: Router, req: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let res: Response<Body> = app.oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice::<Value>(&bytes).unwrap_or_else(
        |_| serde_json::json!({ "raw": String::from_utf8_lossy(&bytes).to_string() }),
    );
    (status, headers, json)
}

pub fn extract_set_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers.get_all(header::SET_COOKIE).iter().find_map(|v| {
        let s = v.to_str().ok()?;
        let pair = s.split(';').next()?;
        let (k, v) = pair.split_once('=')?;
        if k.trim() == name {
            Some(format!("{}={}", k.trim(), v.trim()))
        } else {
            None
        }
    })
}

fn build_post(uri: &str, body: &Value, cookie: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(c) = cookie {
        builder = builder.header(header::COOKIE, c);
    }
    builder.body(Body::from(body.to_string())).unwrap()
}
