use crate::config::DeployConfig;
use anyhow::{Context, Result};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

pub fn generate_local_toml(config: &DeployConfig, output_path: &Path) -> Result<()> {
    let example_path = output_path
        .parent()
        .context("local.toml output path must have a parent directory")?
        .join("local.toml.example");
    let example_content = fs::read_to_string(&example_path)
        .with_context(|| format!("failed to read {}", example_path.display()))?;
    let content = render_local_toml(&example_content, config)?;
    fs::write(output_path, content)?;
    Ok(())
}

fn render_local_toml(example_content: &str, config: &DeployConfig) -> Result<String> {
    let mut doc: toml::Value = toml::from_str(example_content)?;

    table_mut(&mut doc, "app")?.insert(
        "rust_env".to_string(),
        toml::Value::String("production".to_string()),
    );
    table_mut(&mut doc, "app")?.insert(
        "rust_log".to_string(),
        toml::Value::String("info".to_string()),
    );
    table_mut(&mut doc, "server")?.insert(
        "cors_allowed_origins".to_string(),
        toml::Value::Array(
            config
                .cors_origins()
                .into_iter()
                .map(toml::Value::String)
                .collect(),
        ),
    );
    table_mut(&mut doc, "bootstrap")?.insert("enabled".to_string(), toml::Value::Boolean(true));
    table_mut(&mut doc, "upload")?.insert(
        "base_url".to_string(),
        toml::Value::String(config.upload_base_url()),
    );
    table_mut(&mut doc, "cookie")?.insert(
        "same_site".to_string(),
        toml::Value::String("none".to_string()),
    );
    table_mut(&mut doc, "cookie")?.insert("secure".to_string(), toml::Value::Boolean(true));

    Ok(toml::to_string_pretty(&doc)?)
}

fn table_mut<'a>(
    doc: &'a mut toml::Value,
    table_name: &str,
) -> Result<&'a mut toml::map::Map<String, toml::Value>> {
    doc.get_mut(table_name)
        .and_then(toml::Value::as_table_mut)
        .with_context(|| format!("TOML example is missing [{table_name}] table"))
}

pub fn generate_secrets_toml(config: &DeployConfig, output_path: &Path) -> Result<()> {
    let example_path = output_path
        .parent()
        .context("secrets.toml output path must have a parent directory")?
        .join("secrets.toml.example");
    let example_content = fs::read_to_string(&example_path)
        .with_context(|| format!("failed to read {}", example_path.display()))?;
    let content = render_secrets_toml(&example_content, config)?;
    fs::write(output_path, content)?;
    Ok(())
}

fn render_secrets_toml(example_content: &str, config: &DeployConfig) -> Result<String> {
    let mut doc: toml::Value = toml::from_str(example_content)?;

    table_mut(&mut doc, "database")?.insert(
        "url".to_string(),
        toml::Value::String(config.database_url()),
    );
    table_mut(&mut doc, "redis")?.insert(
        "url".to_string(),
        toml::Value::String("redis://dokuru-redis:6379".to_string()),
    );
    table_mut(&mut doc, "auth")?.insert(
        "access_secret".to_string(),
        toml::Value::String(config.jwt_access_secret.clone()),
    );
    table_mut(&mut doc, "auth")?.insert(
        "refresh_secret".to_string(),
        toml::Value::String(config.jwt_refresh_secret.clone()),
    );
    table_mut(&mut doc, "email")?.insert(
        "resend_api_key".to_string(),
        toml::Value::String(config.resend_api_key.clone()),
    );
    table_mut(&mut doc, "email")?.insert(
        "from_email".to_string(),
        toml::Value::String(format!("noreply@{}", config.base_domain)),
    );

    Ok(toml::to_string_pretty(&doc)?)
}

pub fn generate_docker_compose_override(
    config: &DeployConfig,
    output_path: &Path,
    strategy: &str,
) -> Result<()> {
    let mut yaml = base_compose_override(config);
    append_www_override(&mut yaml, config, strategy)?;
    append_landing_override(&mut yaml, config, strategy)?;

    fs::write(output_path, yaml)?;
    Ok(())
}

fn base_compose_override(config: &DeployConfig) -> String {
    format!(
        r#"services:
  dokuru-db:
    environment:
      POSTGRES_DB: {}
      POSTGRES_USER: {}
      POSTGRES_PASSWORD: {}

  dokuru-server-migrate:
    environment:
      DATABASE_URL: {}

  dokuru-server:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dokuru-api.rule=Host(`{}`)"
      - "traefik.http.routers.dokuru-api.entrypoints=websecure"
      - "traefik.http.routers.dokuru-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.dokuru-server.loadbalancer.server.port=9393"
"#,
        config.db_name,
        config.db_user,
        config.db_password,
        config.database_url(),
        config.api_domain,
    )
}

fn append_www_override(yaml: &mut String, config: &DeployConfig, strategy: &str) -> Result<()> {
    match strategy {
        "full-vps" | "landing-vercel" => {
            write!(
                yaml,
                r#"
  dokuru-www:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dokuru-web.rule=Host(`{}`)"
      - "traefik.http.routers.dokuru-web.entrypoints=websecure"
      - "traefik.http.routers.dokuru-web.tls.certresolver=letsencrypt"
      - "traefik.http.services.dokuru-web.loadbalancer.server.port=80"
"#,
                config.www_domain
            )?;
        }
        "app-vercel" | "both-vercel" => {
            yaml.push_str(
                r#"
  dokuru-www:
    profiles: ["disabled"]  # Deployed on Vercel
"#,
            );
        }
        _ => {}
    }

    Ok(())
}

fn append_landing_override(yaml: &mut String, config: &DeployConfig, strategy: &str) -> Result<()> {
    match strategy {
        "full-vps" | "app-vercel" => {
            write!(
                yaml,
                r#"
  dokuru-landing:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dokuru-landing.rule=Host(`{}`)"
      - "traefik.http.routers.dokuru-landing.entrypoints=websecure"
      - "traefik.http.routers.dokuru-landing.tls.certresolver=letsencrypt"
      - "traefik.http.services.dokuru-landing.loadbalancer.server.port=80"
      # Redirect /install to the Dokuru agent release installer
      - "traefik.http.middlewares.install-redirect.redirectregex.regex=^https?://([^/]+)/install(.sh)?$$"
      - "traefik.http.middlewares.install-redirect.redirectregex.replacement=https://github.com/rifuki/dokuru/releases/download/latest/install.sh"
      # Redirect /deploy to the Dokuru Deploy release installer
      - "traefik.http.middlewares.deploy-redirect.redirectregex.regex=^https?://([^/]+)/deploy(.sh)?$$"
      - "traefik.http.middlewares.deploy-redirect.redirectregex.replacement=https://github.com/rifuki/dokuru/releases/download/latest-deploy/install.sh"
      # Apply middlewares
      - "traefik.http.routers.dokuru-landing.middlewares=install-redirect,deploy-redirect"
"#,
                config.landing_domain
            )?;
        }
        "landing-vercel" | "both-vercel" => {
            yaml.push_str(
                r#"
  dokuru-landing:
    profiles: ["disabled"]  # Deployed on Vercel
"#,
            );
        }
        _ => {}
    }

    Ok(())
}

pub fn generate_secret(length: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub fn generate_env_file(output_path: &Path) -> Result<()> {
    fs::write(output_path, render_env_file())?;
    Ok(())
}

const fn render_env_file() -> &'static str {
    "# Optional service-local override example.\n\
     # Runtime config lives in config/*.toml. Prefer local.toml and secrets.toml.\n\
     # Nested overrides use DOKURU__SECTION__KEY, e.g. DOKURU__DATABASE__URL.\n\
     # PORT is also supported for independent service hosts like Render.\n\
     \n\
     PORT=9393\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use toml::Value as TomlValue;

    fn config() -> DeployConfig {
        DeployConfig {
            base_domain: "dokuru.rifuki.dev".to_string(),
            landing_domain: "dokuru.rifuki.dev".to_string(),
            www_domain: "app.dokuru.rifuki.dev".to_string(),
            api_domain: "api.dokuru.rifuki.dev".to_string(),
            db_name: "dokuru_db".to_string(),
            db_user: "dokuru".to_string(),
            db_password: "secret".to_string(),
            jwt_access_secret: "access-secret".to_string(),
            jwt_refresh_secret: "refresh-secret".to_string(),
            resend_api_key: "re_test".to_string(),
        }
    }

    fn local_example() -> &'static str {
        r#"
[app]
rust_env = "development"
rust_log = "trace"

[server]
cors_allowed_origins = ["http://localhost:5173"]

[bootstrap]
enabled = false

[upload]
base_url = "http://localhost:9393/media"

[cookie]
same_site = "lax"
secure = false
"#
    }

    fn secrets_example() -> &'static str {
        r#"
[database]
url = "postgres://dokuru:secret@localhost:5432/dokuru_db"

[redis]
url = "redis://localhost:6379"

[auth]
access_secret = "change-me-access-secret-min-32-chars"
refresh_secret = "change-me-refresh-secret-min-32-chars"

[email]
resend_api_key = "your_resend_api_key_here"
from_email = "noreply@dokuru.rifuki.dev"
"#
    }

    #[test]
    fn local_toml_is_rendered_from_example() {
        let content = render_local_toml(local_example(), &config()).unwrap();
        let doc = content.parse::<TomlValue>().unwrap();

        assert_eq!(doc["app"]["rust_env"].as_str(), Some("production"));
        assert_eq!(doc["app"]["rust_log"].as_str(), Some("info"));
        assert_eq!(
            doc["server"]["cors_allowed_origins"]
                .as_array()
                .unwrap()
                .iter()
                .map(TomlValue::as_str)
                .collect::<Vec<_>>(),
            [Some("https://app.dokuru.rifuki.dev")]
        );
        assert_eq!(
            doc["upload"]["base_url"].as_str(),
            Some("https://api.dokuru.rifuki.dev/media")
        );
        assert_eq!(doc["cookie"]["same_site"].as_str(), Some("none"));
        assert_eq!(doc["cookie"]["secure"].as_bool(), Some(true));
    }

    #[test]
    fn secrets_toml_is_rendered_from_example() {
        let content = render_secrets_toml(secrets_example(), &config()).unwrap();
        let doc = content.parse::<TomlValue>().unwrap();

        assert_eq!(
            doc["database"]["url"].as_str(),
            Some("postgres://dokuru:secret@dokuru-db:5432/dokuru_db")
        );
        assert_eq!(
            doc["redis"]["url"].as_str(),
            Some("redis://dokuru-redis:6379")
        );
        assert_eq!(doc["auth"]["access_secret"].as_str(), Some("access-secret"));
        assert_eq!(
            doc["auth"]["refresh_secret"].as_str(),
            Some("refresh-secret")
        );
        assert_eq!(doc["email"]["resend_api_key"].as_str(), Some("re_test"));
        assert_eq!(
            doc["email"]["from_email"].as_str(),
            Some("noreply@dokuru.rifuki.dev")
        );
    }

    #[test]
    fn env_file_only_contains_port_alias() {
        assert_eq!(
            render_env_file(),
            "# Optional service-local override example.\n# Runtime config lives in config/*.toml. Prefer local.toml and secrets.toml.\n# Nested overrides use DOKURU__SECTION__KEY, e.g. DOKURU__DATABASE__URL.\n# PORT is also supported for independent service hosts like Render.\n\nPORT=9393\n"
        );
    }
}
