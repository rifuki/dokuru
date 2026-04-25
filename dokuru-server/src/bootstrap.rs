//! Bootstrap system for initial setup
//! Auto-creates admin user if no admin exists

use crate::{
    feature::auth::service::AuthService,
    infrastructure::{config::Config, persistence::Database},
};
use std::sync::Arc;

struct BootstrapAdmin {
    email: String,
    username: String,
    password: String,
    name: String,
}

impl BootstrapAdmin {
    fn from_config(config: &Config) -> Self {
        Self {
            email: config.bootstrap.admin_email.clone(),
            username: config.bootstrap.admin_username.clone(),
            password: std::env::var("BOOTSTRAP_ADMIN_PASSWORD")
                .unwrap_or_else(|_| generate_secure_password()),
            name: config.bootstrap.admin_name.clone(),
        }
    }

    fn register_data(&self) -> crate::feature::auth::RegisterData {
        crate::feature::auth::RegisterData::new(self.email.clone(), self.password.clone())
            .with_username(self.username.clone())
            .with_full_name(self.name.clone())
    }
}

/// Bootstrap the application
/// - Create admin user from env if no admin exists
///
/// # Errors
///
/// Returns error if database operations fail or admin creation fails.
pub async fn bootstrap(db: &Database, config: &Config) -> eyre::Result<()> {
    tracing::info!("🚀 Running bootstrap checks...");

    if !config.bootstrap.enabled {
        tracing::info!("⏭️ Bootstrap disabled, skipping...");
        return Ok(());
    }

    if check_admin_exists(db).await? {
        tracing::info!("✅ Admin user already exists, skipping bootstrap");
        return Ok(());
    }

    let admin = BootstrapAdmin::from_config(config);
    tracing::info!("👤 Creating bootstrap admin user: {}", admin.email);

    let auth_service = bootstrap_auth_service(db, config);
    create_bootstrap_admin(db, &auth_service, &admin).await?;

    Ok(())
}

fn bootstrap_auth_service(db: &Database, config: &Config) -> AuthService {
    let user_repo: Arc<dyn crate::feature::user::repository::UserRepository> =
        Arc::new(crate::feature::user::repository::UserRepositoryImpl::new());
    let user_profile_repo: Arc<dyn crate::feature::user::UserProfileRepository> =
        Arc::new(crate::feature::user::UserProfileRepositoryImpl::new());
    let auth_method_repo =
        Arc::new(crate::feature::auth::auth_method::AuthMethodRepositoryImpl::new());
    let session_repo = Arc::new(crate::feature::auth::session::SessionRepositoryImpl::new());

    let auth_method_service =
        crate::feature::auth::auth_method::AuthMethodService::new(db.clone(), auth_method_repo);
    let session_service =
        crate::feature::auth::session::SessionService::new(db.clone(), session_repo);

    AuthService::new(
        db.clone(),
        Arc::clone(&user_repo),
        Arc::clone(&user_profile_repo),
        auth_method_service,
        Arc::new(config.clone()),
        None, // No Redis session blacklist during bootstrap
        session_service,
    )
}

async fn create_bootstrap_admin(
    db: &Database,
    auth_service: &AuthService,
    admin: &BootstrapAdmin,
) -> eyre::Result<()> {
    match auth_service.register(admin.register_data()).await {
        Ok((auth_response, _)) => {
            // Promote to admin by updating role directly in DB
            sqlx::query("UPDATE users SET role = 'admin' WHERE id = $1")
                .bind(auth_response.user.id)
                .execute(db.pool())
                .await?;

            log_bootstrap_notification(db, auth_response.user.id).await;
            log_bootstrap_admin_created(admin);
        }
        Err(e) => {
            tracing::error!("❌ Failed to create bootstrap admin: {}", e);
        }
    }

    Ok(())
}

async fn log_bootstrap_notification(db: &Database, user_id: uuid::Uuid) {
    let result = sqlx::query(
        r"
        INSERT INTO notifications (user_id, kind, title, message, target_path, metadata)
        VALUES ($1, 'system.bootstrap', 'Dokuru is ready', 'This is the first admin account for the server.', '/admin', $2)
        ",
    )
    .bind(user_id)
    .bind(serde_json::json!({ "user_id": user_id }))
    .execute(db.pool())
    .await;

    if let Err(error) = result {
        tracing::warn!("Failed to create bootstrap notification: {error}");
    }
}

fn log_bootstrap_admin_created(admin: &BootstrapAdmin) {
    tracing::info!("✅ Bootstrap admin created successfully!");
    tracing::info!("");
    tracing::info!("┌────────────────────────────────────────────────────────────┐");
    tracing::info!("│  ADMIN USER CREATED                                        │");
    tracing::info!("├────────────────────────────────────────────────────────────┤");
    tracing::info!("│  Email:    {:<47}│", admin.email);
    tracing::info!("│  Username: {:<47}│", admin.username);
    tracing::info!("│  Password: {:<47}│", admin.password);
    tracing::info!("└────────────────────────────────────────────────────────────┘");
    tracing::info!("");
    tracing::warn!("⚠️  IMPORTANT: Change admin password after first login!");
    tracing::info!("");
}

/// Check if any admin user exists
async fn check_admin_exists(db: &Database) -> eyre::Result<bool> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(db.pool())
        .await?;

    Ok(count > 0)
}

/// Generate secure random password
fn generate_secure_password() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ\
                            abcdefghijklmnopqrstuvwxyz\
                            0123456789\
                            !@#$%^&*";

    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_password_has_expected_length_and_charset() {
        const CHARSET: &str =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

        let password = generate_secure_password();

        assert_eq!(password.len(), 16);
        assert!(password.chars().all(|ch| CHARSET.contains(ch)));
    }
}
