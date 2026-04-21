use cliclack::{intro, note, outro};
use eyre::Result;
use std::path::PathBuf;

pub fn run_config_show(_args: &crate::cli::SharedArgs) -> Result<()> {
    intro("🐳 Dokuru configuration")?;

    // Read runtime config
    let runtime_config = crate::api::Config::load().unwrap_or_default();
    let config_path = PathBuf::from("/etc/dokuru/config.toml");

    // Show paths
    note(
        "Paths",
        format!(
            "Binary:  /usr/local/bin/dokuru\nConfig:  {}\nLogs:    /var/log/dokuru\nService: /etc/systemd/system/dokuru.service",
            config_path.display()
        ),
    )?;

    // Show server config
    note(
        "Server",
        format!(
            "Port:    {}\nBind:    {}\nCORS:    {}",
            runtime_config.server.port,
            runtime_config.server.host,
            runtime_config
                .server
                .cors_origins
                .iter()
                .map(std::string::ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ),
    )?;

    // Show docker config
    note(
        "Docker",
        format!("Socket:  {}", runtime_config.docker.socket),
    )?;

    // Show access config
    let access_mode = match runtime_config.access.mode {
        crate::api::AccessMode::Cloudflare => "Cloudflare Tunnel",
        crate::api::AccessMode::Direct => "Direct HTTP",
        crate::api::AccessMode::Relay => "Relay Mode",
        crate::api::AccessMode::Domain => "Custom Domain",
    };

    note(
        "Access",
        format!(
            "Mode:    {}\nURL:     {}",
            access_mode, runtime_config.access.url
        ),
    )?;

    // Show auth config (hash only, not the token)
    let token_status = if runtime_config.auth.token_hash.is_empty() {
        "Not set"
    } else {
        "Configured"
    };
    note("Authentication", format!("Token:   {token_status}"))?;

    outro("Use 'dokuru configure' to change settings")?;

    Ok(())
}
