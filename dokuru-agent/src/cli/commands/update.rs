use super::super::helpers::{
    ChecksumTool, binary_version, collect_preflight, confirm_action, create_temp_dir,
    detect_checksum_tool, download_file, install_binary, normalize_release_tag,
    release_asset_name_for, release_base_url, resolve_shared_config, restart_service, run_step,
    service_unit_path, verify_download_checksum,
};
use super::super::types::UpdateArgs;
use super::version::{build_git_sha, fetch_version_manifest, is_known_sha, short_sha};
use cliclack::{intro, log, note, outro, outro_cancel};
use eyre::{Result, bail};

pub fn run_update(args: &UpdateArgs) -> Result<()> {
    let config = resolve_shared_config(&args.shared, None)?;
    let preflight = collect_preflight(&config);
    let release = update_release(args)?;
    let release_base_url = release_base_url(&release);

    show_update_intro(&release)?;
    if release_is_current(&release, args.force)? {
        return Ok(());
    }

    if !preflight.running_as_root() {
        outro_cancel("Root privileges required. Re-run with: sudo dokuru update")?;
        bail!("root privileges required");
    }

    let checksum_tool = detect_checksum_tool()?;
    let asset_name = release_asset_name_for(&release)?;
    let temp_dir = create_temp_dir("dokuru-update")?;
    let binary_path = temp_dir.join(&asset_name);
    let checksum_path = temp_dir.join("SHA256SUMS");

    note(
        "Update plan",
        format!(
            "Release: {}\nTarget:  {}\nAsset:   {}\nService: {}",
            release,
            config.install_path.display(),
            asset_name,
            config.service_name,
        ),
    )?;

    if !confirm_action(
        args.shared.yes,
        &format!(
            "Update Dokuru at {} from {release}?",
            config.install_path.display()
        ),
    )? {
        outro_cancel("Update cancelled.")?;
        bail!("cancelled");
    }

    run_step("Downloading Dokuru binary", || {
        download_file(&format!("{release_base_url}/{asset_name}"), &binary_path)
    })?;
    log::info(format!("→ {release_base_url}/{asset_name}"))?;

    run_step("Downloading release checksums", || {
        download_file(&format!("{release_base_url}/SHA256SUMS"), &checksum_path)
    })?;
    log::info(format!("→ {release_base_url}/SHA256SUMS"))?;

    run_step("Verifying release checksum", || {
        verify_download_checksum(&checksum_path, &binary_path, &asset_name, checksum_tool)
    })?;
    let tool_name = match checksum_tool {
        ChecksumTool::Sha256sum => "sha256sum",
        ChecksumTool::Shasum => "shasum -a 256",
    };
    log::info(format!("→ {tool_name}: {asset_name} OK"))?;

    run_step("Installing updated Dokuru binary", || {
        install_binary(&binary_path, &config.install_path)
    })?;
    log::info(format!("→ {}", config.install_path.display()))?;

    if service_unit_path(&config).exists() && preflight.has_systemd() {
        run_step("Restarting Dokuru service", || {
            restart_service(&config.service_name)
        })?;
        log::info(format!("→ systemctl restart {}", config.service_name))?;
    }

    let mut result_lines = vec![format!("Binary:  {}", config.install_path.display())];
    if let Some(version) = binary_version(&config.install_path) {
        result_lines.push(format!("Version: {version}"));
    }
    note("Update complete", result_lines.join("\n"))?;

    let host_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map_or_else(|_| "localhost".to_string(), |a| a.ip().to_string());
    cliclack::log::info(format!("Agent: {host_ip}:{}", config.port))?;
    outro(format!("Dokuru updated from {release} successfully."))?;
    Ok(())
}

fn update_release(args: &UpdateArgs) -> Result<String> {
    args.version
        .as_deref()
        .map(normalize_release_tag)
        .transpose()
        .map(|release| release.unwrap_or_else(|| "latest".to_string()))
}

fn show_update_intro(release: &str) -> Result<()> {
    if release == "latest" {
        intro("🐳 Dokuru rolling latest updater")?;
    } else {
        intro(format!("🐳 Dokuru versioned updater ({release})"))?;
    }
    Ok(())
}

fn release_is_current(release: &str, force: bool) -> Result<bool> {
    match fetch_version_manifest(release) {
        Ok(latest) => {
            note(
                "Release metadata",
                format!(
                    "Release:      {}\nLocal commit:  {}\nRemote commit: {}",
                    latest.release_tag.as_deref().unwrap_or(release),
                    short_sha(build_git_sha()),
                    short_sha(&latest.git_sha)
                ),
            )?;
            if !force && latest.git_sha == build_git_sha() && is_known_sha(build_git_sha()) {
                outro(format!(
                    "Already up to date ({})",
                    short_sha(build_git_sha())
                ))?;
                return Ok(true);
            }
        }
        Err(error) => note(
            "Release metadata",
            format!("Unable to check version metadata: {error}. Downloading anyway."),
        )?,
    }
    Ok(false)
}

// ─── Uninstall ────────────────────────────────────────────────────────────────
