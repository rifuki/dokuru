use bollard::{API_DEFAULT_VERSION, Docker};
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

// Internal modules
mod feature;
mod infrastructure;
pub mod relay;
mod routes;
mod state;

// Expose config types for CLI
pub use infrastructure::config::{
    AccessConfig, AccessMode, AuthConfig, Config, DockerConfig, ServerConfig, config_path_in,
};

// Only expose serve function
pub async fn serve() -> eyre::Result<()> {
    let _ = color_eyre::install();
    let (subscriber, _reload_handle) = infrastructure::logging::setup();
    subscriber.init();

    let config = infrastructure::config::Config::load()?;

    // Check if relay mode
    if config.access.mode == AccessMode::Relay {
        info!("Starting in relay mode");
        return relay::start_relay_mode(config).await;
    }

    // Normal local API mode
    let docker = Docker::connect_with_unix(&config.docker.socket, 120, API_DEFAULT_VERSION)?;

    // Load persisted environments from disk
    let environments = feature::environments::load_environments().await;
    info!(count = environments.len(), "Loaded persisted environments");

    let state = state::AppState::new(Arc::new(config.clone()), docker, environments);
    let cors = infrastructure::web::cors::build_cors_layer(&config);

    let app = routes::build_router(state)
        .layer(axum::middleware::from_fn(
            infrastructure::web::middleware::http_trace_middleware,
        ))
        .layer(cors);

    let listener = infrastructure::server::create_listener(config.server_addr()?).await?;
    info!(
        host = %config.server.host,
        port = config.server.port,
        docker_socket = %config.docker.socket,
        "Dokuru agent API listening"
    );

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(infrastructure::server::shutdown_signal())
    .await?;

    Ok(())
}
