use super::super::helpers::{normalize_release_tag, release_base_url};
use super::super::types::VersionArgs;
use eyre::Result;
use serde::Deserialize;
use serde::de::DeserializeOwned;

#[derive(Debug, Deserialize)]
pub(super) struct VersionManifest {
    pub(super) version: String,
    pub(super) git_sha: String,
    git_ref: Option<String>,
    build_time: Option<String>,
    target: Option<String>,
    pub(super) release_tag: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    prerelease: bool,
    draft: bool,
}

pub fn run_version(args: &VersionArgs) {
    println!("dokuru {}", env!("CARGO_PKG_VERSION"));
    println!();
    println!("Local build");
    println!("  Version:    {}", env!("CARGO_PKG_VERSION"));
    println!("  Git SHA:    {}", build_git_sha());
    println!("  Git ref:    {}", build_git_ref());
    println!("  Built:      {}", build_time());
    println!("  Target:     {}", build_target());

    if args.offline {
        println!("\nLatest release: skipped (--offline)");
        return;
    }

    if args.list {
        print_release_list();
        return;
    }

    if let Some(release) = args.release.as_deref() {
        match normalize_release_tag(release) {
            Ok(release) => print_release_manifest("Requested release", &release),
            Err(error) => println!("\nRequested release: {error}"),
        }
        return;
    }

    print_release_manifest("Rolling latest", "latest");
    print_latest_stable_release();
}

pub(super) fn fetch_version_manifest(release: &str) -> Result<VersionManifest> {
    fetch_json(&format!("{}/version.json", release_base_url(release)))
}

fn print_release_manifest(title: &str, release: &str) {
    println!("\n{title}");
    match fetch_version_manifest(release) {
        Ok(manifest) => {
            print_manifest_fields(&manifest, release);
            println!("\nStatus");
            print_version_status(&manifest, release);
        }
        Err(error) => {
            println!("  Unable to check release metadata: {error}");
        }
    }
}

fn print_latest_stable_release() {
    println!("\nLatest stable release");
    match fetch_latest_stable_release() {
        Ok(release) => print_release_manifest_body(&release),
        Err(error) => println!("  Unable to check stable release: {error}"),
    }
}

fn print_release_manifest_body(release: &GitHubRelease) {
    match fetch_version_manifest(&release.tag_name) {
        Ok(manifest) => {
            print_manifest_fields(&manifest, &release.tag_name);
            println!("\nStatus");
            print_version_status(&manifest, &release.tag_name);
        }
        Err(error) => println!("  Unable to check release metadata: {error}"),
    }
}

fn print_manifest_fields(manifest: &VersionManifest, release: &str) {
    println!(
        "  Release:    {}",
        manifest.release_tag.as_deref().unwrap_or(release)
    );
    println!("  Version:    {}", manifest.version);
    println!("  Git SHA:    {}", manifest.git_sha);
    if let Some(git_ref) = manifest.git_ref.as_deref() {
        println!("  Git ref:    {git_ref}");
    }
    if let Some(build_time) = manifest.build_time.as_deref() {
        println!("  Built:      {build_time}");
    }
    if let Some(target) = manifest.target.as_deref() {
        println!("  Target:     {target}");
    }
}

fn print_version_status(latest: &VersionManifest, release: &str) {
    let local_sha = build_git_sha();
    if !is_known_sha(local_sha) {
        println!("  Local binary has no embedded Git SHA; latest check is informational.");
    } else if latest.git_sha == local_sha {
        println!(
            "  Up to date: local commit {} matches {}",
            short_sha(local_sha),
            release
        );
    } else if latest.version == env!("CARGO_PKG_VERSION") {
        println!("  Different build available on {release}");
        println!(
            "  Local:  {} ({})",
            env!("CARGO_PKG_VERSION"),
            short_sha(local_sha)
        );
        println!(
            "  Remote: {} ({})",
            latest.version,
            short_sha(&latest.git_sha)
        );
        if release == "latest" {
            println!("  Run: sudo dokuru update");
        } else {
            println!("  Run: sudo dokuru update --version {release}");
        }
    } else {
        println!("  New release available");
        println!(
            "  Local:  {} ({})",
            env!("CARGO_PKG_VERSION"),
            short_sha(local_sha)
        );
        println!(
            "  Remote: {} ({})",
            latest.version,
            short_sha(&latest.git_sha)
        );
        if release == "latest" {
            println!("  Run: sudo dokuru update");
        } else {
            println!("  Run: sudo dokuru update --version {release}");
        }
    }
}

fn print_release_list() {
    println!("\nRecent releases");
    match fetch_releases() {
        Ok(releases) if releases.is_empty() => println!("  No releases found"),
        Ok(releases) => {
            for release in releases
                .into_iter()
                .filter(|release| !release.draft && is_agent_release_tag(&release.tag_name))
            {
                let channel = if release.tag_name == "latest" {
                    "rolling"
                } else if release.prerelease {
                    "pre-release"
                } else {
                    "stable"
                };
                let name = release.name.as_deref().unwrap_or(&release.tag_name);
                println!("  {:<14} {:<11} {}", release.tag_name, channel, name);
            }
        }
        Err(error) => println!("  Unable to list releases: {error}"),
    }
}

fn fetch_latest_stable_release() -> Result<GitHubRelease> {
    fetch_json("https://api.github.com/repos/rifuki/dokuru/releases/latest")
}

fn is_agent_release_tag(tag: &str) -> bool {
    tag == "latest" || is_semver_tag(tag)
}

fn is_semver_tag(tag: &str) -> bool {
    let Some(version) = tag.strip_prefix('v') else {
        return false;
    };
    let mut parts = version.split('.');
    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some(major), Some(minor), Some(patch), None)
            if major.chars().all(|c| c.is_ascii_digit())
                && minor.chars().all(|c| c.is_ascii_digit())
                && patch.chars().all(|c| c.is_ascii_digit())
    )
}

fn fetch_releases() -> Result<Vec<GitHubRelease>> {
    fetch_json("https://api.github.com/repos/rifuki/dokuru/releases?per_page=20")
}

fn fetch_json<T>(url: &str) -> Result<T>
where
    T: DeserializeOwned + Send + 'static,
{
    let url = url.to_string();
    std::thread::spawn(move || -> Result<T> {
        let client = reqwest::blocking::Client::builder()
            .user_agent(format!("dokuru-agent/{}", env!("CARGO_PKG_VERSION")))
            .timeout(std::time::Duration::from_secs(5))
            .build()?;
        let response = client.get(url).send()?.error_for_status()?;
        Ok(response.json()?)
    })
    .join()
    .map_err(|_| eyre::eyre!("release metadata request panicked"))?
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
