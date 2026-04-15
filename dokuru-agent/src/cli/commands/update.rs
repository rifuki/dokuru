use super::super::helpers::*;
use super::super::types::*;
use cliclack::{intro, note, outro, outro_cancel};
use eyre::{Result, bail};

pub fn run_update(args: UpdateArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, None)?;
    let preflight = collect_preflight(&config);

    intro("🐳 Dokuru  rolling latest updater")?;

    if !preflight.running_as_root {
        outro_cancel("Root privileges required. Re-run with: sudo dokuru update")?;
        bail!("root privileges required");
    }

    ensure_command("curl")?;
    let checksum_tool = detect_checksum_tool()?;
    let asset_name = release_asset_name()?;
    let temp_dir = create_temp_dir("dokuru-update")?;
    let binary_path = temp_dir.join(asset_name);
    let checksum_path = temp_dir.join("SHA256SUMS");

    note(
        "Update plan",
        format!(
            "Target:  {}\nAsset:   {}\nService: {}",
            config.install_path.display(),
            asset_name,
            config.service_name,
        ),
    )?;

    if !confirm_action(
        args.shared.yes,
        &format!("Update Dokuru at {}?", config.install_path.display()),
    )? {
        outro_cancel("Update cancelled.")?;
        bail!("cancelled");
    }

    run_step("Downloading latest Dokuru binary", || {
        download_file(
            &format!("{LATEST_RELEASE_BASE_URL}/{asset_name}"),
            &binary_path,
        )
    })?;
    run_step("Downloading release checksums", || {
        download_file(
            &format!("{LATEST_RELEASE_BASE_URL}/SHA256SUMS"),
            &checksum_path,
        )
    })?;
    run_step("Verifying release checksum", || {
        verify_download_checksum(&checksum_path, &binary_path, asset_name, checksum_tool)
    })?;

    run_step("Installing updated Dokuru binary", || {
        install_binary(&binary_path, &config.install_path)
    })?;

    if service_unit_path(&config).exists() && preflight.has_systemd {
        run_step("Restarting Dokuru service", || {
            restart_service(&config.service_name)
        })?;
    }

    let mut result_lines = vec![format!("Binary:  {}", config.install_path.display())];
    if let Some(version) = binary_version(&config.install_path) {
        result_lines.push(format!("Version: {}", version));
    }
    note("Update complete", result_lines.join("\n"))?;

    cliclack::log::info(format!("Dashboard: http://<your-host>:{}", config.port))?;
    outro("Dokuru updated successfully.")?;
    Ok(())
}

// ─── Uninstall ────────────────────────────────────────────────────────────────
