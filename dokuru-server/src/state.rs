use std::sync::Arc;

use bb8_redis::bb8;
use dashmap::DashMap;
use eyre::WrapErr;
use tokio::sync::RwLock;

use crate::{
    feature::{
        admin::{
            stats::{StatsRepository, StatsRepositoryImpl, StatsService},
            user::{AdminUserRepository, AdminUserRepositoryImpl},
        },
        agent::{AgentRepository, AgentRepositoryImpl, AgentService, relay::AgentRegistry},
        audit_result::{AuditResultRepository, AuditResultRepositoryImpl, AuditResultService},
        auth::{
            auth_method::{AuthMethodRepository, AuthMethodRepositoryImpl, AuthMethodService},
            service::AuthService,
            session::{SessionRepository, SessionRepositoryImpl, SessionService},
        },
        document::{DocumentRepository, DocumentService},
        notification::{NotificationRepository, NotificationRepositoryImpl, NotificationService},
        user::{
            UserProfileRepository, UserProfileRepositoryImpl, UserRepository, UserRepositoryImpl,
        },
    },
    infrastructure::{
        config::Config,
        email::EmailService,
        logging::ReloadFilterHandle,
        persistence::{
            Database,
            redis::create_redis_pool,
            redis_trait::{RedisSessionBlacklist, SessionBlacklist},
        },
        storage::{LocalStorage, StorageProvider},
    },
    websocket::WsManager,
};

type RedisPool = bb8::Pool<bb8_redis::RedisConnectionManager>;
type SharedRedisPool = Arc<RedisPool>;

struct RedisComponents {
    session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    redis_pool: Option<SharedRedisPool>,
}

impl RedisComponents {
    const fn disabled() -> Self {
        Self {
            session_blacklist: None,
            redis_pool: None,
        }
    }

    async fn from_config(config: &Config) -> Self {
        if config.redis_url.is_none() {
            tracing::info!("ℹ️  Redis not configured (session blacklist disabled)");
            return Self::disabled();
        }

        match create_redis_pool(config).await {
            Ok(pool) => {
                tracing::info!("✅ Redis session blacklist enabled");
                let pool = Arc::new(pool);
                let blacklist = Arc::new(RedisSessionBlacklist::new((*pool).clone()));
                Self {
                    session_blacklist: Some(blacklist),
                    redis_pool: Some(pool),
                }
            }
            Err(e) => {
                tracing::warn!("⚠️  Redis not available (session blacklist disabled): {e}");
                Self::disabled()
            }
        }
    }
}

struct AppRepositories {
    user: Arc<dyn UserRepository>,
    user_profile: Arc<dyn UserProfileRepository>,
    admin_user: Arc<dyn AdminUserRepository>,
    agent: Arc<dyn AgentRepository>,
    audit_result: Arc<dyn AuditResultRepository>,
    auth_method: Arc<dyn AuthMethodRepository>,
    session: Arc<dyn SessionRepository>,
    stats: Arc<dyn StatsRepository>,
    document: Arc<DocumentRepository>,
    notification: Arc<dyn NotificationRepository>,
}

impl AppRepositories {
    fn new(db: &Database) -> Self {
        Self {
            user: Arc::new(UserRepositoryImpl::new()),
            user_profile: Arc::new(UserProfileRepositoryImpl::new()),
            admin_user: Arc::new(AdminUserRepositoryImpl::new()),
            agent: Arc::new(AgentRepositoryImpl::new()),
            audit_result: Arc::new(AuditResultRepositoryImpl::new()),
            auth_method: Arc::new(AuthMethodRepositoryImpl::new()),
            session: Arc::new(SessionRepositoryImpl::new()),
            stats: Arc::new(StatsRepositoryImpl::new()),
            document: Arc::new(DocumentRepository::new(db.pool().clone())),
            notification: Arc::new(NotificationRepositoryImpl::new()),
        }
    }
}

struct AppServices {
    auth: Arc<AuthService>,
    agent: Arc<AgentService>,
    audit: Arc<AuditResultService>,
    stats: Arc<StatsService>,
    document: Arc<DocumentService>,
    notification: Arc<NotificationService>,
    storage: Arc<dyn StorageProvider>,
    email: Arc<EmailService>,
}

impl AppServices {
    fn new(
        db: &Database,
        config: &Config,
        repositories: &AppRepositories,
        session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    ) -> Self {
        let auth_method = AuthMethodService::new(db.clone(), Arc::clone(&repositories.auth_method));
        let session = SessionService::new(db.clone(), Arc::clone(&repositories.session));
        let auth = Arc::new(AuthService::new(
            db.clone(),
            Arc::clone(&repositories.user),
            Arc::clone(&repositories.user_profile),
            auth_method,
            Arc::new(config.clone()),
            session_blacklist,
            session,
        ));

        Self {
            auth,
            agent: Arc::new(AgentService::new(Arc::clone(&repositories.agent))),
            audit: Arc::new(AuditResultService::new(Arc::clone(
                &repositories.audit_result,
            ))),
            stats: Arc::new(StatsService::new(Arc::clone(&repositories.stats))),
            document: Arc::new(DocumentService::new(
                Arc::clone(&repositories.document),
                config.upload.upload_dir.clone(),
            )),
            notification: Arc::new(NotificationService::new(Arc::clone(
                &repositories.notification,
            ))),
            storage: Arc::new(LocalStorage::new(
                &config.upload.upload_dir,
                &config.upload.base_url,
            )),
            email: Arc::new(EmailService::new(config.email.clone())),
        }
    }
}

struct RuntimeComponents {
    agent_registry: AgentRegistry,
    log_reload_handle: Arc<ReloadFilterHandle>,
    current_log_level: Arc<RwLock<String>>,
    ws_manager: WsManager,
    server_start_time: std::time::Instant,
}

impl RuntimeComponents {
    fn new(config: &Config, log_reload_handle: ReloadFilterHandle) -> Self {
        Self {
            agent_registry: Arc::new(DashMap::new()),
            log_reload_handle: Arc::new(log_reload_handle),
            current_log_level: Arc::new(RwLock::new(config.logging.default_level.clone())),
            ws_manager: WsManager::new(),
            server_start_time: std::time::Instant::now(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Database,
    pub auth_service: Arc<AuthService>,
    pub user_repo: Arc<dyn UserRepository>,
    pub user_profile_repo: Arc<dyn UserProfileRepository>,
    pub admin_user_repo: Arc<dyn AdminUserRepository>,
    pub agent_service: Arc<AgentService>,
    pub agent_registry: AgentRegistry,
    pub audit_service: Arc<AuditResultService>,
    pub stats_service: Arc<StatsService>,
    pub document_service: Arc<DocumentService>,
    pub notification_service: Arc<NotificationService>,
    pub storage: Arc<dyn StorageProvider>,
    pub email_service: Arc<EmailService>,
    pub session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    pub log_reload_handle: Arc<ReloadFilterHandle>,
    pub current_log_level: Arc<RwLock<String>>,
    pub ws_manager: WsManager,
    pub server_start_time: std::time::Instant,
    pub redis_pool: Option<SharedRedisPool>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

impl AppState {
    #[must_use]
    pub fn port(&self) -> u16 {
        self.config.server.port
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn new(config: Config, log_reload_handle: ReloadFilterHandle) -> eyre::Result<Self> {
        let db = Database::new(&config)
            .await
            .wrap_err("Failed to connect to database")?;
        let repositories = AppRepositories::new(&db);
        let redis = RedisComponents::from_config(&config).await;
        let services =
            AppServices::new(&db, &config, &repositories, redis.session_blacklist.clone());
        let runtime = RuntimeComponents::new(&config, log_reload_handle);

        Ok(Self::from_components(
            config,
            db,
            repositories,
            services,
            redis,
            runtime,
        ))
    }

    /// Build `AppState` from an existing Database — used by integration tests
    #[must_use]
    pub fn new_for_test(config: Config, db: &Database) -> Self {
        use tracing_subscriber::{EnvFilter, Registry, reload};

        // Dummy reload handle — never called in tests
        let (_, handle): (reload::Layer<EnvFilter, Registry>, ReloadFilterHandle) =
            reload::Layer::new(EnvFilter::new("error"));

        let repositories = AppRepositories::new(db);
        let redis = RedisComponents::disabled();
        let services = AppServices::new(db, &config, &repositories, None);
        let runtime = RuntimeComponents::new(&config, handle);

        Self::from_components(config, db.clone(), repositories, services, redis, runtime)
    }

    fn from_components(
        config: Config,
        db: Database,
        repositories: AppRepositories,
        services: AppServices,
        redis: RedisComponents,
        runtime: RuntimeComponents,
    ) -> Self {
        Self {
            config: Arc::new(config),
            db,
            auth_service: services.auth,
            user_repo: repositories.user,
            user_profile_repo: repositories.user_profile,
            admin_user_repo: repositories.admin_user,
            agent_service: services.agent,
            agent_registry: runtime.agent_registry,
            audit_service: services.audit,
            stats_service: services.stats,
            document_service: services.document,
            notification_service: services.notification,
            storage: services.storage,
            email_service: services.email,
            session_blacklist: redis.session_blacklist,
            log_reload_handle: runtime.log_reload_handle,
            current_log_level: runtime.current_log_level,
            ws_manager: runtime.ws_manager,
            server_start_time: runtime.server_start_time,
            redis_pool: redis.redis_pool,
        }
    }
}
