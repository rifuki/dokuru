use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, anyhow, bail};
use cliclack::{intro, note, outro, progress_bar, spinner};
use serde::Deserialize;

const RELEASE_BASE_URL: &str = "https://github.com/rifuki/dokuru/releases/download/latest-deploy";
const BINARY_NAME: &str = "dokuru-deploy";

#[derive(Debug, Deserialize)]
struct VersionManifest {
    version: String,
    git_sha: String,
    git_ref: Option<String>,
    build_time: Option<String>,
    target: Option<String>,
    release_tag: Option<String>,
}

pub fn print_version(offline: bool) {
    println!("dokuru-deploy {}", env!("CARGO_PKG_VERSION"));
    println!();
    println!("Local build");
    println!("  Version:    {}", env!("CARGO_PKG_VERSION"));
    println!("  Git SHA:    {}", build_git_sha());
    println!("  Git ref:    {}", build_git_ref());
    println!("  Built:      {}", build_time());
    println!("  Target:     {}", build_target());

    if offline {
        println!("\nLatest public release: skipped (--offline)");
        return;
    }

    println!("\nLatest public release");
    match fetch_latest_version() {
        Ok(latest) => {
            println!(
                "  Release:    {}",
                latest.release_tag.as_deref().unwrap_or("latest-deploy")
            );
            println!("  Version:    {}", latest.version);
            println!("  Git SHA:    {}", latest.git_sha);
            if let Some(git_ref) = latest.git_ref.as_deref() {
                println!("  Git ref:    {git_ref}");
            }
            if let Some(build_time) = latest.build_time.as_deref() {
                println!("  Built:      {build_time}");
            }
            if let Some(target) = latest.target.as_deref() {
                println!("  Target:     {target}");
            }

            println!("\nStatus");
            print_version_status(&latest);
        }
        Err(error) => {
            println!("  Unable to check latest release: {error}");
        }
    }
}

pub fn update_binary() -> Result<()> {
    intro("Dokuru Deploy Update")?;

    let install_dir = install_dir()?;
    let install_path = install_dir.join(BINARY_NAME);
    let download_path = install_dir.join(format!(".{BINARY_NAME}.download"));
    let download_url = format!("{RELEASE_BASE_URL}/{BINARY_NAME}");

    fs::create_dir_all(&install_dir)
        .with_context(|| format!("failed to create {}", install_dir.display()))?;

    note("Download", &download_url)?;
    download_binary(&download_url, &download_path)?;
    set_executable(&download_path)?;
    atomic_replace(&download_path, &install_path)?;

    outro(format!("Updated {}", install_path.display()))?;
    Ok(())
}

fn download_binary(url: &str, download_path: &Path) -> Result<()> {
    let response = reqwest::blocking::get(url)?.error_for_status()?;
    let total_bytes = response.content_length();
    let mut file = fs::File::create(download_path)
        .with_context(|| format!("failed to create {}", download_path.display()))?;

    match total_bytes {
        Some(total_bytes) => download_with_progress(response, &mut file, total_bytes),
        None => download_with_spinner(response, &mut file),
    }
}

fn download_with_progress(
    mut response: reqwest::blocking::Response,
    file: &mut fs::File,
    total_bytes: u64,
) -> Result<()> {
    let progress = progress_bar(total_bytes).with_download_template();
    progress.start("Downloading binary");
    copy_response(&mut response, file, |bytes_read| progress.inc(bytes_read))
        .inspect_err(|_| progress.error("Download failed"))?;
    progress.stop("Downloaded binary");
    Ok(())
}

fn download_with_spinner(
    mut response: reqwest::blocking::Response,
    file: &mut fs::File,
) -> Result<()> {
    let progress = spinner();
    progress.start("Downloading binary");
    copy_response(&mut response, file, |_| {})
        .inspect_err(|_| progress.error("Download failed"))?;
    progress.stop("Downloaded binary");
    Ok(())
}

fn copy_response(
    response: &mut reqwest::blocking::Response,
    file: &mut fs::File,
    mut on_chunk: impl FnMut(u64),
) -> Result<()> {
    let mut buffer = [0_u8; 16 * 1024];
    loop {
        let bytes_read = response.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        file.write_all(&buffer[..bytes_read])?;
        on_chunk(u64::try_from(bytes_read).context("download chunk size overflowed u64")?);
    }
    file.flush()?;

    let metadata = file.metadata()?;
    if metadata.len() == 0 {
        bail!("downloaded binary is empty");
    }

    Ok(())
}

fn fetch_latest_version() -> Result<VersionManifest> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let response = client
        .get(format!("{RELEASE_BASE_URL}/version.json"))
        .send()?
        .error_for_status()?;
    Ok(serde_json::from_str(&response.text()?)?)
}

fn print_version_status(latest: &VersionManifest) {
    let local_sha = build_git_sha();
    if !is_known_sha(local_sha) {
        println!("  Local binary has no embedded Git SHA; latest check is informational.");
    } else if latest.git_sha == local_sha {
        println!("  Up to date ({})", short_sha(local_sha));
    } else {
        println!(
            "  Update available: local {} -> latest {}",
            short_sha(local_sha),
            short_sha(&latest.git_sha)
        );
        println!("  Run: dokuru-deploy update");
    }
}

const fn build_git_sha() -> &'static str {
    env!("DOKURU_DEPLOY_GIT_SHA")
}

const fn build_git_ref() -> &'static str {
    env!("DOKURU_DEPLOY_GIT_REF")
}

const fn build_time() -> &'static str {
    env!("DOKURU_DEPLOY_BUILD_TIME")
}

const fn build_target() -> &'static str {
    env!("DOKURU_DEPLOY_TARGET")
}

fn is_known_sha(sha: &str) -> bool {
    !sha.is_empty() && sha != "unknown" && sha != "dev"
}

fn short_sha(sha: &str) -> &str {
    sha.get(..12).unwrap_or(sha)
}

fn install_dir() -> Result<PathBuf> {
    let home = std::env::var_os("HOME").ok_or_else(|| anyhow!("HOME is not set"))?;
    Ok(PathBuf::from(home).join(".local/bin"))
}

fn atomic_replace(download_path: &Path, install_path: &Path) -> Result<()> {
    fs::rename(download_path, install_path).with_context(|| {
        format!(
            "failed to replace {} with downloaded binary",
            install_path.display()
        )
    })
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
}
