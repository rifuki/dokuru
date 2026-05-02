use crate::cli::UninstallArgs;
use crate::cli::helpers::{
    disable_service_if_present, nix_like_is_root, remove_dir_if_present, remove_file_if_present,
    run_command, run_step, stop_service_if_present,
};
use eyre::{Result, bail};
use std::path::PathBuf;

pub fn run_uninstall(_args: &UninstallArgs) -> Result<()> {
    if !nix_like_is_root() {
        bail!("Uninstall must be run as root (use sudo)");
    }

    cliclack::intro("Dokuru Uninstall")?;

    let confirm = cliclack::confirm("Remove all Dokuru files and configuration?")
        .initial_value(false)
        .interact()?;

    if !confirm {
        cliclack::outro_cancel("Uninstall cancelled")?;
        return Ok(());
    }

    run_step("Stopping Dokuru service", || {
        stop_service_if_present("dokuru")
    })?;

    run_step("Disabling Dokuru service", || {
        disable_service_if_present("dokuru")
    })?;

    run_step("Removing systemd unit", || {
        remove_file_if_present(&PathBuf::from("/etc/systemd/system/dokuru.service"))?;
        let _ = run_command("systemctl", &["daemon-reload"]);
        Ok(())
    })?;

    run_step("Removing configuration", || {
        remove_dir_if_present(&PathBuf::from("/etc/dokuru"))
    })?;

    run_step("Removing binary", || {
        remove_file_if_present(&PathBuf::from("/usr/local/bin/dokuru"))
    })?;

    run_step("Removing audit data", || {
        remove_dir_if_present(&PathBuf::from("/var/lib/dokuru"))
    })?;

    cliclack::outro("Dokuru has been uninstalled successfully")?;
    Ok(())
}
