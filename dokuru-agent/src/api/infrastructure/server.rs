use std::net::SocketAddr;

use tokio::net::TcpListener;
use tracing::info;

pub async fn create_listener(addr: SocketAddr) -> eyre::Result<TcpListener> {
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| eyre::eyre!("Failed to bind to {}: {}", addr, e))?;

    info!(address = %listener.local_addr()?, "Server listening");

    Ok(listener)
}

pub async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => { tracing::info!("Received Ctrl+C, shutting down..."); },
        () = terminate => { tracing::info!("Received SIGTERM, shutting down..."); },
    }

    // Force exit if graceful shutdown takes longer than 3 seconds
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        tracing::warn!("Graceful shutdown timed out, forcing exit");
        std::process::exit(0);
    });
}
