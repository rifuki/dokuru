use std::net::{IpAddr, Ipv6Addr, SocketAddr};

use tokio::net::TcpListener;
use tracing::info;

pub async fn create_listener(port: u16) -> eyre::Result<TcpListener> {
    let addr_v6 = SocketAddr::from((IpAddr::V6(Ipv6Addr::UNSPECIFIED), port));

    match TcpListener::bind(addr_v6).await {
        Ok(listener) => {
            info!(
                address = %listener.local_addr()?,
                stack = "dual-stack (IPv4+IPv6)",
                "Server listening"
            );
            Ok(listener)
        }
        Err(e) => {
            tracing::debug!("Dual-stack bind failed ({}), falling back to IPv4", e);
            let addr_v4 = SocketAddr::from(([0, 0, 0, 0], port));
            let listener = TcpListener::bind(addr_v4)
                .await
                .map_err(|e| eyre::eyre!("Failed to bind to port {}: {}", port, e))?;
            info!(
                address = %listener.local_addr()?,
                stack = "IPv4 only",
                "Server listening"
            );
            Ok(listener)
        }
    }
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
        _ = ctrl_c => { tracing::info!("Received Ctrl+C, shutting down..."); },
        _ = terminate => { tracing::info!("Received SIGTERM, shutting down..."); },
    }

    // Force exit if graceful shutdown takes longer than 3 seconds
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        tracing::warn!("Graceful shutdown timed out, forcing exit");
        std::process::exit(0);
    });
}
