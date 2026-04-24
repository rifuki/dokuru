use std::{io::Write, path::Path, process::Command};

use anyhow::{Context, Result, bail};
use cliclack::password;

const GHCR_PREFIX: &str = "ghcr.io/rifuki/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageAccessError {
    pub image: String,
    pub stderr: String,
    pub auth_error: bool,
}

pub fn compose_images(project_dir: &Path, version: Option<&str>) -> Result<Vec<String>, String> {
    let mut command = Command::new("docker");
    command.args(["compose", "config", "--images"]);
    command.current_dir(project_dir);
    if let Some(version) = version {
        command.env("VERSION", version);
    }

    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let mut images = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|image| image.starts_with(GHCR_PREFIX))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    images.sort();
    images.dedup();

    if images.is_empty() {
        return Err(format!(
            "docker compose config did not report any {GHCR_PREFIX} images"
        ));
    }

    Ok(images)
}

pub fn check_images<I, S>(images: I) -> Result<(), ImageAccessError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for image in images {
        inspect_image(image.as_ref())?;
    }

    Ok(())
}

pub fn ensure_access(project_dir: &Path, version: Option<&str>) -> Result<()> {
    let images = compose_images(project_dir, version).map_err(anyhow::Error::msg)?;
    match check_images(&images) {
        Ok(()) => Ok(()),
        Err(error) if error.auth_error => {
            println!(
                "GHCR denied access to {}. Docker credentials are missing or expired.",
                error.image
            );
            prompt_ghcr_login()?;
            check_images(&images).map_err(|retry_error| {
                anyhow::anyhow!(
                    "GHCR login did not grant access to {}: {}",
                    retry_error.image,
                    image_access_error_message(&retry_error)
                )
            })
        }
        Err(error) => bail!(
            "cannot inspect {}: {}",
            error.image,
            image_access_error_message(&error)
        ),
    }
}

pub fn auth_failure_message(error: &ImageAccessError) -> String {
    if error.auth_error {
        return format!(
            "cannot pull {}: GHCR denied access. Run `dokuru-deploy up` to log in interactively, or run `docker login ghcr.io -u rifuki` with a classic PAT that has `read:packages`.",
            error.image
        );
    }

    if error.stderr.is_empty() {
        return format!("cannot inspect {}", error.image);
    }

    format!("cannot inspect {}: {}", error.image, error.stderr)
}

fn inspect_image(image: &str) -> Result<(), ImageAccessError> {
    match Command::new("docker")
        .args(["manifest", "inspect", image])
        .output()
    {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(ImageAccessError {
                image: image.to_string(),
                auth_error: is_registry_auth_error(&stderr),
                stderr,
            })
        }
        Err(error) => Err(ImageAccessError {
            image: image.to_string(),
            stderr: error.to_string(),
            auth_error: false,
        }),
    }
}

fn prompt_ghcr_login() -> Result<()> {
    let token = password("GitHub classic PAT for GHCR (`read:packages`)").interact()?;
    let token = token.trim();

    if token.is_empty() {
        bail!("GHCR PAT cannot be empty");
    }

    docker_login_ghcr("rifuki", token)
}

fn docker_login_ghcr(username: &str, token: &str) -> Result<()> {
    let mut child = Command::new("docker")
        .args(["login", "ghcr.io", "-u", username, "--password-stdin"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("failed to start docker login ghcr.io")?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .context("failed to open docker login stdin")?;
        stdin.write_all(token.as_bytes())?;
        stdin.write_all(b"\n")?;
    }

    let output = child.wait_with_output()?;
    if !output.status.success() {
        bail!(
            "docker login ghcr.io failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    Ok(())
}

fn image_access_error_message(error: &ImageAccessError) -> String {
    if error.stderr.is_empty() {
        "no error output".to_string()
    } else {
        error.stderr.clone()
    }
}

fn is_registry_auth_error(stderr: &str) -> bool {
    let stderr = stderr.to_ascii_lowercase();
    stderr.contains("unauthorized")
        || stderr.contains("denied")
        || stderr.contains("forbidden")
        || stderr.contains("403")
}

#[cfg(test)]
mod tests {
    use super::is_registry_auth_error;

    #[test]
    fn registry_auth_error_detects_common_registry_failures() {
        assert!(is_registry_auth_error("error from registry: unauthorized"));
        assert!(is_registry_auth_error("403 Forbidden"));
        assert!(!is_registry_auth_error("manifest unknown"));
    }
}
