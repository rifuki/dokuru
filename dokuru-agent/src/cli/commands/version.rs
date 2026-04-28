use super::super::helpers::LATEST_RELEASE_BASE_URL;
use eyre::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(super) struct VersionManifest {
    pub(super) version: String,
    pub(super) git_sha: String,
    git_ref: Option<String>,
    build_time: Option<String>,
    target: Option<String>,
    release_tag: Option<String>,
}

pub fn run_version(offline: bool) {
    println!("dokuru {}", env!("CARGO_PKG_VERSION"));
    println!();
    println!("Local build");
    println!("  Version:    {}", env!("CARGO_PKG_VERSION"));
    println!("  Git SHA:    {}", build_git_sha());
    println!("  Git ref:    {}", build_git_ref());
    println!("  Built:      {}", build_time());
    println!("  Target:     {}", build_target());

    if offline {
        println!("\nLatest release: skipped (--offline)");
        return;
    }

    println!("\nLatest release");
    match fetch_latest_version() {
        Ok(latest) => {
            println!(
                "  Release:    {}",
                latest.release_tag.as_deref().unwrap_or("latest")
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

pub(super) fn fetch_latest_version() -> Result<VersionManifest> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let response = client
        .get(format!("{LATEST_RELEASE_BASE_URL}/version.json"))
        .send()?
        .error_for_status()?;
    Ok(serde_json::from_str(&response.text()?)?)
}

fn print_version_status(latest: &VersionManifest) {
    let local_sha = build_git_sha();
    if !is_known_sha(local_sha) {
        println!("  Local binary has no embedded Git SHA; latest check is informational.");
    } else if latest.git_sha == local_sha {
        println!(
            "  Up to date: local commit {} matches the latest release",
            short_sha(local_sha)
        );
    } else {
        println!("  New release available");
        println!(
            "  Local:  {} ({})",
            env!("CARGO_PKG_VERSION"),
            short_sha(local_sha)
        );
        println!(
            "  Latest: {} ({})",
            latest.version,
            short_sha(&latest.git_sha)
        );
        println!("  Run: sudo dokuru update");
    }
}

pub(super) const fn build_git_sha() -> &'static str {
    env!("DOKURU_AGENT_GIT_SHA")
}

const fn build_git_ref() -> &'static str {
    env!("DOKURU_AGENT_GIT_REF")
}

const fn build_time() -> &'static str {
    env!("DOKURU_AGENT_BUILD_TIME")
}

const fn build_target() -> &'static str {
    env!("DOKURU_AGENT_TARGET")
}

pub(super) fn is_known_sha(sha: &str) -> bool {
    !sha.is_empty() && sha != "unknown" && sha != "dev"
}

pub(super) fn short_sha(sha: &str) -> &str {
    sha.get(..12).unwrap_or(sha)
}
