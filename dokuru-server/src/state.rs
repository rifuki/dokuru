use dashmap::DashMap;
use eyre::WrapErr;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    feature::{
        audit::service::AuditService,
        auth::service::AuthService,
        environments::repository::{EnvironmentRepository, EnvironmentRepositoryImpl},
        tokens::service::TokenService,
        user::repository::{UserRepository, UserRepositoryImpl},
        ws::session::AgentSession,
    },
    infrastructure::{config::Config, persistence::Database},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Database,
    pub auth_service: Arc<AuthService>,
    pub user_repo: Arc<dyn UserRepository>,
    pub token_service: Arc<TokenService>,
    pub env_repo: Arc<dyn EnvironmentRepository>,
    pub audit_service: Arc<AuditService>,
    /// Active WebSocket agent connections (for relay mode)
    pub agents: Arc<DashMap<Uuid, AgentSession>>,
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

    pub async fn new(config: Config) -> eyre::Result<Self> {
        let db = Database::new(&config)
            .await
            .wrap_err("Failed to connect to database")?;

        let user_repo: Arc<dyn UserRepository> = Arc::new(UserRepositoryImpl::new());
        let env_repo: Arc<dyn EnvironmentRepository> = Arc::new(EnvironmentRepositoryImpl::new());

        let auth_service = Arc::new(AuthService::new(
            db.clone(),
            Arc::clone(&user_repo),
            Arc::new(config.clone()),
        ));

        let token_repo: Arc<dyn crate::feature::tokens::repository::TokenRepository> =
            Arc::new(crate::feature::tokens::repository::TokenRepositoryImpl::new());
        let token_service = Arc::new(TokenService::new(db.clone(), token_repo));

        let audit_repo: Arc<dyn crate::feature::audit::repository::AuditRepository> =
            Arc::new(crate::feature::audit::repository::AuditRepositoryImpl::new());
        let audit_service = Arc::new(AuditService::new(db.clone(), audit_repo));

        Ok(Self {
            config: Arc::new(config),
            db,
            auth_service,
            user_repo,
            token_service,
            env_repo,
            audit_service,
            agents: Arc::new(DashMap::new()),
        })
    }
}
