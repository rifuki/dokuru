use axum::middleware::from_fn;
use dokuru_server::{
    AppState, app_routes,
    bootstrap::bootstrap,
    infrastructure::{
        Config, env, logging,
        server::{create_listener, shutdown_signal},
        web::{cors::build_cors_layer, middleware::http_trace_middleware},
    },
};
use eyre::Result;
use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> Result<()> {
    env::load();
    color_eyre::install()?;

    let config = Config::load()?;

    let (subscriber, _) = logging::setup();
    subscriber.init();
    info!(rust_env = %config.rust_env, "Application starting...");

    let port = config.server.port;
    let state = AppState::new(config.clone()).await?;

    info!("Application state initialized");

    // Run bootstrap
    bootstrap(&state.db, &config).await?;

    let cors = build_cors_layer(&state.config);

    let app = app_routes(state)
        .layer(from_fn(http_trace_middleware))
        .layer(cors);

    let listener = create_listener(port).await?;

    info!(port, "Server listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .map_err(|e| eyre::eyre!("Server error: {}", e))?;

    info!("Server shut down gracefully");

    Ok(())
}
