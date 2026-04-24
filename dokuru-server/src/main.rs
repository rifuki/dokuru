use tracing::info;
use tracing_subscriber::util::SubscriberInitExt;

use std::time::Duration;

use dokuru_server::{
    bootstrap,
    infrastructure::{config, env, logging, server},
    state::AppState,
};

const HEALTHCHECK_ARG: &str = "--healthcheck";
const DEFAULT_HEALTHCHECK_URL: &str = "http://127.0.0.1:9393/health";
const HEALTHCHECK_TIMEOUT: Duration = Duration::from_secs(3);

#[tokio::main]
async fn main() -> eyre::Result<()> {
    // 0. Initialize crypto provider for rustls
    dokuru_server::init_crypto();

    if std::env::args().any(|arg| arg == HEALTHCHECK_ARG) {
        return run_healthcheck().await;
    }

    // 1. Load environment variables
    env::load();

    // 2. Set up error handling
    color_eyre::install()?;

    // 3. Load configuration (fail-fast validation)
    let config = config::Config::load()?;

    // 4. Set up logging
    let (subscriber, reload_handle) = logging::setup_subscriber(&config.logging.default_level);
    subscriber.init();
    info!(
        port = config.server.port,
        rust_env = %config.rust_env,
        "🚀 Application starting..."
    );

    // 5. Initialize application state
    let state = AppState::new(config.clone(), reload_handle).await?;
    info!("✅ Application state initialized");

    // 6. Bootstrap (create initial admin if needed)
    bootstrap::bootstrap(&state.db, &config).await?;

    // 7. Start server (dual-stack, graceful shutdown)
    server::serve(state).await
}

async fn run_healthcheck() -> eyre::Result<()> {
    let url = std::env::var("DOKURU_HEALTHCHECK_URL")
        .unwrap_or_else(|_| DEFAULT_HEALTHCHECK_URL.to_string());
    let response = reqwest::Client::builder()
        .timeout(HEALTHCHECK_TIMEOUT)
        .build()?
        .get(&url)
        .send()
        .await?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(eyre::eyre!(
            "healthcheck failed for {url} with status {}",
            response.status()
        ))
    }
}
