//! Bootstrap system for initial setup
//! Auto-creates admin user if no admin exists

use crate::{
    feature::auth::service::AuthService,
    infrastructure::{config::Config, persistence::Database},
};
use std::sync::Arc;

/// Bootstrap the application
/// - Create admin user from env if no admin exists
///
/// # Errors
///
/// Returns error if database operations fail or admin creation fails.
#[allow(clippy::cognitive_complexity)]
pub async fn bootstrap(db: &Database, config: &Config) -> eyre::Result<()> {
    tracing::info!("🚀 Running bootstrap checks...");

    if !config.bootstrap.enabled {
        tracing::info!("⏭️ Bootstrap disabled, skipping...");
        return Ok(());
    }

    // Check if admin already exists
    let admin_exists = check_admin_exists(db).await?;

    if admin_exists {
        tracing::info!("✅ Admin user already exists, skipping bootstrap");
        return Ok(());
    }

    // Create admin from layered config
    let admin_email = config.bootstrap.admin_email.clone();
    let admin_username = config.bootstrap.admin_username.clone();
    let admin_password =
        std::env::var("BOOTSTRAP_ADMIN_PASSWORD").unwrap_or_else(|_| generate_secure_password());
    let admin_name = config.bootstrap.admin_name.clone();

    tracing::info!("👤 Creating bootstrap admin user: {}", admin_email);

    // Create admin via auth service
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

    let auth_service = AuthService::new(
        db.clone(),
        Arc::clone(&user_repo),
        Arc::clone(&user_profile_repo),
        auth_method_service,
        Arc::new(config.clone()),
        None, // No Redis session blacklist during bootstrap
        session_service,
    );

    match auth_service
        .register(
            &admin_email,
            Some(&admin_username),
            &admin_password,
            Some(&admin_name),
            None, // No device info during bootstrap
        )
        .await
    {
        Ok((auth_response, _)) => {
            // Promote to admin by updating role directly in DB
            sqlx::query("UPDATE users SET role = 'admin' WHERE id = $1")
                .bind(auth_response.user.id)
                .execute(db.pool())
                .await?;

            tracing::info!("✅ Bootstrap admin created successfully!");
            tracing::info!("");
            tracing::info!("┌────────────────────────────────────────────────────────────┐");
            tracing::info!("│  ADMIN USER CREATED                                        │");
            tracing::info!("├────────────────────────────────────────────────────────────┤");
            tracing::info!("│  Email:    {:<47}│", admin_email);
            tracing::info!("│  Username: {:<47}│", admin_username);
            tracing::info!("│  Password: {:<47}│", admin_password);
            tracing::info!("└────────────────────────────────────────────────────────────┘");
            tracing::info!("");
            tracing::warn!("⚠️  IMPORTANT: Change admin password after first login!");
            tracing::info!("");
        }
        Err(e) => {
            tracing::error!("❌ Failed to create bootstrap admin: {}", e);
        }
    }

    Ok(())
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
