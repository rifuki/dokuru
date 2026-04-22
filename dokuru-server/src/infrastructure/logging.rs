use std::{fs::create_dir_all, path::PathBuf};

use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    EnvFilter, Registry, fmt,
    layer::SubscriberExt,
    reload::{self, Handle},
    util::SubscriberInitExt,
};

pub type ReloadFilterHandle = Handle<EnvFilter, Registry>;

pub fn resolve_log_dir() -> PathBuf {
    let primary = PathBuf::from("/var/log/dokuru");
    if primary.is_dir() {
        return primary;
    }

    std::env::temp_dir().join("dokuru")
}

pub fn latest_log_file_path() -> Option<PathBuf> {
    let entries = std::fs::read_dir(resolve_log_dir()).ok()?;

    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("api.log"))
        .max_by_key(|entry| entry.metadata().and_then(|meta| meta.modified()).ok())
        .map(|entry| entry.path())
}

pub fn setup_subscriber() -> (impl SubscriberInitExt, ReloadFilterHandle) {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));

    let (filter_layer, reload_handle) = reload::Layer::new(env_filter);

    let is_terminal = std::io::IsTerminal::is_terminal(&std::io::stdout());

    let terminal_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_ansi(is_terminal)
        .with_target(true)
        .compact();

    let log_dir = PathBuf::from("/var/log/dokuru");

    let file_layer = if create_dir_all(&log_dir).is_ok()
        && std::fs::write(log_dir.join(".test"), "test").is_ok()
    {
        let _ = std::fs::remove_file(log_dir.join(".test"));
        println!("Logs will be written to: {}", log_dir.display());
        let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, "api.log");
        Some(
            fmt::layer()
                .with_writer(file_appender)
                .with_ansi(false)
                .with_target(true)
                .with_file(true)
                .with_line_number(true)
                .compact(),
        )
    } else {
        let fallback = std::env::temp_dir().join("dokuru");
        if create_dir_all(&fallback).is_ok()
            && std::fs::write(fallback.join(".test"), "test").is_ok()
        {
            let _ = std::fs::remove_file(fallback.join(".test"));
            println!("Logs will be written to: {}", fallback.display());
            let file_appender = RollingFileAppender::new(Rotation::DAILY, fallback, "api.log");
            Some(
                fmt::layer()
                    .with_writer(file_appender)
                    .with_ansi(false)
                    .with_target(true)
                    .with_file(true)
                    .with_line_number(true)
                    .compact(),
            )
        } else {
            eprintln!("Failed to create writable log directory, using stdout only");
            None
        }
    };

    let subscriber = tracing_subscriber::registry()
        .with(filter_layer)
        .with(terminal_layer)
        .with(file_layer);

    (subscriber, reload_handle)
}
