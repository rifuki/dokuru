use cliclack::{confirm, intro, note, outro, outro_cancel};
use super::super::types::*;
use super::super::helpers::*;
use eyre::{Result, bail};
use std::io::{IsTerminal, stderr};

pub fn run_uninstall(args: UninstallArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, None)?;
    let preflight = collect_preflight(&config);
    let unit_path = service_unit_path(&config);
    let config_path = runtime_config_path(&config);

    intro("🐳 Dokuru  uninstall")?;

    if !preflight.running_as_root {
        outro_cancel("Root privileges required. Re-run with: sudo dokuru uninstall")?;
        bail!("root privileges required");
    }

    note(
        "Will remove",
        format!(
            "Binary:  {}\nConfig:  {}\nService: {}",
            config.install_path.display(),
            config_path.display(),
            unit_path.display(),
        ),
    )?;

    if !confirm_action(
        args.shared.yes,
        &format!("Uninstall Dokuru from {}?", config.install_path.display()),
    )? {
        outro_cancel("Uninstall cancelled.")?;
        bail!("cancelled");
    }

    if preflight.has_systemd && unit_path.exists() {
        run_step("Stopping Dokuru service", || {
            stop_service_if_present(&config.service_name)
        })?;
        run_step("Disabling Dokuru service", || {
            disable_service_if_present(&config.service_name)
        })?;
        run_step("Removing systemd unit", || {
            remove_file_if_present(&unit_path)
        })?;
        run_step("Reloading systemd", reload_systemd)?;
    }

    run_step("Removing Dokuru binary", || {
        remove_file_if_present(&config.install_path)
    })?;
    run_step("Removing Dokuru config", || {
        remove_dir_if_present(&config.config_dir)
    })?;

    let mut removed = vec![
        "Binary:  removed".to_string(),
        "Config:  removed".to_string(),
    ];
    if preflight.has_systemd {
        removed.push("Service: removed".to_string());
    }
    note("Uninstall complete", removed.join("\n"))?;

    outro("Dokuru has been removed from this host.")?;
    Ok(())
}

// ─── SetupMode ───────────────────────────────────────────────────────────────


// ─── Config Resolution ───────────────────────────────────────────────────────

