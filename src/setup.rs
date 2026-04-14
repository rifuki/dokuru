use clap::Args;
use dialoguer::{theme::ColorfulTheme, Confirm, Input};
use eyre::{bail, Result, WrapErr};
use indicatif::{ProgressBar, ProgressStyle};
use std::fs;
use std::io::{stderr, stdout, IsTerminal};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

#[derive(Args, Debug, Clone, Default)]
pub struct SetupArgs {
    /// Skip interactive prompts and use detected defaults
    #[arg(long, short = 'y')]
    pub yes: bool,

    /// Override the service port
    #[arg(long)]
    pub port: Option<u16>,

    /// Override the host bind address
    #[arg(long)]
    pub host: Option<String>,

    /// Override the Docker socket path
    #[arg(long = "docker-socket")]
    pub docker_socket: Option<String>,

    /// Override allowed CORS origins
    #[arg(long = "cors-origins")]
    pub cors_origins: Option<String>,

    /// Override the binary install path
    #[arg(long = "install-path")]
    pub install_path: Option<PathBuf>,

    /// Override the config directory
    #[arg(long = "config-dir")]
    pub config_dir: Option<PathBuf>,

    /// Override the systemd unit directory
    #[arg(long = "systemd-dir")]
    pub systemd_dir: Option<PathBuf>,

    /// Override the systemd service name
    #[arg(long = "service-name")]
    pub service_name: Option<String>,

    /// Skip writing and starting a systemd unit
    #[arg(long = "skip-service")]
    pub skip_service: bool,
}

#[derive(Clone, Copy, Debug)]
pub enum SetupMode {
    Setup,
    Configure,
}

#[derive(Debug)]
struct InstallerConfig {
    yes: bool,
    install_path: PathBuf,
    config_dir: PathBuf,
    systemd_dir: PathBuf,
    service_name: String,
    port: u16,
    host: String,
    docker_socket: String,
    cors_origins: String,
    skip_service: bool,
}

#[derive(Debug)]
struct Preflight {
    os: &'static str,
    arch: &'static str,
    running_as_root: bool,
    has_systemd: bool,
    docker_socket_exists: bool,
    docker_service_exists: bool,
}

pub fn run(mode: SetupMode, args: SetupArgs) -> Result<()> {
    let config = resolve_config(args)?;
    let preflight = collect_preflight(&config);

    print_banner(mode);
    print_preflight(&config, &preflight);

    if !preflight.running_as_root {
        bail!(
            "{} requires root privileges. Re-run with `sudo dokuru {}`.",
            mode.label(),
            mode.command_name()
        );
    }

    if !preflight.docker_socket_exists {
        bail!(
            "Docker socket {} is not available. Start Docker before continuing.",
            config.docker_socket
        );
    }

    let config = prompt_for_config(mode, config)?;
    print_plan(&config, &preflight);

    if !config.skip_service && !preflight.has_systemd {
        bail!("systemd was not detected. Re-run with `--skip-service` to configure Dokuru without a service.");
    }

    if !config.skip_service && !confirm_install(mode, &config)? {
        bail!("Installation cancelled.");
    }

    if config.skip_service && !confirm_install(mode, &config)? {
        bail!("Configuration cancelled.");
    }

    let source_binary =
        std::env::current_exe().wrap_err("Failed to resolve current Dokuru binary path")?;

    if mode.should_install_binary() {
        run_step("Installing Dokuru binary", || {
            install_binary(&source_binary, &config.install_path)
        })?;
    }

    run_step("Writing Dokuru configuration", || write_env_file(&config))?;

    if !config.skip_service {
        run_step("Writing systemd unit", || {
            write_systemd_unit(&config, &preflight)
        })?;
        run_step("Reloading systemd", reload_systemd)?;
        run_step("Enabling Dokuru service", || {
            enable_service(&config.service_name)
        })?;

        match run_step("Starting Dokuru service", || {
            restart_service(&config.service_name)
        }) {
            Ok(_) => print_summary(&config, true),
            Err(err) => {
                log_warn(&format!(
                    "Dokuru service was installed but failed to start: {err}"
                ));
                log_info(&format!(
                    "Inspect logs with: journalctl -u {} -f",
                    config.service_name
                ));
                print_summary(&config, false);
            }
        }
    } else {
        print_summary(&config, false);
    }

    Ok(())
}

impl SetupMode {
    fn label(self) -> &'static str {
        match self {
            Self::Setup => "Dokuru setup",
            Self::Configure => "Dokuru configure",
        }
    }

    fn command_name(self) -> &'static str {
        match self {
            Self::Setup => "setup",
            Self::Configure => "configure",
        }
    }

    fn heading(self) -> &'static str {
        match self {
            Self::Setup => "Interactive installer",
            Self::Configure => "Interactive reconfiguration",
        }
    }

    fn should_install_binary(self) -> bool {
        matches!(self, Self::Setup)
    }
}

fn resolve_config(args: SetupArgs) -> Result<InstallerConfig> {
    let install_path = args.install_path.unwrap_or_else(default_install_path);
    let config_dir = args.config_dir.unwrap_or_else(default_config_dir);
    let systemd_dir = args.systemd_dir.unwrap_or_else(default_systemd_dir);
    let service_name = args.service_name.unwrap_or_else(|| "dokuru".to_string());

    let port = match args.port {
        Some(port) => port,
        None => std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(3939),
    };

    let host = args
        .host
        .or_else(|| std::env::var("HOST").ok())
        .unwrap_or_else(|| "0.0.0.0".to_string());

    let docker_socket = args
        .docker_socket
        .or_else(|| std::env::var("DOCKER_SOCKET").ok())
        .unwrap_or_else(|| "/var/run/docker.sock".to_string());

    let cors_origins = args
        .cors_origins
        .or_else(|| std::env::var("CORS_ORIGINS").ok())
        .unwrap_or_else(|| "*".to_string());

    Ok(InstallerConfig {
        yes: args.yes,
        install_path,
        config_dir,
        systemd_dir,
        service_name,
        port,
        host,
        docker_socket,
        cors_origins,
        skip_service: args.skip_service,
    })
}

fn collect_preflight(config: &InstallerConfig) -> Preflight {
    Preflight {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        running_as_root: nix_like_is_root(),
        has_systemd: command_exists("systemctl"),
        docker_socket_exists: is_socket(Path::new(&config.docker_socket)),
        docker_service_exists: command_exists("systemctl") && has_systemd_unit("docker.service"),
    }
}

fn prompt_for_config(mode: SetupMode, mut config: InstallerConfig) -> Result<InstallerConfig> {
    if config.yes || !stderr().is_terminal() {
        return Ok(config);
    }

    let theme = ColorfulTheme::default();

    if !Confirm::with_theme(&theme)
        .with_prompt(format!("{} now?", mode.label()))
        .default(true)
        .interact()?
    {
        bail!("Setup cancelled.");
    }

    config.port = Input::with_theme(&theme)
        .with_prompt("Dokuru port")
        .default(config.port)
        .interact_text()?;

    config.host = Input::with_theme(&theme)
        .with_prompt("Bind address")
        .default(config.host.clone())
        .interact_text()?;

    config.docker_socket = Input::with_theme(&theme)
        .with_prompt("Docker socket path")
        .default(config.docker_socket.clone())
        .interact_text()?;

    config.cors_origins = Input::with_theme(&theme)
        .with_prompt("CORS origins")
        .default(config.cors_origins.clone())
        .interact_text()?;

    if !config.skip_service {
        config.skip_service = !Confirm::with_theme(&theme)
            .with_prompt("Install and manage Dokuru as a systemd service?")
            .default(true)
            .interact()?;
    }

    Ok(config)
}

fn confirm_install(mode: SetupMode, config: &InstallerConfig) -> Result<bool> {
    if config.yes || !stderr().is_terminal() {
        return Ok(true);
    }

    let theme = ColorfulTheme::default();
    let prompt = match mode {
        SetupMode::Setup => format!("Install Dokuru to {}?", config.install_path.display()),
        SetupMode::Configure => format!("Apply changes to {}?", config.config_dir.display()),
    };

    Confirm::with_theme(&theme)
        .with_prompt(prompt)
        .default(true)
        .interact()
        .map_err(Into::into)
}

fn install_binary(source: &Path, destination: &Path) -> Result<()> {
    if source == destination {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| eyre::eyre!("Install path must include a parent directory"))?;

    fs::create_dir_all(parent)
        .wrap_err_with(|| format!("Failed to create {}", parent.display()))?;
    fs::copy(source, destination).wrap_err_with(|| {
        format!(
            "Failed to copy Dokuru binary from {} to {}",
            source.display(),
            destination.display()
        )
    })?;

    let mut permissions = fs::metadata(destination)
        .wrap_err_with(|| format!("Failed to stat {}", destination.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(destination, permissions)
        .wrap_err_with(|| format!("Failed to chmod {}", destination.display()))?;

    Ok(())
}

fn write_env_file(config: &InstallerConfig) -> Result<()> {
    fs::create_dir_all(&config.config_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.config_dir.display()))?;

    let env_path = config.config_dir.join(".env");
    let env_content = format!(
        "PORT={}\nHOST={}\nDOCKER_SOCKET={}\nCORS_ORIGINS={}\n",
        config.port, config.host, config.docker_socket, config.cors_origins
    );

    fs::write(&env_path, env_content)
        .wrap_err_with(|| format!("Failed to write {}", env_path.display()))
}

fn write_systemd_unit(config: &InstallerConfig, preflight: &Preflight) -> Result<()> {
    fs::create_dir_all(&config.systemd_dir)
        .wrap_err_with(|| format!("Failed to create {}", config.systemd_dir.display()))?;

    let after_targets = if preflight.docker_service_exists {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let wants_targets = if preflight.docker_service_exists {
        "network-online.target docker.service"
    } else {
        "network-online.target"
    };

    let unit_path = config
        .systemd_dir
        .join(format!("{}.service", config.service_name));

    let unit_content = format!(
        "[Unit]\nDescription=Dokuru Docker Hardening Agent\nDocumentation=https://github.com/rifuki/dokuru\nAfter={}\nWants={}\n\n[Service]\nType=simple\nEnvironmentFile=-{}/.env\nExecStart={} serve\nRestart=on-failure\nRestartSec=5s\nStandardOutput=journal\nStandardError=journal\nSyslogIdentifier={}\nNoNewPrivileges=yes\nProtectSystem=strict\nReadWritePaths={} /etc/docker\n\n[Install]\nWantedBy=multi-user.target\n",
        after_targets,
        wants_targets,
        config.config_dir.display(),
        config.install_path.display(),
        config.service_name,
        config.config_dir.display(),
    );

    fs::write(&unit_path, unit_content)
        .wrap_err_with(|| format!("Failed to write {}", unit_path.display()))
}

fn reload_systemd() -> Result<()> {
    run_command("systemctl", &["daemon-reload"])
}

fn enable_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["enable", service_name])
}

fn restart_service(service_name: &str) -> Result<()> {
    run_command("systemctl", &["restart", service_name])
}

fn run_command(program: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(program)
        .args(args)
        .status()
        .wrap_err_with(|| format!("Failed to execute {}", program))?;

    if !status.success() {
        bail!("{} {:?} exited with status {}", program, args, status);
    }

    Ok(())
}

fn run_step<T, F>(label: &str, action: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    if stderr().is_terminal() {
        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::with_template("  {spinner} {msg}")
                .unwrap()
                .tick_strings(&["[   ]", "[.  ]", "[.. ]", "[ ..]", "[  .]"]),
        );
        spinner.enable_steady_tick(Duration::from_millis(80));
        spinner.set_message(label.to_string());

        match action() {
            Ok(value) => {
                spinner.finish_with_message(format!("{} {}", ok_prefix(), label));
                Ok(value)
            }
            Err(err) => {
                spinner.finish_and_clear();
                Err(err)
            }
        }
    } else {
        log_step(label);
        let result = action();
        if result.is_ok() {
            log_ok(label);
        }
        result
    }
}

fn print_banner(mode: SetupMode) {
    println!();
    println!("  {} {}", bold("dokuru"), dim(mode.heading()));
    println!("  {}", dim("Docker hardening agent installer"));
}

fn print_preflight(config: &InstallerConfig, preflight: &Preflight) {
    println!();
    println!("  {}", bold("Preflight"));
    print_item(ok_prefix(), "OS", preflight.os);
    print_item(ok_prefix(), "Architecture", preflight.arch);
    print_item(
        if preflight.running_as_root {
            ok_prefix()
        } else {
            fail_prefix()
        },
        "Privileges",
        if preflight.running_as_root {
            "running as root"
        } else {
            "root privileges required"
        },
    );
    print_item(
        if preflight.has_systemd {
            ok_prefix()
        } else {
            warn_prefix()
        },
        "Init system",
        if preflight.has_systemd {
            "systemd detected"
        } else {
            "systemd not detected"
        },
    );
    print_item(
        if preflight.docker_socket_exists {
            ok_prefix()
        } else {
            fail_prefix()
        },
        "Docker socket",
        &config.docker_socket,
    );
    print_item(
        if preflight.docker_service_exists {
            ok_prefix()
        } else {
            warn_prefix()
        },
        "docker.service",
        if preflight.docker_service_exists {
            "detected"
        } else {
            "not detected"
        },
    );
}

fn print_plan(config: &InstallerConfig, preflight: &Preflight) {
    println!();
    println!("  {}", bold("Plan"));
    print_item(
        step_prefix(),
        "Binary",
        &config.install_path.display().to_string(),
    );
    print_item(
        step_prefix(),
        "Config",
        &config.config_dir.join(".env").display().to_string(),
    );
    print_item(step_prefix(), "Port", &config.port.to_string());
    print_item(step_prefix(), "Host", &config.host);
    print_item(step_prefix(), "Docker socket", &config.docker_socket);
    print_item(step_prefix(), "CORS", &config.cors_origins);

    if config.skip_service {
        print_item(step_prefix(), "Service", "skipped");
    } else if preflight.has_systemd {
        print_item(
            step_prefix(),
            "Service",
            &config
                .systemd_dir
                .join(format!("{}.service", config.service_name))
                .display()
                .to_string(),
        );
    }
}

fn print_summary(config: &InstallerConfig, service_started: bool) {
    println!();
    println!("  {}", bold("Summary"));
    print_item(ok_prefix(), "Version", env!("CARGO_PKG_VERSION"));
    print_item(
        ok_prefix(),
        "Binary",
        &config.install_path.display().to_string(),
    );
    print_item(
        ok_prefix(),
        "Config",
        &config.config_dir.join(".env").display().to_string(),
    );

    if config.skip_service {
        print_item(warn_prefix(), "Service", "not installed");
        log_info(&format!(
            "Run manually: {} serve",
            config.install_path.display()
        ));
    } else if service_started {
        print_item(ok_prefix(), "Service", "running");
        log_info(&format!("Logs: journalctl -u {} -f", config.service_name));
    } else {
        print_item(warn_prefix(), "Service", "installed but not running");
    }

    log_info(&format!("Dashboard: http://<your-host>:{}", config.port));
    println!();
}

fn print_item(status: String, label: &str, value: &str) {
    println!("    {:<6} {:<16} {}", status, label, value);
}

fn command_exists(program: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {} >/dev/null 2>&1", program)])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn has_systemd_unit(unit: &str) -> bool {
    Command::new("systemctl")
        .args(["cat", unit])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn is_socket(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.file_type().is_socket())
        .unwrap_or(false)
}

fn nix_like_is_root() -> bool {
    matches!(std::env::var("USER"), Ok(user) if user == "root") || uid_via_id() == Some(0)
}

fn uid_via_id() -> Option<u32> {
    let output = Command::new("id").arg("-u").output().ok()?;
    if !output.status.success() {
        return None;
    }
    std::str::from_utf8(&output.stdout)
        .ok()?
        .trim()
        .parse()
        .ok()
}

fn default_install_path() -> PathBuf {
    PathBuf::from("/usr/local/bin/dokuru")
}

fn default_config_dir() -> PathBuf {
    PathBuf::from("/etc/dokuru")
}

fn default_systemd_dir() -> PathBuf {
    PathBuf::from("/etc/systemd/system")
}

fn use_color() -> bool {
    stdout().is_terminal()
}

fn paint(code: &str, text: &str) -> String {
    if use_color() {
        format!("\x1b[{code}m{text}\x1b[0m")
    } else {
        text.to_string()
    }
}

fn bold(text: &str) -> String {
    paint("1", text)
}

fn dim(text: &str) -> String {
    paint("2", text)
}

fn ok_prefix() -> String {
    paint("38;5;83", "[ok]")
}

fn warn_prefix() -> String {
    paint("38;5;208", "[!!]")
}

fn fail_prefix() -> String {
    paint("38;5;196", "[xx]")
}

fn step_prefix() -> String {
    paint("38;5;45", "[->]")
}

fn log_step(message: &str) {
    println!("  {} {}", step_prefix(), message);
}

fn log_ok(message: &str) {
    println!("  {} {}", ok_prefix(), message);
}

fn log_warn(message: &str) {
    println!("  {} {}", warn_prefix(), message);
}

fn log_info(message: &str) {
    println!("  {}", dim(message));
}
