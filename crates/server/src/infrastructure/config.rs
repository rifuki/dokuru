use std::net::SocketAddr;
use std::time::Duration;
use eyre::{Result, WrapErr};

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub host: String,
    pub cors_origins: Vec<String>,
    pub docker_socket: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        // Fallbacks that can be overridden by env vars
        // When running as daemon, /etc/dokuru/.env handles this.
        let port = std::env::var("PORT")
            .unwrap_or_else(|_| "3939".to_string())
            .parse()
            .wrap_err("PORT must be a valid port number")?;
            
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        
        let cors_origins: Vec<String> = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();
            
        let docker_socket = std::env::var("DOCKER_SOCKET")
            .unwrap_or_else(|_| "/var/run/docker.sock".to_string());

        Ok(Self {
            port,
            host,
            cors_origins,
            docker_socket,
        })
    }

    pub fn server_addr(&self) -> Result<SocketAddr> {
        let addr = format!("{}:{}", self.host, self.port);
        addr.parse()
            .wrap_err_with(|| format!("Invalid host:port combination: {}", addr))
    }
}
