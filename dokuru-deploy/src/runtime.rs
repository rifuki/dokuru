use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use cliclack::{confirm, input, intro, note, outro, outro_cancel, password, select};
use serde::{Deserialize, Serialize};

use crate::generator::generate_secret;

const LOCAL_TOML: &str = "dokuru-server/config/local.toml";
const DEFAULTS_TOML: &str = "dokuru-server/config/defaults.toml";
const SECRETS_TOML: &str = "dokuru-server/config/secrets.toml";
const SECRETS_EXAMPLE_TOML: &str = "dokuru-server/config/secrets.toml.example";
const SERVER_ENV: &str = "dokuru-server/.env";
const ROOT_ENV: &str = ".env";
const COMPOSE_OVERRIDE_YAML: &str = "docker-compose.override.yaml";
const COMPOSE_OVERRIDE_YML: &str = "docker-compose.override.yml";

#[derive(Clone, Copy, Eq, PartialEq)]
enum ConfigureSection {
    Server,
    Secrets,
    ComposeEnv,
    Done,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConfigBackup {
    schema_version: u16,
    created_by: String,
    exported_at_unix: u64,
    source_project: String,
    files: Vec<BackupFile>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupFile {
    path: String,
    content: String,
    mode: Option<u32>,
}

pub fn configure(project_dir: &Path) -> Result<()> {
    intro("Dokuru Deploy Configure")?;
    note("Project", project_dir.display().to_string())?;
    note("Current config", configure_overview(project_dir))?;

    loop {
        let section = select("Select section to configure")
            .item(
                ConfigureSection::Server,
                "Server config",
                "local.toml: env, log, port, CORS, cookie, upload",
            )
            .item(
                ConfigureSection::Secrets,
                "Secrets",
                "database, Redis, JWT, and Resend values",
            )
            .item(
                ConfigureSection::ComposeEnv,
                "Compose env",
                "root .env and dokuru-server/.env runtime overrides",
            )
            .item(ConfigureSection::Done, "Exit", "finish configuration")
            .interact()?;

        match section {
            ConfigureSection::Server => configure_server_local(project_dir)?,
            ConfigureSection::Secrets => configure_secrets(project_dir)?,
            ConfigureSection::ComposeEnv => configure_env_files(project_dir)?,
            ConfigureSection::Done => {
                outro("Dokuru Deploy is ready.")?;
                return Ok(());
            }
        }
    }
}

pub fn repair(project_dir: &Path) -> Result<()> {
    intro("Dokuru Deploy Repair")?;
    note("Project", project_dir.display().to_string())?;

    let repairs = repair_generated_config(project_dir)?;
    if repairs.is_empty() {
        note("Repair", "No obvious config corruption found.")?;
    } else {
        note("Repair applied", repairs.join("\n"))?;
    }

    outro("Repair complete.")?;
    Ok(())
}

pub fn export_config(
    project_dir: &Path,
    output: Option<PathBuf>,
    print_stdout: bool,
) -> Result<()> {
    let backup = create_config_backup(project_dir)?;
    let json = serde_json::to_string_pretty(&backup)?;

    if print_stdout {
        println!("{json}");
        return Ok(());
    }

    intro("Dokuru Deploy Export")?;
    note("Project", project_dir.display().to_string())?;

    let output = output.unwrap_or_else(|| project_dir.join("dokuru-deploy-backup.json"));
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    std::fs::write(&output, json)
        .with_context(|| format!("failed to write {}", output.display()))?;

    note(
        "Exported files",
        backup
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>()
            .join("\n"),
    )?;
    note(
        "Backup",
        format!(
            "{}\nContains raw secrets. Keep this file private.",
            output.display()
        ),
    )?;
    outro("Export complete.")?;
    Ok(())
}

pub fn import_config(
    project_dir: &Path,
    input_path: Option<&Path>,
    raw: Option<&str>,
    read_stdin: bool,
    yes: bool,
) -> Result<()> {
    validate_import_source_count(input_path, raw, read_stdin)?;
    let raw_json = import_source_json(input_path, raw, read_stdin)?;
    let backup = parse_backup(&raw_json)?;

    intro("Dokuru Deploy Import")?;
    note("Project", project_dir.display().to_string())?;
    note("Backup", backup_summary(&backup))?;

    if !yes {
        let proceed = confirm("Import backup and overwrite these files?")
            .initial_value(false)
            .interact()?;
        if !proceed {
            outro_cancel("Cancelled")?;
            return Ok(());
        }
    }

    let restored = restore_config_backup(project_dir, &backup)?;
    note("Restored files", restored.join("\n"))?;
    outro("Import complete.")?;
    Ok(())
}

pub fn print_config(project_dir: &Path, show_secrets: bool) -> Result<()> {
    intro("Dokuru Deploy Config")?;
    note("Project", project_dir.display().to_string())?;

    print_plain_file(project_dir, LOCAL_TOML)?;
    print_plain_file(project_dir, SERVER_ENV)?;
    print_plain_file(project_dir, ROOT_ENV)?;

    if show_secrets {
        println!("\nWARNING: showing raw secrets.\n");
        print_plain_file(project_dir, SECRETS_TOML)?;
    } else {
        note("Secrets", secrets_overview(project_dir))?;
        println!("\nUse --show-secrets to view raw secrets.toml.");
    }

    Ok(())
}

fn configure_server_local(project_dir: &Path) -> Result<()> {
    let path = project_dir.join(LOCAL_TOML);
    let fallback = project_dir.join(DEFAULTS_TOML);
    let mut doc = read_toml_document(&path, &fallback)?;

    note("Editing server config", LOCAL_TOML)?;
    let rust_env = prompt_rust_env(&toml_string(&doc, &["app", "rust_env"], "production"))?;
    let rust_log = prompt_rust_log(&toml_string(&doc, &["app", "rust_log"], "info"))?;
    let port = prompt_u16("Server port", toml_u16(&doc, &["server", "port"], 9393))?;
    let cors = prompt_csv(
        "CORS origins",
        &clean_cors_origins(
            toml_string_array(
                &doc,
                &["server", "cors_allowed_origins"],
                production_cors_default(),
            ),
            production_cors_default(),
        ),
    )?;
    let upload_base_url = prompt_string(
        "Upload base URL",
        &toml_string(
            &doc,
            &["upload", "base_url"],
            "https://api.dokuru.rifuki.dev/media",
        ),
    )?;
    let same_site = prompt_same_site(&toml_string(&doc, &["cookie", "same_site"], "none"))?;
    let secure_cookie = confirm("Secure cookies?")
        .initial_value(toml_bool(&doc, &["cookie", "secure"], true))
        .interact()?;
    let bootstrap_enabled = confirm("Enable bootstrap admin?")
        .initial_value(toml_bool(&doc, &["bootstrap", "enabled"], true))
        .interact()?;

    set_toml_string(&mut doc, &["app", "rust_env"], rust_env.clone());
    set_toml_string(&mut doc, &["app", "rust_log"], rust_log.clone());
    set_toml_i64(&mut doc, &["server", "port"], i64::from(port));
    set_toml_string_array(&mut doc, &["server", "cors_allowed_origins"], cors.clone());
    set_toml_string(&mut doc, &["upload", "base_url"], upload_base_url.clone());
    set_toml_string(&mut doc, &["cookie", "same_site"], same_site.clone());
    set_toml_bool(&mut doc, &["cookie", "secure"], secure_cookie);
    set_toml_bool(&mut doc, &["bootstrap", "enabled"], bootstrap_enabled);

    write_toml_document(&path, &doc)?;
    note(
        "Server config updated",
        format!(
            "File:      {LOCAL_TOML}\nRUST_ENV:  {rust_env}\nRUST_LOG:  {rust_log}\nPort:      {port}\nCORS:      {}\nUpload:    {upload_base_url}\nCookie:    same_site={same_site}, secure={secure_cookie}\nBootstrap: {bootstrap_enabled}",
            format_list(&cors),
        ),
    )?;
    Ok(())
}

fn configure_secrets(project_dir: &Path) -> Result<()> {
    let path = project_dir.join(SECRETS_TOML);
    let fallback = project_dir.join(SECRETS_EXAMPLE_TOML);
    let mut doc = read_toml_document(&path, &fallback)
        .unwrap_or_else(|_| toml::Value::Table(toml::map::Map::default()));

    note(
        "Editing secrets",
        "Inputs are hidden. Leave blank to keep current value, or type `clear` to remove.",
    )?;

    update_plain_prompt(
        &mut doc,
        &["database", "url"],
        "Database URL",
        "postgres://dokuru:secret@dokuru-db:5432/dokuru_db",
    )?;
    update_plain_prompt(
        &mut doc,
        &["redis", "url"],
        "Redis URL",
        "redis://dokuru-redis:6379",
    )?;
    update_secret_prompt(&mut doc, &["auth", "access_secret"], "JWT access secret")?;
    update_secret_prompt(&mut doc, &["auth", "refresh_secret"], "JWT refresh secret")?;
    update_secret_prompt(&mut doc, &["email", "resend_api_key"], "Resend API key")?;
    update_plain_prompt(
        &mut doc,
        &["email", "from_email"],
        "From email",
        "noreply@dokuru.rifuki.dev",
    )?;

    write_toml_document(&path, &doc)?;
    note("Secrets updated", secrets_overview(project_dir))?;
    Ok(())
}

fn configure_env_files(project_dir: &Path) -> Result<()> {
    configure_root_env(project_dir)?;
    configure_server_env(project_dir)?;
    Ok(())
}

fn configure_root_env(project_dir: &Path) -> Result<()> {
    let path = project_dir.join(ROOT_ENV);
    let mut env = read_env_file(&path)?;

    note("Compose env", ROOT_ENV)?;
    set_prompted_env(&mut env, "VERSION", "latest")?;
    set_prompted_env(&mut env, "DOKURU_DB_NAME", "dokuru_db")?;
    set_prompted_env(&mut env, "DOKURU_DB_USER", "dokuru")?;
    set_prompted_env(&mut env, "DOKURU_DB_PASSWORD", "secret")?;

    write_env_file(&path, &env)?;
    note("Compose env updated", ROOT_ENV)?;
    Ok(())
}

fn configure_server_env(project_dir: &Path) -> Result<()> {
    let path = project_dir.join(SERVER_ENV);
    let mut env = read_env_file(&path)?;

    note("Server env", SERVER_ENV)?;
    set_prompted_env(&mut env, "RUST_ENV", "production")?;
    set_prompted_env(
        &mut env,
        "DATABASE_URL",
        "postgres://dokuru:secret@localhost:15432/dokuru_db",
    )?;
    set_prompted_env(&mut env, "REDIS_URL", "redis://localhost:16379")?;

    write_env_file(&path, &env)?;
    note("Server env updated", SERVER_ENV)?;
    Ok(())
}

fn set_prompted_env(env: &mut BTreeMap<String, String>, key: &str, fallback: &str) -> Result<()> {
    let current = env.get(key).map_or(fallback, String::as_str);
    let value = prompt_string(key, current)?;
    if value.is_empty() {
        env.remove(key);
    } else {
        env.insert(key.to_string(), value);
    }
    Ok(())
}

fn configure_overview(project_dir: &Path) -> String {
    let local = local_overview(project_dir);
    let secrets = secrets_overview(project_dir);
    format!("{local}\n{secrets}")
}

fn local_overview(project_dir: &Path) -> String {
    let path = project_dir.join(LOCAL_TOML);
    read_toml_document(&path, &path).map_or_else(
        |_| "Server: local.toml not found".to_string(),
        |doc| {
            format!(
                "Server: env={}, log={}, port={}, cors={}, upload={}",
                clean_rust_env(&toml_string(&doc, &["app", "rust_env"], "production")),
                clean_rust_log(&toml_string(&doc, &["app", "rust_log"], "info")),
                toml_u16(&doc, &["server", "port"], 9393),
                format_list(&clean_cors_origins(
                    toml_string_array(
                        &doc,
                        &["server", "cors_allowed_origins"],
                        production_cors_default(),
                    ),
                    production_cors_default(),
                )),
                toml_string(
                    &doc,
                    &["upload", "base_url"],
                    "https://api.dokuru.rifuki.dev/media",
                ),
            )
        },
    )
}

fn secrets_overview(project_dir: &Path) -> String {
    let path = project_dir.join(SECRETS_TOML);
    read_toml_document(&path, &path).map_or_else(
        |_| "Secrets: secrets.toml not found".to_string(),
        |doc| {
            format!(
                "Secrets: database={}, redis={}, access={}, refresh={}, resend={}, from={}",
                connection_status(&toml_string(&doc, &["database", "url"], "")),
                connection_status(&toml_string(&doc, &["redis", "url"], "")),
                secret_status(&toml_string(&doc, &["auth", "access_secret"], "")),
                secret_status(&toml_string(&doc, &["auth", "refresh_secret"], "")),
                secret_status(&toml_string(&doc, &["email", "resend_api_key"], "")),
                toml_string(&doc, &["email", "from_email"], "not set"),
            )
        },
    )
}

fn repair_generated_config(project_dir: &Path) -> Result<Vec<String>> {
    let mut repairs = Vec::new();
    repair_local_toml(project_dir, &mut repairs)?;
    repair_secrets_toml(project_dir, &mut repairs)?;
    repair_compose_override(project_dir, &mut repairs)?;
    Ok(repairs)
}

fn repair_local_toml(project_dir: &Path, repairs: &mut Vec<String>) -> Result<()> {
    let path = project_dir.join(LOCAL_TOML);
    if !path.exists() {
        return Ok(());
    }

    let fallback = project_dir.join(DEFAULTS_TOML);
    let mut doc = read_toml_document(&path, &fallback)?;
    let mut changed = false;

    changed |= repair_toml_string(
        &mut doc,
        &["app", "rust_env"],
        "production",
        is_valid_rust_env,
        repairs,
        "local.toml app.rust_env",
    );
    changed |= repair_toml_string(
        &mut doc,
        &["app", "rust_log"],
        "info",
        is_valid_rust_log,
        repairs,
        "local.toml app.rust_log",
    );
    changed |= repair_toml_port(
        &mut doc,
        &["server", "port"],
        9393,
        repairs,
        "local.toml server.port",
    );
    changed |= repair_toml_cors(
        &mut doc,
        &["server", "cors_allowed_origins"],
        production_cors_default(),
        repairs,
        "local.toml server.cors_allowed_origins",
    );
    changed |= repair_toml_string(
        &mut doc,
        &["cookie", "same_site"],
        "none",
        is_valid_same_site,
        repairs,
        "local.toml cookie.same_site",
    );
    changed |= repair_toml_bool(
        &mut doc,
        &["cookie", "secure"],
        true,
        repairs,
        "local.toml cookie.secure",
    );
    changed |= repair_toml_string(
        &mut doc,
        &["upload", "base_url"],
        "https://api.dokuru.rifuki.dev/media",
        is_valid_http_url,
        repairs,
        "local.toml upload.base_url",
    );

    if changed {
        write_toml_document(&path, &doc)?;
    }

    Ok(())
}

fn repair_secrets_toml(project_dir: &Path, repairs: &mut Vec<String>) -> Result<()> {
    let path = project_dir.join(SECRETS_TOML);
    if !path.exists() {
        return Ok(());
    }

    let mut doc = read_toml_document(&path, &path)?;
    let mut changed = false;

    changed |= remove_bad_secret(
        &mut doc,
        &["database", "url"],
        is_valid_database_url,
        repairs,
        "secrets.toml database.url",
    );
    changed |= remove_bad_secret(
        &mut doc,
        &["redis", "url"],
        is_valid_redis_url,
        repairs,
        "secrets.toml redis.url",
    );
    changed |= repair_generated_secret(
        &mut doc,
        &["auth", "access_secret"],
        repairs,
        "secrets.toml auth.access_secret",
    );
    changed |= repair_generated_secret(
        &mut doc,
        &["auth", "refresh_secret"],
        repairs,
        "secrets.toml auth.refresh_secret",
    );
    changed |= remove_bad_secret(
        &mut doc,
        &["email", "resend_api_key"],
        is_non_empty_clean_secret,
        repairs,
        "secrets.toml email.resend_api_key",
    );
    changed |= repair_toml_string(
        &mut doc,
        &["email", "from_email"],
        "noreply@dokuru.rifuki.dev",
        is_valid_emailish,
        repairs,
        "secrets.toml email.from_email",
    );

    if changed {
        write_toml_document(&path, &doc)?;
    }

    Ok(())
}

fn repair_compose_override(project_dir: &Path, repairs: &mut Vec<String>) -> Result<()> {
    for relative in [COMPOSE_OVERRIDE_YAML, COMPOSE_OVERRIDE_YML] {
        let path = project_dir.join(relative);
        if !path.exists() {
            continue;
        }
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let repaired = content
            .replace(
                "https://raw.githubusercontent.com/rifuki/dokuru/main/install.sh",
                "https://raw.githubusercontent.com/rifuki/dokuru/main/dokuru-agent/install.sh",
            )
            .replace(
                "https://raw.githubusercontent.com/rifuki/dokuru/main/dokuru-deploy/install.sh",
                "https://github.com/rifuki/dokuru/releases/download/latest-deploy/install.sh",
            );
        if repaired != content {
            std::fs::write(&path, repaired)
                .with_context(|| format!("failed to write {}", path.display()))?;
            repairs.push(format!("{relative} installer URLs repaired"));
        }
    }
    Ok(())
}

fn create_config_backup(project_dir: &Path) -> Result<ConfigBackup> {
    let files = collect_backup_paths(project_dir)?
        .into_iter()
        .map(|relative| backup_file(project_dir, relative))
        .collect::<Result<Vec<_>>>()?;

    if files.is_empty() {
        bail!("no generated config/env files found to export; run `dokuru-deploy init` first");
    }

    Ok(ConfigBackup {
        schema_version: 1,
        created_by: format!("dokuru-deploy {}", env!("CARGO_PKG_VERSION")),
        exported_at_unix: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
        source_project: project_dir.display().to_string(),
        files,
    })
}

fn backup_file(project_dir: &Path, relative: String) -> Result<BackupFile> {
    let path = project_dir.join(&relative);
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    Ok(BackupFile {
        path: relative,
        content,
        mode: file_mode(&path)?,
    })
}

fn collect_backup_paths(project_dir: &Path) -> Result<Vec<String>> {
    let mut paths = BTreeSet::new();

    collect_env_files(project_dir, "", &mut paths)?;
    collect_env_files(project_dir, "dokuru-server", &mut paths)?;
    collect_config_files(project_dir, "dokuru-server/config", &mut paths)?;

    for path in [COMPOSE_OVERRIDE_YAML, COMPOSE_OVERRIDE_YML] {
        if project_dir.join(path).exists() {
            paths.insert(path.to_string());
        }
    }

    Ok(paths.into_iter().collect())
}

fn collect_env_files(
    project_dir: &Path,
    relative_dir: &str,
    paths: &mut BTreeSet<String>,
) -> Result<()> {
    collect_matching_files(project_dir, relative_dir, paths, is_env_file_name)
}

fn collect_config_files(
    project_dir: &Path,
    relative_dir: &str,
    paths: &mut BTreeSet<String>,
) -> Result<()> {
    collect_matching_files(project_dir, relative_dir, paths, is_runtime_config_file)
}

fn collect_matching_files(
    project_dir: &Path,
    relative_dir: &str,
    paths: &mut BTreeSet<String>,
    accepts: fn(&str) -> bool,
) -> Result<()> {
    let dir = if relative_dir.is_empty() {
        project_dir.to_path_buf()
    } else {
        project_dir.join(relative_dir)
    };
    if !dir.exists() {
        return Ok(());
    }

    for entry in
        std::fs::read_dir(&dir).with_context(|| format!("failed to read {}", dir.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        if accepts(file_name) {
            paths.insert(join_relative_path(relative_dir, file_name));
        }
    }

    Ok(())
}

fn validate_import_source_count(
    input_path: Option<&Path>,
    raw: Option<&str>,
    read_stdin: bool,
) -> Result<()> {
    let source_count =
        usize::from(input_path.is_some()) + usize::from(raw.is_some()) + usize::from(read_stdin);
    if source_count == 1 {
        Ok(())
    } else {
        bail!("provide exactly one import source: file path, --raw, or --stdin");
    }
}

fn import_source_json(
    input_path: Option<&Path>,
    raw: Option<&str>,
    read_stdin: bool,
) -> Result<String> {
    if let Some(path) = input_path {
        return std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()));
    }

    if let Some(raw) = raw {
        return Ok(raw.to_string());
    }

    if read_stdin {
        let mut json = String::new();
        std::io::stdin().read_to_string(&mut json)?;
        return Ok(json);
    }

    unreachable!("import source count is validated before reading");
}

fn parse_backup(raw_json: &str) -> Result<ConfigBackup> {
    let backup = serde_json::from_str::<ConfigBackup>(raw_json)?;
    validate_config_backup(&backup)?;
    Ok(backup)
}

fn validate_config_backup(backup: &ConfigBackup) -> Result<()> {
    if backup.schema_version != 1 {
        bail!(
            "unsupported backup schema version {}",
            backup.schema_version
        );
    }
    if backup.files.is_empty() {
        bail!("backup does not contain any files");
    }
    for file in &backup.files {
        validate_backup_path(&file.path)?;
    }
    Ok(())
}

fn validate_backup_path(path: &str) -> Result<()> {
    if path.is_empty() || path.contains('\\') {
        bail!("invalid backup path: {path}");
    }

    let path = Path::new(path);
    if path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        bail!("invalid backup path: {}", path.display());
    }

    if !is_allowed_backup_path(path) {
        bail!(
            "backup path is not a supported Dokuru config file: {}",
            path.display()
        );
    }

    Ok(())
}

fn restore_config_backup(project_dir: &Path, backup: &ConfigBackup) -> Result<Vec<String>> {
    let mut restored = Vec::with_capacity(backup.files.len());
    for file in &backup.files {
        let output = project_dir.join(&file.path);
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        std::fs::write(&output, &file.content)
            .with_context(|| format!("failed to write {}", output.display()))?;
        set_file_mode(&output, file.mode)?;
        restored.push(file.path.clone());
    }
    Ok(restored)
}

fn backup_summary(backup: &ConfigBackup) -> String {
    format!(
        "Created by: {}\nSource:     {}\nFiles:\n{}",
        backup.created_by,
        backup.source_project,
        backup
            .files
            .iter()
            .map(|file| format!("  {}", file.path))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

fn print_plain_file(project_dir: &Path, relative_path: &str) -> Result<()> {
    let path = project_dir.join(relative_path);
    println!("\n{relative_path}\n");
    match std::fs::read_to_string(&path) {
        Ok(content) => println!("{content}"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => println!("  File not found"),
        Err(error) => {
            return Err(error).with_context(|| format!("failed to read {}", path.display()));
        }
    }
    Ok(())
}

fn update_plain_prompt(
    doc: &mut toml::Value,
    path: &[&str],
    label: &str,
    fallback: &str,
) -> Result<()> {
    let value = prompt_string(label, &toml_string(doc, path, fallback))?;
    if value.is_empty() {
        remove_toml_key(doc, path);
    } else {
        set_toml_string(doc, path, value);
    }
    Ok(())
}

fn update_secret_prompt(doc: &mut toml::Value, path: &[&str], label: &str) -> Result<()> {
    let raw_current = toml_string(doc, path, "");
    let current = clean_secret_prompt_value(&raw_current);
    if raw_current != current {
        remove_toml_key(doc, path);
    }
    println!("  {label}: {}", secret_status(&current));

    let next = password(format!("{label} (blank keep, `clear` remove)"))
        .allow_empty()
        .interact()?;
    let next = next.trim();

    if next.is_empty() {
        return Ok(());
    }

    if next == "clear" {
        remove_toml_key(doc, path);
    } else {
        set_toml_string(doc, path, next.to_string());
    }

    Ok(())
}

fn prompt_rust_env(current: &str) -> Result<String> {
    let current = clean_rust_env(current);
    select("RUST_ENV")
        .item("production", "production", "production runtime")
        .item("development", "development", "local/debug runtime")
        .initial_value(current.as_str())
        .interact()
        .map(str::to_string)
        .map_err(Into::into)
}

fn prompt_rust_log(current: &str) -> Result<String> {
    let current = clean_rust_log(current);
    select("RUST_LOG")
        .item("info", "info", "normal production logs")
        .item("debug", "debug", "verbose deployment logs")
        .item("warn", "warn", "warnings and errors")
        .item("error", "error", "errors only")
        .item("trace", "trace", "very verbose diagnostics")
        .initial_value(current.as_str())
        .interact()
        .map(str::to_string)
        .map_err(Into::into)
}

fn prompt_same_site(current: &str) -> Result<String> {
    let current = clean_same_site(current);
    select("Cookie same_site")
        .item("none", "none", "cross-subdomain auth cookie")
        .item("lax", "lax", "local cross-port development")
        .item("strict", "strict", "same-origin only")
        .initial_value(current.as_str())
        .interact()
        .map(str::to_string)
        .map_err(Into::into)
}

fn prompt_string(label: &str, current: &str) -> Result<String> {
    let current = clean_prompt_default(current);
    let value: String = input(label).default_input(&current).interact()?;
    Ok(value.trim().to_string())
}

fn prompt_u16(label: &str, current: u16) -> Result<u16> {
    let value: String = input(label)
        .default_input(&current.to_string())
        .interact()?;
    value
        .trim()
        .parse::<u16>()
        .with_context(|| format!("{label} must be a valid port number"))
}

fn prompt_csv(label: &str, current: &[String]) -> Result<Vec<String>> {
    let value: String = input(label)
        .default_input(&format_list(current))
        .interact()?;
    Ok(value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn clean_prompt_default(value: &str) -> String {
    value.lines().next().unwrap_or_default().trim().to_string()
}

fn clean_rust_env(value: &str) -> String {
    let value = value.trim();
    if is_valid_rust_env(value) {
        value.to_string()
    } else {
        "production".to_string()
    }
}

fn is_valid_rust_env(value: &str) -> bool {
    matches!(value, "production" | "development")
}

fn clean_rust_log(value: &str) -> String {
    let value = value.trim();
    if is_valid_rust_log(value) {
        value.to_string()
    } else {
        "info".to_string()
    }
}

fn is_valid_rust_log(value: &str) -> bool {
    matches!(value, "trace" | "debug" | "info" | "warn" | "error")
}

fn clean_same_site(value: &str) -> String {
    let value = value.trim();
    if is_valid_same_site(value) {
        value.to_string()
    } else {
        "none".to_string()
    }
}

fn is_valid_same_site(value: &str) -> bool {
    matches!(value, "strict" | "lax" | "none")
}

fn clean_cors_origins(values: Vec<String>, fallback: &[&str]) -> Vec<String> {
    if !values.iter().all(|origin| is_valid_http_origin(origin)) {
        return fallback.iter().map(|value| (*value).to_string()).collect();
    }

    let mut values = values;
    for origin in fallback {
        if !values.iter().any(|value| value == origin) {
            values.push((*origin).to_string());
        }
    }
    values
}

fn is_valid_http_origin(value: &str) -> bool {
    let value = value.trim();
    value == "*" || is_valid_http_url(value)
}

fn is_valid_http_url(value: &str) -> bool {
    let value = value.trim();
    value.starts_with("https://") || value.starts_with("http://")
}

fn is_valid_database_url(value: &str) -> bool {
    let value = value.trim();
    (value.starts_with("postgres://") || value.starts_with("postgresql://"))
        && !is_bad_secret_value(value)
}

fn is_valid_redis_url(value: &str) -> bool {
    let value = value.trim();
    value.starts_with("redis://") && !is_bad_secret_value(value)
}

fn is_non_empty_clean_secret(value: &str) -> bool {
    !value.trim().is_empty() && !is_bad_secret_value(value)
}

fn is_valid_emailish(value: &str) -> bool {
    let value = value.trim();
    value.contains('@') && !is_bad_secret_value(value)
}

fn format_list(values: &[String]) -> String {
    values.join(",")
}

const fn production_cors_default() -> &'static [&'static str] {
    &["https://app.dokuru.rifuki.dev"]
}

fn secret_status(secret: &str) -> String {
    if is_bad_secret_value(secret) || secret.trim().is_empty() {
        "not set".to_string()
    } else {
        format!("set ({})", secret_preview(secret))
    }
}

fn connection_status(value: &str) -> String {
    if is_bad_secret_value(value) || value.trim().is_empty() {
        "not set".to_string()
    } else {
        "set".to_string()
    }
}

fn secret_preview(secret: &str) -> String {
    if secret.len() >= 8 {
        format!("{}....", &secret[..8])
    } else {
        "********".to_string()
    }
}

fn clean_secret_prompt_value(value: &str) -> String {
    if is_bad_secret_value(value) {
        String::new()
    } else {
        value.trim().to_string()
    }
}

fn is_bad_secret_value(value: &str) -> bool {
    let value = value.trim();
    value.contains("[[")
        || value.contains(" = ")
        || value.contains('\n')
        || value.starts_with("your_")
        || value.ends_with("_here")
}

fn read_toml_document(path: &Path, fallback: &Path) -> Result<toml::Value> {
    let source = if path.exists() { path } else { fallback };
    let content = std::fs::read_to_string(source)
        .with_context(|| format!("failed to read {}", source.display()))?;
    Ok(content.parse::<toml::Value>()?)
}

fn write_toml_document(path: &Path, doc: &toml::Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, toml::to_string_pretty(doc)?)?;
    Ok(())
}

fn toml_string(doc: &toml::Value, path: &[&str], fallback: &str) -> String {
    toml_get(doc, path)
        .and_then(toml::Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn toml_bool(doc: &toml::Value, path: &[&str], fallback: bool) -> bool {
    toml_get(doc, path)
        .and_then(toml::Value::as_bool)
        .unwrap_or(fallback)
}

fn toml_u16(doc: &toml::Value, path: &[&str], fallback: u16) -> u16 {
    toml_get(doc, path)
        .and_then(toml::Value::as_integer)
        .and_then(|value| u16::try_from(value).ok())
        .unwrap_or(fallback)
}

fn toml_string_array(doc: &toml::Value, path: &[&str], fallback: &[&str]) -> Vec<String> {
    toml_get(doc, path)
        .and_then(toml::Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(toml::Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|values| !values.is_empty())
        .unwrap_or_else(|| fallback.iter().map(|value| (*value).to_string()).collect())
}

fn toml_get<'a>(doc: &'a toml::Value, path: &[&str]) -> Option<&'a toml::Value> {
    let mut current = doc;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn set_toml_string(doc: &mut toml::Value, path: &[&str], value: String) {
    set_toml_value(doc, path, toml::Value::String(value));
}

fn set_toml_bool(doc: &mut toml::Value, path: &[&str], value: bool) {
    set_toml_value(doc, path, toml::Value::Boolean(value));
}

fn set_toml_i64(doc: &mut toml::Value, path: &[&str], value: i64) {
    set_toml_value(doc, path, toml::Value::Integer(value));
}

fn set_toml_string_array(doc: &mut toml::Value, path: &[&str], values: Vec<String>) {
    set_toml_value(
        doc,
        path,
        toml::Value::Array(values.into_iter().map(toml::Value::String).collect()),
    );
}

fn set_toml_value(doc: &mut toml::Value, path: &[&str], value: toml::Value) {
    if path.is_empty() {
        return;
    }

    let mut current = doc;
    for segment in &path[..path.len() - 1] {
        let table = current
            .as_table_mut()
            .expect("configuration root must be a TOML table");
        current = table
            .entry((*segment).to_string())
            .or_insert_with(|| toml::Value::Table(toml::map::Map::default()));
    }

    current
        .as_table_mut()
        .expect("configuration section must be a TOML table")
        .insert(path[path.len() - 1].to_string(), value);
}

fn remove_toml_key(doc: &mut toml::Value, path: &[&str]) {
    if path.is_empty() {
        return;
    }

    let mut current = doc;
    for segment in &path[..path.len() - 1] {
        let Some(next) = current.get_mut(*segment) else {
            return;
        };
        current = next;
    }

    if let Some(table) = current.as_table_mut() {
        table.remove(path[path.len() - 1]);
    }
}

fn repair_toml_string(
    doc: &mut toml::Value,
    path: &[&str],
    fallback: &str,
    is_valid: fn(&str) -> bool,
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    let current = toml_string(doc, path, fallback);
    if is_valid(&current) {
        return false;
    }

    set_toml_string(doc, path, fallback.to_string());
    repairs.push(format!("{label} -> {fallback}"));
    true
}

fn repair_toml_bool(
    doc: &mut toml::Value,
    path: &[&str],
    fallback: bool,
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    if toml_get(doc, path).and_then(toml::Value::as_bool).is_some() {
        return false;
    }

    set_toml_bool(doc, path, fallback);
    repairs.push(format!("{label} -> {fallback}"));
    true
}

fn repair_toml_port(
    doc: &mut toml::Value,
    path: &[&str],
    fallback: u16,
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    if toml_get(doc, path)
        .and_then(toml::Value::as_integer)
        .and_then(|value| u16::try_from(value).ok())
        .is_some()
    {
        return false;
    }

    set_toml_i64(doc, path, i64::from(fallback));
    repairs.push(format!("{label} -> {fallback}"));
    true
}

fn repair_toml_cors(
    doc: &mut toml::Value,
    path: &[&str],
    fallback: &[&str],
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    let current = toml_string_array(doc, path, fallback);
    let repaired = clean_cors_origins(current.clone(), fallback);
    if current == repaired {
        return false;
    }

    set_toml_string_array(doc, path, repaired);
    repairs.push(format!("{label} -> {}", fallback.join(",")));
    true
}

fn remove_bad_secret(
    doc: &mut toml::Value,
    path: &[&str],
    is_valid: fn(&str) -> bool,
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    let current = toml_string(doc, path, "");
    if current.trim().is_empty() || is_valid(&current) {
        return false;
    }

    remove_toml_key(doc, path);
    repairs.push(format!(
        "{label} removed; run `dokuru-deploy configure` to set it"
    ));
    true
}

fn repair_generated_secret(
    doc: &mut toml::Value,
    path: &[&str],
    repairs: &mut Vec<String>,
    label: &str,
) -> bool {
    let current = toml_string(doc, path, "");
    if current.len() >= 32 && !is_bad_secret_value(&current) {
        return false;
    }

    set_toml_string(doc, path, generate_secret(64));
    repairs.push(format!("{label} regenerated"));
    true
}

fn read_env_file(path: &Path) -> Result<BTreeMap<String, String>> {
    let mut values = BTreeMap::new();
    if !path.exists() {
        return Ok(values);
    }

    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    for line in content.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(values)
}

fn write_env_file(path: &Path, values: &BTreeMap<String, String>) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let content = values
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(path, format!("{content}\n"))?;
    Ok(())
}

fn join_relative_path(relative_dir: &str, file_name: &str) -> String {
    if relative_dir.is_empty() {
        file_name.to_string()
    } else {
        format!("{relative_dir}/{file_name}")
    }
}

fn is_allowed_backup_path(path: &Path) -> bool {
    let parts = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>();

    match parts.as_slice() {
        [file_name] => is_env_file_name(file_name) || is_compose_override_file(file_name),
        ["dokuru-server", file_name] => is_env_file_name(file_name),
        ["dokuru-server", "config", file_name] => is_runtime_config_file(file_name),
        _ => false,
    }
}

fn is_env_file_name(file_name: &str) -> bool {
    file_name == ".env" || (file_name.starts_with(".env.") && file_name != ".env.example")
}

fn is_compose_override_file(file_name: &str) -> bool {
    matches!(
        file_name,
        "docker-compose.override.yml" | "docker-compose.override.yaml"
    )
}

fn is_runtime_config_file(file_name: &str) -> bool {
    Path::new(file_name)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("toml"))
        && !matches!(
            file_name,
            "defaults.toml"
                | "default.toml"
                | "local.toml.example"
                | "secrets.toml.example"
                | "secret.toml.example"
        )
}

#[cfg(unix)]
fn file_mode(path: &Path) -> Result<Option<u32>> {
    use std::os::unix::fs::PermissionsExt;

    Ok(Some(std::fs::metadata(path)?.permissions().mode() & 0o777))
}

#[cfg(not(unix))]
fn file_mode(_path: &Path) -> Result<Option<u32>> {
    Ok(None)
}

#[cfg(unix)]
fn set_file_mode(path: &Path, mode: Option<u32>) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    if let Some(mode) = mode {
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(mode);
        std::fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_file_mode(_path: &Path, _mode: Option<u32>) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        BackupFile, ConfigBackup, create_config_backup, repair_generated_config,
        restore_config_backup, toml_get, validate_config_backup,
    };

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
                "dokuru-deploy-runtime-{name}-{}-{unique}",
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
    fn repair_generated_config_cleans_corrupted_values() {
        let temp = TempDir::new("repair");
        fs::create_dir_all(temp.path().join("dokuru-server/config"))
            .expect("failed to create config dir");
        fs::write(
            temp.path().join("dokuru-server/config/local.toml"),
            r#"
[app]
rust_env = 'model = "invalid"'
rust_log = "[[bad]]"

[server]
port = "not-a-port"
cors_allowed_origins = ["[[provider.providers]]"]

[cookie]
same_site = "sideways"
secure = "false"

[upload]
base_url = "[[bad]]"
"#,
        )
        .expect("failed to write local toml");
        fs::write(
            temp.path().join("dokuru-server/config/defaults.toml"),
            "[app]\nrust_env = \"development\"\nrust_log = \"debug\"\n",
        )
        .expect("failed to write defaults toml");
        fs::write(
            temp.path().join("dokuru-server/config/secrets.toml"),
            r#"
[database]
url = 'name = "groq"'

[redis]
url = "[[provider.providers]]"

[auth]
access_secret = "short"
refresh_secret = "your_refresh_secret_here"

[email]
resend_api_key = "your_resend_api_key_here"
from_email = "[[bad]]"
"#,
        )
        .expect("failed to write secrets toml");

        let repairs = repair_generated_config(temp.path()).expect("repair should succeed");
        assert!(!repairs.is_empty());

        let local_doc = fs::read_to_string(temp.path().join("dokuru-server/config/local.toml"))
            .expect("failed to read local toml")
            .parse::<toml::Value>()
            .expect("failed to parse local toml");
        assert_eq!(local_doc["app"]["rust_env"].as_str(), Some("production"));
        assert_eq!(local_doc["app"]["rust_log"].as_str(), Some("info"));
        assert_eq!(local_doc["server"]["port"].as_integer(), Some(9393));
        assert_eq!(local_doc["cookie"]["same_site"].as_str(), Some("none"));
        assert_eq!(local_doc["cookie"]["secure"].as_bool(), Some(true));

        let secrets_doc = fs::read_to_string(temp.path().join("dokuru-server/config/secrets.toml"))
            .expect("failed to read secrets toml")
            .parse::<toml::Value>()
            .expect("failed to parse secrets toml");
        assert!(toml_get(&secrets_doc, &["database", "url"]).is_none());
        assert!(toml_get(&secrets_doc, &["redis", "url"]).is_none());
        assert!(
            secrets_doc["auth"]["access_secret"]
                .as_str()
                .is_some_and(|value| value.len() >= 32)
        );
        assert!(toml_get(&secrets_doc, &["email", "resend_api_key"]).is_none());
        assert_eq!(
            secrets_doc["email"]["from_email"].as_str(),
            Some("noreply@dokuru.rifuki.dev")
        );
    }

    #[test]
    fn config_backup_roundtrips_runtime_files() {
        let source = TempDir::new("backup-source");
        let target = TempDir::new("backup-target");

        for dir in [
            source.path().join("dokuru-server/config"),
            target.path().join("dokuru-server/config"),
        ] {
            fs::create_dir_all(dir).expect("failed to create config dir");
        }

        let files = [
            (".env", "VERSION=latest\n"),
            (".env.local", "LOCAL_ONLY=1\n"),
            (
                "docker-compose.override.yaml",
                "services:\n  dokuru-server: {}\n",
            ),
            ("dokuru-server/.env", "PORT=9393\n"),
            (
                "dokuru-server/config/local.toml",
                "[app]\nrust_env = \"production\"\n",
            ),
            (
                "dokuru-server/config/secrets.toml",
                "[auth]\naccess_secret = \"secret\"\n",
            ),
            (
                "dokuru-server/config/defaults.toml",
                "[server]\nport = 9393\n",
            ),
            (
                "dokuru-server/config/secrets.toml.example",
                "[auth]\naccess_secret = \"example\"\n",
            ),
        ];

        for (path, content) in files {
            fs::write(source.path().join(path), content).expect("failed to write source file");
        }

        let backup = create_config_backup(source.path()).expect("backup should succeed");
        let backed_up_paths = backup
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert!(backed_up_paths.contains(&".env"));
        assert!(backed_up_paths.contains(&".env.local"));
        assert!(backed_up_paths.contains(&"docker-compose.override.yaml"));
        assert!(backed_up_paths.contains(&"dokuru-server/.env"));
        assert!(backed_up_paths.contains(&"dokuru-server/config/local.toml"));
        assert!(backed_up_paths.contains(&"dokuru-server/config/secrets.toml"));
        assert!(!backed_up_paths.contains(&"dokuru-server/config/defaults.toml"));
        assert!(!backed_up_paths.contains(&"dokuru-server/config/secrets.toml.example"));

        let restored = restore_config_backup(target.path(), &backup).expect("restore should work");
        assert_eq!(restored.len(), backed_up_paths.len());
        for file in backup.files {
            assert_eq!(
                fs::read_to_string(target.path().join(&file.path))
                    .expect("failed to read restored file"),
                file.content
            );
        }
    }

    #[test]
    fn config_backup_rejects_paths_outside_project() {
        let backup = ConfigBackup {
            schema_version: 1,
            created_by: "test".to_string(),
            exported_at_unix: 0,
            source_project: "/tmp/source".to_string(),
            files: vec![BackupFile {
                path: "../secret.toml".to_string(),
                content: "nope".to_string(),
                mode: None,
            }],
        };

        assert!(validate_config_backup(&backup).is_err());
    }
}
