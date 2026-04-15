use eyre::Result;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const REPO_URL: &str = "https://github.com/rifuki/dokuru";
pub const LATEST_RELEASE_BASE_URL: &str =
    "https://github.com/rifuki/dokuru/releases/download/latest";

pub fn run_command(cmd: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(cmd)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    if !status.success() {
        eyre::bail!("Command failed: {} {}", cmd, args.join(" "));
    }
    Ok(())
}

pub fn run_step<F>(label: &str, f: F) -> Result<()>
where
    F: FnOnce() -> Result<()>,
{
    let spinner = cliclack::spinner();
    spinner.start(label);
    match f() {
        Ok(_) => {
            spinner.stop(format!("✓ {}", label));
            Ok(())
        }
        Err(e) => {
            spinner.stop(format!("✗ {}", label));
            Err(e)
        }
    }
}
