use std::sync::Arc;
use bollard::Docker;
use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

pub mod feature;
pub mod infrastructure;
pub mod routes;
pub mod state;

pub async fn serve() -> eyre::Result<()> {
    infrastructure::env::load();
    let (subscriber, _reload_handle) = infrastructure::logging::setup();
    subscriber.init();

    let config = infrastructure::config::Config::load()?;
    let docker = Docker::connect_with_local_defaults()?;
    
    let state = state::AppState::new(Arc::new(config.clone()), docker);
    let app = routes::build_router(state);

    let listener = infrastructure::server::create_listener(config.port).await?;
    info!("Dokuru agent API listening on port {}", config.port);

    axum::serve(listener, app)
        .with_graceful_shutdown(infrastructure::server::shutdown_signal())
        .await?;

    Ok(())
}
