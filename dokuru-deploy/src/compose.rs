use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{Context, Result, bail};
use cliclack::{intro, outro};

use crate::{ghcr, project};

const APP_SERVICES: &[&str] = &["dokuru-server", "dokuru-www", "dokuru-landing"];
const INFRA_SERVICES: &[&str] = &["dokuru-db", "dokuru-redis"];
const MIGRATION_SERVICE: &str = "dokuru-server-migrate";
const SERVER_SERVICE: &str = "dokuru-server";
const HEALTHCHECK_BINARY: &str = "/app/dokuru-server";
const HEALTHCHECK_ARG: &str = "--healthcheck";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ComposeBinary {
    DockerPlugin,
    DockerCompose,
}

#[derive(Debug)]
pub struct Compose {
    project_dir: PathBuf,
    binary: ComposeBinary,
    dry_run: bool,
    version: Option<String>,
}

impl Compose {
    pub fn new(project_dir: &Path, dry_run: bool, version: Option<String>) -> Result<Self> {
        let project_dir = project::resolve_existing_project_dir(project_dir)?;
        Ok(Self {
            project_dir,
            binary: detect_compose_binary()?,
            dry_run,
            version,
        })
    }

    pub fn deploy(&self, services: &[String], pull: bool, migrate: bool) -> Result<()> {
        let app_services = services_or_default(services, APP_SERVICES);

        if pull {
            let pull_services = with_migration_service(&app_services);
            self.pull(&pull_services)?;
        }

        self.up(&to_owned(INFRA_SERVICES))?;

        if migrate {
            self.migrate()?;
        }

        self.up(&app_services)?;
        self.status(&app_services)
    }

    pub fn pull(&self, services: &[String]) -> Result<()> {
        self.ensure_ghcr_access(services)?;
        let mut args = vec!["pull".to_string()];
        args.extend_from_slice(services);
        self.run(args)
    }

    pub fn up(&self, services: &[String]) -> Result<()> {
        self.ensure_ghcr_access(services)?;
        let mut args = vec!["up".to_string(), "-d".to_string()];
        args.extend_from_slice(services);
        self.run(args)
    }

    pub fn down(&self, volumes: bool) -> Result<()> {
        let mut args = vec!["down".to_string()];
        if volumes {
            args.push("--volumes".to_string());
        }
        self.run(args)
    }

    pub fn migrate(&self) -> Result<()> {
        self.ensure_ghcr_access(&[MIGRATION_SERVICE.to_string()])?;
        self.run([
            "--profile".to_string(),
            "migrate".to_string(),
            "run".to_string(),
            "--rm".to_string(),
            MIGRATION_SERVICE.to_string(),
        ])
    }

    pub fn status(&self, services: &[String]) -> Result<()> {
        let mut args = vec!["ps".to_string()];
        args.extend_from_slice(services);
        self.run(args)
    }

    pub fn health(&self) -> Result<()> {
        self.status(&to_owned(&[SERVER_SERVICE]))?;
        self.run([
            "exec".to_string(),
            "-T".to_string(),
            SERVER_SERVICE.to_string(),
            HEALTHCHECK_BINARY.to_string(),
            HEALTHCHECK_ARG.to_string(),
        ])
    }

    pub fn config_check(&self) -> Result<()> {
        self.run(["config".to_string(), "--quiet".to_string()])
    }

    pub fn restart(&self, services: &[String]) -> Result<()> {
        let mut args = vec!["restart".to_string()];
        args.extend_from_slice(services);
        self.run(args)
    }

    pub fn logs(&self, service: &str, lines: usize, follow: bool) -> Result<()> {
        let mut args = vec!["logs".to_string(), "--tail".to_string(), lines.to_string()];
        if follow {
            args.push("-f".to_string());
        }
        args.push(service.to_string());
        self.run(args)
    }

    fn ensure_ghcr_access(&self, services: &[String]) -> Result<()> {
        if self.dry_run || !services_require_ghcr(services) {
            return Ok(());
        }
        ghcr::ensure_access(&self.project_dir, self.version.as_deref())
    }

    fn run<I>(&self, args: I) -> Result<()>
    where
        I: IntoIterator<Item = String>,
    {
        let args: Vec<String> = args.into_iter().collect();
        if self.dry_run {
            println!("{}", self.render_command(&args));
            return Ok(());
        }

        let status = self
            .command(&args)
            .status()
            .with_context(|| format!("failed to run {}", self.render_command(&args)))?;

        if status.success() {
            Ok(())
        } else {
            bail!("command failed: {}", self.render_command(&args));
        }
    }

    fn command(&self, args: &[String]) -> Command {
        let mut command = match self.binary {
            ComposeBinary::DockerPlugin => {
                let mut command = Command::new("docker");
                command.arg("compose");
                command
            }
            ComposeBinary::DockerCompose => Command::new("docker-compose"),
        };

        command.current_dir(&self.project_dir);
        if let Some(version) = &self.version {
            command.env("VERSION", version);
        }
        command.args(args);
        command
    }

    fn render_command(&self, args: &[String]) -> String {
        let mut parts = Vec::new();
        if let Some(version) = &self.version {
            parts.push(format!("VERSION={version}"));
        }
        match self.binary {
            ComposeBinary::DockerPlugin => {
                parts.push("docker".to_string());
                parts.push("compose".to_string());
            }
            ComposeBinary::DockerCompose => parts.push("docker-compose".to_string()),
        }
        parts.extend(args.iter().map(|arg| shell_quote(arg)));
        parts.join(" ")
    }
}

#[derive(Debug)]
struct Check {
    name: &'static str,
    ok: bool,
    detail: String,
    required: bool,
}

pub fn doctor(project_dir: &Path) -> Result<()> {
    intro("Dokuru Deploy Doctor")?;
    let project_dir = project::resolve_existing_project_dir(project_dir)?;
    let checks = collect_checks(&project_dir);
    println!("Project: {}\n", project_dir.display());

    for check in &checks {
        let marker = if check.ok { "OK" } else { "FAIL" };
        println!("  [{marker}] {:<28} {}", check.name, check.detail);
    }

    if checks.iter().any(|check| check.required && !check.ok) {
        bail!("doctor found failed required checks");
    }

    outro("Doctor checks passed")?;
    Ok(())
}

pub fn services_or_default(services: &[String], defaults: &[&str]) -> Vec<String> {
    if services.is_empty() {
        to_owned(defaults)
    } else {
        services.to_vec()
    }
}

fn collect_checks(project_dir: &Path) -> Vec<Check> {
    vec![
        check_project_dir(project_dir),
        check_file(project_dir, "docker-compose.yaml", true),
        check_file(project_dir, "docker-compose.override.yaml", false),
        check_file(project_dir, "dokuru-server/config/local.toml", true),
        check_file(project_dir, "dokuru-server/config/secrets.toml", true),
        check_command("docker", &["--version"], true),
        check_docker_daemon(),
        check_compose(project_dir),
        check_ghcr(project_dir),
    ]
}

fn check_project_dir(project_dir: &Path) -> Check {
    Check {
        name: "project directory",
        ok: project_dir.is_dir(),
        detail: project_dir.display().to_string(),
        required: true,
    }
}

fn check_file(project_dir: &Path, relative_path: &'static str, required: bool) -> Check {
    let path = project_dir.join(relative_path);
    Check {
        name: relative_path,
        ok: path.is_file(),
        detail: path.display().to_string(),
        required,
    }
}

fn check_command(program: &'static str, args: &[&str], required: bool) -> Check {
    let result = Command::new(program).args(args).output();
    Check {
        name: program,
        ok: result.as_ref().is_ok_and(|output| output.status.success()),
        detail: result
            .as_ref()
            .map_or_else(|_| "not found".to_string(), command_output_summary),
        required,
    }
}

fn check_docker_daemon() -> Check {
    let result = Command::new("docker")
        .args(["info", "--format", "{{.ServerVersion}}"])
        .output();
    Check {
        name: "docker daemon",
        ok: result.as_ref().is_ok_and(|output| output.status.success()),
        detail: result
            .as_ref()
            .map_or_else(|_| "not reachable".to_string(), command_output_summary),
        required: true,
    }
}

fn check_compose(project_dir: &Path) -> Check {
    let result = detect_compose_binary().and_then(|binary| {
        let compose = Compose {
            project_dir: project_dir.to_path_buf(),
            binary,
            dry_run: false,
            version: None,
        };
        compose.config_check()
    });

    Check {
        name: "compose config",
        ok: result.is_ok(),
        detail: result.map_or_else(|error| error.to_string(), |()| "valid".to_string()),
        required: true,
    }
}

fn check_ghcr(project_dir: &Path) -> Check {
    let images = match ghcr::compose_images(project_dir, None) {
        Ok(images) => images,
        Err(error) => {
            return Check {
                name: "ghcr images",
                ok: false,
                detail: error,
                required: true,
            };
        }
    };

    match ghcr::check_images(&images) {
        Ok(()) => Check {
            name: "ghcr images",
            ok: true,
            detail: format!("{} image(s) accessible", images.len()),
            required: true,
        },
        Err(error) => Check {
            name: "ghcr images",
            ok: false,
            detail: ghcr::auth_failure_message(&error),
            required: true,
        },
    }
}

fn detect_compose_binary() -> Result<ComposeBinary> {
    if command_success("docker", &["compose", "version"]) {
        return Ok(ComposeBinary::DockerPlugin);
    }
    if command_success("docker-compose", &["version"]) {
        return Ok(ComposeBinary::DockerCompose);
    }
    bail!("docker compose plugin or docker-compose is required");
}

fn command_success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .is_ok_and(|output| output.status.success())
}

fn command_output_summary(output: &std::process::Output) -> String {
    if output.status.success() {
        first_line(&output.stdout).unwrap_or_else(|| "available".to_string())
    } else {
        first_line(&output.stderr).unwrap_or_else(|| format!("exit status {}", output.status))
    }
}

fn first_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn with_migration_service(services: &[String]) -> Vec<String> {
    let mut set = services.iter().cloned().collect::<BTreeSet<_>>();
    set.insert(MIGRATION_SERVICE.to_string());
    set.into_iter().collect()
}

fn services_require_ghcr(services: &[String]) -> bool {
    services.is_empty()
        || services.iter().any(|service| {
            matches!(
                service.as_str(),
                "dokuru-server" | "dokuru-www" | "dokuru-landing" | "dokuru-server-migrate"
            )
        })
}

fn to_owned(services: &[&str]) -> Vec<String> {
    services.iter().map(ToString::to_string).collect()
}

fn shell_quote(value: &str) -> String {
    if value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'))
    {
        value.to_string()
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        APP_SERVICES, services_or_default, services_require_ghcr, shell_quote,
        with_migration_service,
    };

    #[test]
    fn uses_default_services_when_none_are_given() {
        assert_eq!(services_or_default(&[], APP_SERVICES), APP_SERVICES);
    }

    #[test]
    fn preserves_explicit_services() {
        let services = vec!["dokuru-server".to_string()];
        assert_eq!(services_or_default(&services, APP_SERVICES), services);
    }

    #[test]
    fn migration_service_is_deduplicated_for_pull() {
        let services = vec![
            "dokuru-server".to_string(),
            "dokuru-server-migrate".to_string(),
        ];
        assert_eq!(
            with_migration_service(&services),
            vec![
                "dokuru-server".to_string(),
                "dokuru-server-migrate".to_string()
            ]
        );
    }

    #[test]
    fn shell_quote_keeps_simple_values_plain() {
        assert_eq!(shell_quote("dokuru-server"), "dokuru-server");
    }

    #[test]
    fn shell_quote_wraps_values_with_spaces() {
        assert_eq!(shell_quote("dokuru server"), "'dokuru server'");
    }

    #[test]
    fn ghcr_preflight_is_skipped_for_infra_only_services() {
        assert!(!services_require_ghcr(&[
            "dokuru-db".to_string(),
            "dokuru-redis".to_string(),
        ]));
        assert!(services_require_ghcr(&["dokuru-server".to_string()]));
        assert!(services_require_ghcr(&[]));
    }
}
