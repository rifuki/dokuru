use std::{fs::create_dir_all, path::PathBuf};

use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    EnvFilter, Registry, fmt,
    layer::SubscriberExt,
    reload::{self, Handle},
    util::SubscriberInitExt,
};

pub type ReloadFilterHandle = Handle<EnvFilter, Registry>;

fn api_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub fn setup_subscriber() -> (impl SubscriberInitExt, ReloadFilterHandle) {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));

    let (filter_layer, reload_handle) = reload::Layer::new(env_filter);

    // Terminal layer (colored, compact)
    let terminal_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_ansi(true)
        .with_target(true)
        .compact();

    // File layer (daily rotation, no ANSI)
    let log_dir = api_dir().join("logs");
    if let Err(e) = create_dir_all(&log_dir) {
        eprintln!("Failed to create log directory: {e}");
    }
    println!("Logs will be written to: {}", log_dir.display());

    let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, "api.log");
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .compact();

    // Combine layers into a subscriber
    let subscriber = tracing_subscriber::registry()
        .with(filter_layer)
        .with(terminal_layer)
        .with(file_layer);

    (subscriber, reload_handle)
}
