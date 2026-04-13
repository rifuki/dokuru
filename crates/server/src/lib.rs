use std::sync::Arc;
use bollard::Docker;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

pub mod feature;
pub mod infrastructure;
pub mod routes;
pub mod state;

pub async fn serve() -> eyre::Result<()> {
    let _ = color_eyre::install(); // Safely install panic handler, ignore if already installed
    infrastructure::env::load();
    let (subscriber, _reload_handle) = infrastructure::logging::setup();
    subscriber.init();

    let config = infrastructure::config::Config::load()?;
    let docker = Docker::connect_with_local_defaults()?;
    
    let state = state::AppState::new(Arc::new(config.clone()), docker);
    let cors = infrastructure::web::cors::build_cors_layer(&config);

    let app = routes::build_router(state)
        .layer(axum::middleware::from_fn(infrastructure::web::middleware::http_trace_middleware))
        .layer(cors);

    let listener = infrastructure::server::create_listener(config.port).await?;
    info!("Dokuru agent API listening on port {}", config.port);

    axum::serve(
        listener, 
        app.into_make_service_with_connect_info::<std::net::SocketAddr>()
    )
    .with_graceful_shutdown(infrastructure::server::shutdown_signal())
    .await?;

    Ok(())
}
