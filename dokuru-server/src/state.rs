use std::sync::Arc;

use eyre::WrapErr;

use crate::{
    feature::{
        admin::{
            stats::{StatsRepository, StatsRepositoryImpl, StatsService},
            user::{AdminUserRepository, AdminUserRepositoryImpl},
        },
        auth::{
            auth_method::{AuthMethodRepositoryImpl, AuthMethodService},
            service::AuthService,
            session::{SessionRepositoryImpl, SessionService},
        },
        user::{
            UserProfileRepository, UserProfileRepositoryImpl, UserRepository, UserRepositoryImpl,
        },
    },
    infrastructure::{
        config::Config,
        logging::ReloadFilterHandle,
        persistence::{
            Database,
            redis::create_redis_pool,
            redis_trait::{RedisSessionBlacklist, SessionBlacklist},
        },
        storage::StorageProvider,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Database,
    pub auth_service: Arc<AuthService>,
    pub user_repo: Arc<dyn UserRepository>,
    pub user_profile_repo: Arc<dyn UserProfileRepository>,
    pub admin_user_repo: Arc<dyn AdminUserRepository>,
    pub stats_service: Arc<StatsService>,
    pub storage: Arc<dyn StorageProvider>,
    pub session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    pub log_reload_handle: Arc<ReloadFilterHandle>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

impl AppState {
    pub fn port(&self) -> u16 {
        self.config.server.port
    }

    pub async fn new(config: Config, log_reload_handle: ReloadFilterHandle) -> eyre::Result<Self> {
        use crate::infrastructure::storage::LocalStorage;

        let db = Database::new(&config)
            .await
            .wrap_err("Failed to connect to database")?;

        // Repositories
        let user_repo: Arc<dyn UserRepository> = Arc::new(UserRepositoryImpl::new());
        let user_profile_repo: Arc<dyn UserProfileRepository> =
            Arc::new(UserProfileRepositoryImpl::new());
        let admin_user_repo: Arc<dyn AdminUserRepository> =
            Arc::new(AdminUserRepositoryImpl::new());
        let auth_method_repo = Arc::new(AuthMethodRepositoryImpl::new());
        let session_repo = Arc::new(SessionRepositoryImpl::new());
        let stats_repository: Arc<dyn StatsRepository> = Arc::new(StatsRepositoryImpl::new());

        // Services
        let auth_method_service = AuthMethodService::new(db.clone(), auth_method_repo);
        let session_service = SessionService::new(db.clone(), session_repo);

        // Initialize Redis if configured
        let session_blacklist: Option<Arc<dyn SessionBlacklist>> = if let Some(ref _redis_url) =
            config.redis_url
        {
            match create_redis_pool(&config).await {
                Ok(pool) => {
                    tracing::info!("✅ Redis session blacklist enabled");
                    Some(Arc::new(RedisSessionBlacklist::new(pool)) as Arc<dyn SessionBlacklist>)
                }
                Err(e) => {
                    tracing::warn!("⚠️  Redis not available (session blacklist disabled): {e}");
                    None
                }
            }
        } else {
            tracing::info!("ℹ️  Redis not configured (session blacklist disabled)");
            None
        };

        let auth_service = Arc::new(AuthService::new(
            db.clone(),
            Arc::clone(&user_repo),
            Arc::clone(&user_profile_repo),
            auth_method_service,
            Arc::new(config.clone()),
            session_blacklist.clone(),
            session_service,
        ));

        let stats_service = Arc::new(StatsService::new(stats_repository));

        let storage: Arc<dyn StorageProvider> = Arc::new(LocalStorage::new(
            &config.upload.upload_dir,
            &config.upload.base_url,
        ));

        Ok(Self {
            config: Arc::new(config),
            db,
            auth_service,
            user_repo,
            user_profile_repo,
            admin_user_repo,
            stats_service,
            storage,
            session_blacklist,
            log_reload_handle: Arc::new(log_reload_handle),
        })
    }

    /// Build AppState from an existing Database — used by integration tests
    pub fn new_for_test(config: Config, db: Database) -> Self {
        use crate::infrastructure::storage::LocalStorage;
        use tracing_subscriber::{EnvFilter, Registry, reload};

        // Repositories
        let user_repo: Arc<dyn UserRepository> = Arc::new(UserRepositoryImpl::new());
        let user_profile_repo: Arc<dyn UserProfileRepository> =
            Arc::new(UserProfileRepositoryImpl::new());
        let admin_user_repo: Arc<dyn AdminUserRepository> =
            Arc::new(AdminUserRepositoryImpl::new());
        let auth_method_repo = Arc::new(AuthMethodRepositoryImpl::new());
        let session_repo = Arc::new(SessionRepositoryImpl::new());
        let stats_repository: Arc<dyn StatsRepository> = Arc::new(StatsRepositoryImpl::new());

        // Services
        let auth_method_service = AuthMethodService::new(db.clone(), auth_method_repo);
        let session_service = SessionService::new(db.clone(), session_repo);

        // No Redis in tests
        let session_blacklist: Option<Arc<dyn SessionBlacklist>> = None;

        let auth_service = Arc::new(AuthService::new(
            db.clone(),
            Arc::clone(&user_repo),
            Arc::clone(&user_profile_repo),
            auth_method_service,
            Arc::new(config.clone()),
            session_blacklist.clone(),
            session_service,
        ));

        let stats_service = Arc::new(StatsService::new(stats_repository));

        // Dummy reload handle — never called in tests
        let (_, handle): (reload::Layer<EnvFilter, Registry>, ReloadFilterHandle) =
            reload::Layer::new(EnvFilter::new("error"));

        let storage: Arc<dyn StorageProvider> = Arc::new(LocalStorage::new(
            &config.upload.upload_dir,
            &config.upload.base_url,
        ));

        Self {
            config: Arc::new(config),
            db,
            auth_service,
            user_repo,
            user_profile_repo,
            admin_user_repo,
            stats_service,
            storage,
            session_blacklist: None,
            log_reload_handle: Arc::new(handle),
        }
    }
}
