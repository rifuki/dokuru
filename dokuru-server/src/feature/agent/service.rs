use eyre::{Result, bail};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::domain::{AgentStatus, decode_token, encode_token, hash_token};
use super::dto::{AgentResponse, CreateAgentDto, UpdateAgentDto};
use super::entity::Agent;
use super::repository::{AgentRepository, UpdateAgentParams};

pub const DUPLICATE_AGENT_TOKEN_MESSAGE: &str = "Agent token is already registered";

pub struct AgentService {
    agent_repo: Arc<dyn AgentRepository>,
}

impl AgentService {
    pub fn new(agent_repo: Arc<dyn AgentRepository>) -> Self {
        Self { agent_repo }
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn create_agent(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        dto: CreateAgentDto,
    ) -> Result<AgentResponse> {
        let token_hash = hash_token(&dto.token);
        let encrypted_token = encode_token(&dto.token);
        let plain_token = dto.token.clone(); // Keep for response

        if let Some(existing) = self
            .agent_repo
            .find_latest_by_token_hash(pool, &token_hash)
            .await?
        {
            if existing.user_id != user_id {
                bail!(DUPLICATE_AGENT_TOKEN_MESSAGE);
            }

            let params = UpdateAgentParams {
                name: &dto.name,
                url: &dto.url,
                access_mode: &dto.access_mode,
                token_hash: None,
                encrypted_token: None,
            };
            let agent = self
                .agent_repo
                .update(pool, existing.id, user_id, params)
                .await?
                .unwrap_or(existing);

            return Ok(Self::to_response_with_token(agent, Some(plain_token)));
        }

        let agent = Agent {
            id: Uuid::new_v4(),
            user_id,
            name: dto.name,
            url: dto.url,
            token_hash,
            encrypted_token,
            access_mode: dto.access_mode,
            status: AgentStatus::Unknown.as_str().to_string(),
            last_seen: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let created = self.agent_repo.create(pool, &agent).await?;
        Ok(Self::to_response_with_token(created, Some(plain_token)))
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn list_agents(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<AgentResponse>> {
        let agents = self.agent_repo.find_by_user_id(pool, user_id).await?;
        Ok(agents.into_iter().map(Self::to_response).collect())
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn get_agent(
        &self,
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<AgentResponse>> {
        let agent = self.agent_repo.find_by_id(pool, id).await?;

        if let Some(agent) = agent
            && agent.user_id == user_id
        {
            return Ok(Some(Self::to_response(agent)));
        }

        Ok(None)
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn update_agent(
        &self,
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
        dto: UpdateAgentDto,
    ) -> Result<Option<AgentResponse>> {
        let token = dto
            .token
            .as_ref()
            .map(|token| (hash_token(token), encode_token(token)));

        if let Some((token_hash, _)) = token.as_ref() {
            self.ensure_token_available(pool, token_hash, user_id, id)
                .await?;
        }

        let params = UpdateAgentParams {
            name: &dto.name,
            url: &dto.url,
            access_mode: &dto.access_mode,
            token_hash: token.as_ref().map(|(hash, _)| hash.as_str()),
            encrypted_token: token.as_ref().map(|(_, encrypted)| encrypted.as_str()),
        };

        let agent = self.agent_repo.update(pool, id, user_id, params).await?;
        Ok(agent.map(Self::to_response))
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn find_latest_agent_by_token(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        token: &str,
    ) -> Result<Option<AgentResponse>> {
        let token_hash = hash_token(token);
        let agent = self
            .agent_repo
            .find_latest_by_token_hash(pool, &token_hash)
            .await?;

        Ok(agent
            .filter(|agent| agent.user_id == user_id)
            .map(Self::to_response))
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn delete_agent(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool> {
        self.agent_repo.delete(pool, id, user_id).await
    }

    async fn ensure_token_available(
        &self,
        pool: &PgPool,
        token_hash: &str,
        user_id: Uuid,
        agent_id: Uuid,
    ) -> Result<()> {
        if let Some(existing) = self
            .agent_repo
            .find_latest_by_token_hash(pool, token_hash)
            .await?
            && (existing.user_id != user_id || existing.id != agent_id)
        {
            bail!(DUPLICATE_AGENT_TOKEN_MESSAGE);
        }

        Ok(())
    }

    fn decrypt_token(encrypted: &str) -> Result<String> {
        decode_token(encrypted).map_err(Into::into)
    }

    fn to_response(agent: Agent) -> AgentResponse {
        // Decrypt token from encrypted_token field
        let decrypted_token = if agent.encrypted_token.is_empty() {
            None
        } else {
            Self::decrypt_token(&agent.encrypted_token).ok()
        };
        Self::to_response_with_token(agent, decrypted_token)
    }

    fn to_response_with_token(agent: Agent, token: Option<String>) -> AgentResponse {
        AgentResponse {
            id: agent.id,
            name: agent.name,
            url: agent.url,
            access_mode: agent.access_mode,
            status: agent.status,
            last_seen: agent.last_seen,
            created_at: agent.created_at,
            updated_at: agent.updated_at,
            token,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Mutex;

    struct InMemoryAgentRepository {
        agents: Mutex<Vec<Agent>>,
    }

    impl InMemoryAgentRepository {
        fn new(agents: Vec<Agent>) -> Self {
            Self {
                agents: Mutex::new(agents),
            }
        }
    }

    #[async_trait]
    impl AgentRepository for InMemoryAgentRepository {
        async fn create(&self, _pool: &PgPool, agent: &Agent) -> Result<Agent> {
            let mut agents = self.agents.lock().unwrap();
            agents.push(agent.clone());
            Ok(agent.clone())
        }

        async fn find_by_id(&self, _pool: &PgPool, id: Uuid) -> Result<Option<Agent>> {
            Ok(self
                .agents
                .lock()
                .unwrap()
                .iter()
                .find(|agent| agent.id == id)
                .cloned())
        }

        async fn find_latest_by_token_hash(
            &self,
            _pool: &PgPool,
            token_hash: &str,
        ) -> Result<Option<Agent>> {
            Ok(self
                .agents
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|agent| agent.token_hash == token_hash)
                .cloned())
        }

        async fn find_by_user_id(&self, _pool: &PgPool, user_id: Uuid) -> Result<Vec<Agent>> {
            Ok(self
                .agents
                .lock()
                .unwrap()
                .iter()
                .filter(|agent| agent.user_id == user_id)
                .cloned()
                .collect())
        }

        async fn update(
            &self,
            _pool: &PgPool,
            id: Uuid,
            user_id: Uuid,
            params: UpdateAgentParams<'_>,
        ) -> Result<Option<Agent>> {
            let mut agents = self.agents.lock().unwrap();
            let Some(agent) = agents
                .iter_mut()
                .find(|agent| agent.id == id && agent.user_id == user_id)
            else {
                return Ok(None);
            };

            agent.name = params.name.to_string();
            agent.url = params.url.to_string();
            agent.access_mode = params.access_mode.to_string();
            if let (Some(token_hash), Some(encrypted_token)) =
                (params.token_hash, params.encrypted_token)
            {
                agent.token_hash = token_hash.to_string();
                agent.encrypted_token = encrypted_token.to_string();
            }
            agent.updated_at = chrono::Utc::now();

            Ok(Some(agent.clone()))
        }

        async fn delete(&self, _pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool> {
            let mut agents = self.agents.lock().unwrap();
            let original_len = agents.len();
            agents.retain(|agent| agent.id != id || agent.user_id != user_id);

            Ok(agents.len() != original_len)
        }
    }

    fn lazy_pool() -> PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://dokuru:dokuru@localhost/dokuru_test")
            .unwrap()
    }

    fn test_agent(user_id: Uuid, token: &str) -> Agent {
        Agent {
            id: Uuid::new_v4(),
            user_id,
            name: "Existing Agent".to_string(),
            url: "relay".to_string(),
            token_hash: hash_token(token),
            encrypted_token: encode_token(token),
            access_mode: "relay".to_string(),
            status: "unknown".to_string(),
            last_seen: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn test_hash_token_consistency() {
        let token = "test-token-123";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);

        assert_eq!(hash1, hash2, "Same token should produce same hash");
        assert_ne!(hash1, token, "Hash should be different from original token");
        assert_eq!(hash1.len(), 64, "SHA256 hash should be 64 hex characters");
    }

    #[test]
    fn test_hash_token_different_inputs() {
        let token1 = "token-1";
        let token2 = "token-2";

        let hash1 = hash_token(token1);
        let hash2 = hash_token(token2);

        assert_ne!(
            hash1, hash2,
            "Different tokens should produce different hashes"
        );
    }

    #[test]
    fn test_hash_token_empty_string() {
        let token = "";
        let hash = hash_token(token);

        assert!(!hash.is_empty(), "Hash of empty string should not be empty");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_hash_token_known_value() {
        let token = "test";
        let hash = hash_token(token);

        // SHA256 of "test" should be this specific value
        let expected = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_to_response_without_token() {
        let agent = Agent {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            name: "Test Agent".to_string(),
            url: "http://localhost:8080".to_string(),
            token_hash: "hash123".to_string(),
            encrypted_token: "encrypted123".to_string(),
            access_mode: "direct".to_string(),
            status: "online".to_string(),
            last_seen: Some(chrono::Utc::now()),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let response = AgentService::to_response(agent.clone());

        assert_eq!(response.id, agent.id);
        assert_eq!(response.name, agent.name);
        assert_eq!(response.url, agent.url);
        assert!(response.token.is_none());
    }

    #[test]
    fn test_to_response_with_token() {
        let agent = Agent {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            name: "Test Agent".to_string(),
            url: "http://localhost:8080".to_string(),
            token_hash: "hash123".to_string(),
            encrypted_token: "encrypted123".to_string(),
            access_mode: "direct".to_string(),
            status: "online".to_string(),
            last_seen: Some(chrono::Utc::now()),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let token = "plain-token-123".to_string();
        let response = AgentService::to_response_with_token(agent.clone(), Some(token.clone()));

        assert_eq!(response.id, agent.id);
        assert!(response.token.is_some());
        assert_eq!(response.token.unwrap(), token);
    }

    #[tokio::test]
    async fn create_agent_reuses_existing_same_user_token() {
        let user_id = Uuid::new_v4();
        let token = "relay-token";
        let existing = test_agent(user_id, token);
        let existing_id = existing.id;
        let repo = Arc::new(InMemoryAgentRepository::new(vec![existing]));
        let service = AgentService::new(repo.clone());
        let pool = lazy_pool();

        let response = service
            .create_agent(
                &pool,
                user_id,
                CreateAgentDto {
                    name: "Renamed Relay".to_string(),
                    url: "relay".to_string(),
                    token: token.to_string(),
                    access_mode: "relay".to_string(),
                },
            )
            .await
            .unwrap();

        assert_eq!(response.id, existing_id);
        assert_eq!(response.name, "Renamed Relay");
        assert_eq!(response.token.as_deref(), Some(token));
        assert_eq!(repo.agents.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn create_agent_rejects_token_owned_by_another_user() {
        let existing = test_agent(Uuid::new_v4(), "relay-token");
        let repo = Arc::new(InMemoryAgentRepository::new(vec![existing]));
        let service = AgentService::new(repo);
        let pool = lazy_pool();

        let error = service
            .create_agent(
                &pool,
                Uuid::new_v4(),
                CreateAgentDto {
                    name: "Duplicate Relay".to_string(),
                    url: "relay".to_string(),
                    token: "relay-token".to_string(),
                    access_mode: "relay".to_string(),
                },
            )
            .await
            .unwrap_err();

        assert_eq!(error.to_string(), DUPLICATE_AGENT_TOKEN_MESSAGE);
    }
}
