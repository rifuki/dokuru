use cliclack::{intro, note, outro};
use super::super::types::*;
use super::super::helpers::*;
use eyre::Result;

pub fn run_doctor(args: DoctorArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, args.docker_socket)?;
    let preflight = collect_preflight(&config);
    let config_path = runtime_config_path(&config);
    let service_path = service_unit_path(&config);
    let binary_exists = config.install_path.exists();
    let config_exists = config_path.exists();
    let service_exists = service_path.exists();
    let service_enabled =
        service_exists && command_success("systemctl", &["is-enabled", &config.service_name]);
    let service_active =
        service_exists && command_success("systemctl", &["is-active", &config.service_name]);

    intro("🐳 Dokuru  host diagnostics")?;

    // Status section
    let log_item = |ok: bool, label: &str, value: &str| -> Result<()> {
        if ok {
            cliclack::log::success(format!("{:<16} {}", label, value))?;
        } else {
            cliclack::log::warning(format!("{:<16} {}", label, value))?;
        }
        Ok(())
    };

    log_item(
        binary_exists,
        "Binary",
        &config.install_path.display().to_string(),
    )?;
    log_item(config_exists, "Config", &config_path.display().to_string())?;
    log_item(
        preflight.docker_socket_exists,
        "Docker socket",
        &config.docker_socket,
    )?;
    log_item(
        preflight.has_systemd,
        "Systemd",
        if preflight.has_systemd {
            "detected"
        } else {
            "not detected"
        },
    )?;
    log_item(
        service_exists,
        "Service unit",
        &service_path.display().to_string(),
    )?;
    if service_exists {
        log_item(
            service_enabled,
            "Service enabled",
            if service_enabled { "yes" } else { "no" },
        )?;
        log_item(
            service_active,
            "Service active",
            if service_active { "yes" } else { "no" },
        )?;
    }

    // Config note
    let mut config_lines = vec![
        format!("Port:           {}", config.port),
        format!("Host:           {}", config.host),
        format!("CORS:           {}", config.cors_origins),
        format!(
            "docker.service: {}",
            if preflight.docker_service_exists {
                "detected"
            } else {
                "not detected"
            }
        ),
    ];
    if binary_exists && let Some(version) = binary_version(&config.install_path) {
        config_lines.push(format!("Version:        {}", version));
    }
    note("Configuration", config_lines.join("\n"))?;

    cliclack::log::info(format!(
        "Run `dokuru update --install-path {}` to refresh the binary.",
        config.install_path.display()
    ))?;

    outro("Diagnostics complete.")?;
    Ok(())
}

// ─── Update ──────────────────────────────────────────────────────────────────

