use std::{fs::create_dir_all, path::PathBuf};

use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    EnvFilter, Registry, fmt,
    layer::SubscriberExt,
    reload::{self, Handle},
    util::SubscriberInitExt,
};

pub type ReloadFilterHandle = Handle<EnvFilter, Registry>;

pub fn setup() -> (impl SubscriberInitExt, ReloadFilterHandle) {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug"));

    let (filter_layer, reload_handle) = reload::Layer::new(env_filter);

    // Detect if stdout is a terminal
    let is_terminal = std::io::IsTerminal::is_terminal(&std::io::stdout());

    // Terminal layer - colored if terminal, plain if not
    let terminal_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_ansi(is_terminal)
        .with_target(true)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false);

    // File layer (daily rotation, no ANSI)
    let prod_log_dir = PathBuf::from("/var/log/dokuru");
    let log_dir = if create_dir_all(&prod_log_dir).is_ok() {
        prod_log_dir
    } else {
        let fallback = std::env::temp_dir().join("dokuru");
        if let Err(e) = create_dir_all(&fallback) {
            eprintln!("Failed to create log directory: {e}");
        }
        fallback
    };
    println!("Logs will be written to: {}", log_dir.display());

    let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, "backend.log");
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_target(true)
        .with_file(true)
        .with_line_number(true);

    let subscriber = tracing_subscriber::registry()
        .with(filter_layer)
        .with(terminal_layer)
        .with(file_layer);

    (subscriber, reload_handle)
}
