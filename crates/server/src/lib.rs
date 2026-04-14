use bollard::{API_DEFAULT_VERSION, Docker};
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

pub mod feature;
pub mod infrastructure;
pub mod routes;
pub mod state;

pub async fn serve() -> eyre::Result<()> {
    let _ = color_eyre::install();
    infrastructure::env::load();
    let (subscriber, _reload_handle) = infrastructure::logging::setup();
    subscriber.init();

    let config = infrastructure::config::Config::load()?;
    let docker = Docker::connect_with_unix(&config.docker_socket, 120, API_DEFAULT_VERSION)?;

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
        host = %config.host,
        port = config.port,
        docker_socket = %config.docker_socket,
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
