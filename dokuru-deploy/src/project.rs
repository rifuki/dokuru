use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{Context, Result, bail};

pub const DEFAULT_REPO_URL: &str = "https://github.com/rifuki/dokuru.git";

const DEFAULT_PROJECT_DIR: &str = "~/apps/dokuru";
const PROJECT_DIR_ENV: &str = "DOKURU_PROJECT_DIR";
const REQUIRED_MARKERS: &str = "docker-compose.yaml, dokuru-server";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Bootstrap {
    Error,
    Clone,
}

pub fn default_project_dir() -> PathBuf {
    expand_path(DEFAULT_PROJECT_DIR)
}

pub fn detect_project_dir() -> Result<Option<PathBuf>> {
    let current_dir = env::current_dir().context("failed to read current directory")?;
    lookup_project_dir(&current_dir)
}

pub fn resolve_existing_project_dir(project_dir: &Path) -> Result<PathBuf> {
    let current_dir = env::current_dir().context("failed to read current directory")?;
    if should_lookup(project_dir)
        && let Some(found) = lookup_project_dir(&current_dir)?
    {
        return Ok(found);
    }

    let candidate = absolute_path(project_dir, &current_dir);
    ensure_project_dir(&candidate)?;
    Ok(candidate)
}

pub fn prepare_project_dir(
    project_dir: &Path,
    bootstrap: Bootstrap,
    repo_url: &str,
) -> Result<PathBuf> {
    let current_dir = env::current_dir().context("failed to read current directory")?;
    if should_lookup(project_dir)
        && let Some(found) = lookup_project_dir(&current_dir)?
    {
        return Ok(found);
    }

    let candidate = if should_lookup(project_dir) {
        default_project_dir()
    } else {
        absolute_path(project_dir, &current_dir)
    };

    ensure_or_bootstrap(&candidate, bootstrap, repo_url)?;
    Ok(candidate)
}

pub fn ensure_or_bootstrap(project_dir: &Path, bootstrap: Bootstrap, repo_url: &str) -> Result<()> {
    if is_project_dir(project_dir) {
        return Ok(());
    }

    match bootstrap {
        Bootstrap::Error => bail!(
            "{} is not a Dokuru checkout. Run from the repo, pass --project-dir, or use --clone-if-missing.",
            project_dir.display()
        ),
        Bootstrap::Clone => clone_repo(repo_url, project_dir)?,
    }

    ensure_project_dir(project_dir)
}

pub fn is_project_dir(path: &Path) -> bool {
    path.join("docker-compose.yaml").is_file() && path.join("dokuru-server").is_dir()
}

fn lookup_project_dir(current_dir: &Path) -> Result<Option<PathBuf>> {
    if let Some(found) = find_ancestor_project_dir(current_dir) {
        return Ok(Some(found));
    }

    if let Some(path) = env_project_dir()?
        && is_project_dir(&path)
    {
        return Ok(Some(path));
    }

    let default_dir = default_project_dir();
    if is_project_dir(&default_dir) {
        return Ok(Some(default_dir));
    }

    Ok(None)
}

fn find_ancestor_project_dir(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|path| is_project_dir(path))
        .map(Path::to_path_buf)
}

fn env_project_dir() -> Result<Option<PathBuf>> {
    match env::var(PROJECT_DIR_ENV) {
        Ok(value) if !value.trim().is_empty() => Ok(Some(expand_path(&value))),
        Ok(_) | Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).context("failed to read DOKURU_PROJECT_DIR"),
    }
}

fn ensure_project_dir(project_dir: &Path) -> Result<()> {
    if is_project_dir(project_dir) {
        Ok(())
    } else {
        bail!(
            "{} is not a Dokuru checkout: required markers are missing ({})",
            project_dir.display(),
            REQUIRED_MARKERS
        );
    }
}

fn clone_repo(repo_url: &str, project_dir: &Path) -> Result<()> {
    ensure_clone_destination(project_dir)?;
    if let Some(parent) = project_dir.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    let status = Command::new("git")
        .args(["clone", "--depth", "1", repo_url])
        .arg(project_dir)
        .status()
        .with_context(|| format!("failed to run git clone for {repo_url}"))?;

    if status.success() {
        Ok(())
    } else {
        bail!("git clone failed with {status}");
    }
}

fn ensure_clone_destination(project_dir: &Path) -> Result<()> {
    if !project_dir.exists() {
        return Ok(());
    }
    if !project_dir.is_dir() {
        bail!("{} exists but is not a directory", project_dir.display());
    }

    let is_empty = fs::read_dir(project_dir)
        .with_context(|| format!("failed to read {}", project_dir.display()))?
        .next()
        .transpose()?
        .is_none();
    if is_empty {
        Ok(())
    } else {
        bail!(
            "{} exists but is not a Dokuru checkout or an empty directory",
            project_dir.display()
        );
    }
}

fn absolute_path(path: &Path, current_dir: &Path) -> PathBuf {
    let expanded = expand_path(&path.display().to_string());
    if expanded.is_absolute() {
        expanded
    } else {
        current_dir.join(expanded)
    }
}

fn expand_path(path: &str) -> PathBuf {
    PathBuf::from(shellexpand::tilde(path).into_owned())
}

fn should_lookup(path: &Path) -> bool {
    path == Path::new(".")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{find_ancestor_project_dir, is_project_dir};

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "dokuru-deploy-{name}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("failed to create temp dir");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn project_dir_requires_compose_and_server_markers() {
        let temp = TempDir::new("markers");
        fs::write(temp.path().join("docker-compose.yaml"), "services: {}\n")
            .expect("failed to write compose file");
        assert!(!is_project_dir(temp.path()));

        fs::create_dir(temp.path().join("dokuru-server")).expect("failed to create server dir");
        assert!(is_project_dir(temp.path()));
    }

    #[test]
    fn ancestor_lookup_finds_project_root() {
        let temp = TempDir::new("ancestor");
        fs::write(temp.path().join("docker-compose.yaml"), "services: {}\n")
            .expect("failed to write compose file");
        fs::create_dir(temp.path().join("dokuru-server")).expect("failed to create server dir");
        let nested = temp.path().join("dokuru-server/src/http");
        fs::create_dir_all(&nested).expect("failed to create nested dir");

        assert_eq!(
            find_ancestor_project_dir(&nested),
            Some(temp.path().to_path_buf())
        );
    }
}
