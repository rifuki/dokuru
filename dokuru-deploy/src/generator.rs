use crate::config::*;
use anyhow::Result;
use std::fs;
use std::path::Path;

pub fn generate_local_toml(config: &DeployConfig, output_path: &Path) -> Result<()> {
    let local_toml = LocalToml {
        app: AppConfig {
            rust_env: "production".to_string(),
            rust_log: "info".to_string(),
        },
        server: ServerConfig {
            cors_allowed_origins: config.cors_origins(),
        },
        bootstrap: BootstrapConfig { enabled: true },
        upload: UploadConfig {
            base_url: config.upload_base_url(),
        },
        cookie: CookieConfig {
            same_site: "none".to_string(),
            secure: true,
        },
    };

    let toml_string = toml::to_string_pretty(&local_toml)?;
    fs::write(output_path, toml_string)?;
    Ok(())
}

pub fn generate_secrets_toml(config: &DeployConfig, output_path: &Path) -> Result<()> {
    let secrets_toml = SecretsToml {
        database: DatabaseConfig {
            url: config.database_url(),
        },
        redis: RedisConfig {
            url: "redis://dokuru-redis:6379".to_string(),
        },
        auth: AuthConfig {
            access_secret: config.jwt_access_secret.clone(),
            refresh_secret: config.jwt_refresh_secret.clone(),
        },
        email: EmailConfig {
            resend_api_key: config.resend_api_key.clone(),
            from_email: format!("noreply@{}", config.base_domain),
        },
    };

    let toml_string = toml::to_string_pretty(&secrets_toml)?;
    fs::write(output_path, toml_string)?;
    Ok(())
}

pub fn generate_docker_compose_override(config: &DeployConfig, output_path: &Path, strategy: &str) -> Result<()> {
    let mut yaml = format!(
        r#"services:
  dokuru-db:
    environment:
      POSTGRES_DB: {}
      POSTGRES_USER: {}
      POSTGRES_PASSWORD: {}

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
        config.api_domain,
    );

    // Add www service config (only if on VPS)
    match strategy {
        "full-vps" | "landing-vercel" => {
            yaml.push_str(&format!(
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
            ));
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

    // Add landing service config (only if on VPS)
    match strategy {
        "full-vps" | "app-vercel" => {
            yaml.push_str(&format!(
                r#"
  dokuru-landing:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dokuru-landing.rule=Host(`{}`)"
      - "traefik.http.routers.dokuru-landing.entrypoints=websecure"
      - "traefik.http.routers.dokuru-landing.tls.certresolver=letsencrypt"
      - "traefik.http.services.dokuru-landing.loadbalancer.server.port=80"
      # Redirect /install to GitHub raw
      - "traefik.http.middlewares.install-redirect.redirectregex.regex=^https?://([^/]+)/install(.sh)?$$"
      - "traefik.http.middlewares.install-redirect.redirectregex.replacement=https://raw.githubusercontent.com/rifuki/dokuru/main/install.sh"
      # Redirect /deploy to GitHub raw
      - "traefik.http.middlewares.deploy-redirect.redirectregex.regex=^https?://([^/]+)/deploy(.sh)?$$"
      - "traefik.http.middlewares.deploy-redirect.redirectregex.replacement=https://raw.githubusercontent.com/rifuki/dokuru/main/dokuru-deploy/install.sh"
      # Apply middlewares
      - "traefik.http.routers.dokuru-landing.middlewares=install-redirect,deploy-redirect"
"#,
                config.landing_domain
            ));
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

    fs::write(output_path, yaml)?;
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
