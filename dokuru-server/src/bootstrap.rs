//! Bootstrap system for initial setup
//! Auto-creates admin user if no admin exists

use crate::{
    feature::{
        admin::api_key::{
            repository::ApiKeyRepositoryImpl,
            service::ApiKeyService,
        },
        auth::service::AuthService,
        user::CreateUser,
    },
    infrastructure::{config::Config, persistence::Database},
};
use std::sync::Arc;

/// Bootstrap the application
/// - Create admin user from env if no admin exists
pub async fn bootstrap(
    db: &Database,
    config: &Config,
) -> eyre::Result<()> {
    tracing::info!("🚀 Running bootstrap checks...");

    // Check if bootstrap is enabled
    let bootstrap_enabled = std::env::var("BOOTSTRAP_ENABLED")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);

    if !bootstrap_enabled {
        tracing::info!("⏭️ Bootstrap disabled, skipping...");
        return Ok(());
    }

    // Check if admin already exists
    let admin_exists = check_admin_exists(db).await?;
    
    if admin_exists {
        tracing::info!("✅ Admin user already exists, skipping bootstrap");
        return Ok(());
    }

    // Create admin from env
    let admin_email = std::env::var("BOOTSTRAP_ADMIN_EMAIL")
        .unwrap_or_else(|_| "admin@quax.dev".to_string());
    
    let admin_password = std::env::var("BOOTSTRAP_ADMIN_PASSWORD")
        .unwrap_or_else(|_| generate_secure_password());

    let admin_username = std::env::var("BOOTSTRAP_ADMIN_USERNAME")
        .unwrap_or_else(|_| "admin".to_string());

    let admin_name = std::env::var("BOOTSTRAP_ADMIN_NAME")
        .unwrap_or_else(|_| "Administrator".to_string());

    tracing::info!("👤 Creating bootstrap admin user: {}", admin_email);

    // Create admin via auth service
    let user_repo: Arc<dyn crate::feature::user::repository::UserRepository> = 
        Arc::new(crate::feature::user::repository::UserRepositoryImpl::new());

    let auth_service = AuthService::new(
        db.clone(),
        Arc::clone(&user_repo),
        Arc::new(config.clone()),
    );

    let create_user = CreateUser {
        email: admin_email.clone(),
        username: Some(admin_username.clone()),
        name: admin_name,
        password: admin_password.clone(),
    };

    let admin_id = match auth_service.register(create_user).await {
        Ok((auth_response, _)) => {
            // Promote to admin by updating role directly in DB
            sqlx::query("UPDATE users SET role = 'admin' WHERE id = $1")
                .bind(auth_response.user.id)
                .execute(db.pool())
                .await?;

            tracing::info!("✅ Bootstrap admin created successfully!");
            tracing::info!("");
            tracing::info!("╔════════════════════════════════════════════════════════════╗");
            tracing::info!("║  🎉 ADMIN USER CREATED                                     ║");
            tracing::info!("╠════════════════════════════════════════════════════════════╣");
            tracing::info!("║  Email:    {:<46} ║", admin_email);
            tracing::info!("║  Username: {:<46} ║", admin_username);
            tracing::info!("║  Password: {:<46} ║", admin_password);
            tracing::info!("╚════════════════════════════════════════════════════════════╝");
            tracing::info!("");
            
            Some(auth_response.user.id)
        }
        Err(e) => {
            tracing::error!("❌ Failed to create bootstrap admin: {}", e);
            None
        }
    };

    // Create bootstrap API key if admin was created
    if let Some(admin_uuid) = admin_id {
        create_bootstrap_api_key(db, admin_uuid).await?;
    }

    Ok(())
}

/// Check if any admin user exists
async fn check_admin_exists(db: &Database) -> eyre::Result<bool> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    )
    .fetch_one(db.pool())
    .await?;

    Ok(count > 0)
}

/// Create bootstrap API key for admin
async fn create_bootstrap_api_key(
    db: &Database,
    admin_id: uuid::Uuid,
) -> eyre::Result<()> {
    let api_key_service = ApiKeyService::new(
        db.clone(),
        Arc::new(ApiKeyRepositoryImpl::new()),
    );

    match api_key_service
        .generate_key(
            "Bootstrap Admin Key",
            vec!["admin:full".to_string(), "dev:seed".to_string()],
            Some(admin_id),
            Some(365), // 1 year expiration
        )
        .await
    {
        Ok(key) => {
            tracing::info!("");
            tracing::info!("╔════════════════════════════════════════════════════════════╗");
            tracing::info!("║  🔑 BOOTSTRAP API KEY CREATED                              ║");
            tracing::info!("╠════════════════════════════════════════════════════════════╣");
            tracing::info!("║  Name:     {:<46} ║", key.name);
            tracing::info!("║  Key:      {:<46} ║", key.key);
            tracing::info!("║  Scopes:   {:<46} ║", key.scopes.join(", "));
            tracing::info!("║  Expires:  {:<46} ║", key.expires_at.map(|d| d.to_string()).unwrap_or_else(|| "Never".to_string()));
            tracing::info!("╚════════════════════════════════════════════════════════════╝");
            tracing::info!("");
            tracing::warn!("⚠️  IMPORTANT: Save this API key, it won't be shown again!");
            tracing::warn!("⚠️  Change admin password after first login!");
            tracing::info!("");
        }
        Err(e) => {
            tracing::error!("❌ Failed to create bootstrap API key: {}", e);
        }
    }

    Ok(())
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
