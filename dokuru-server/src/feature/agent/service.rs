use eyre::Result;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::dto::{AgentResponse, CreateAgentDto, UpdateAgentDto};
use super::entity::Agent;
use super::repository::AgentRepository;

pub struct AgentService {
    agent_repo: Arc<dyn AgentRepository>,
}

impl AgentService {
    pub fn new(agent_repo: Arc<dyn AgentRepository>) -> Self {
        Self { agent_repo }
    }

    pub async fn create_agent(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        dto: CreateAgentDto,
    ) -> Result<AgentResponse> {
        let token_hash = Self::hash_token(&dto.token);
        let encrypted_token = Self::encrypt_token(&dto.token);
        let plain_token = dto.token.clone(); // Keep for response

        let agent = Agent {
            id: Uuid::new_v4(),
            user_id,
            name: dto.name,
            url: dto.url,
            token_hash,
            encrypted_token,
            access_mode: dto.access_mode,
            status: "unknown".to_string(),
            last_seen: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let created = self.agent_repo.create(pool, &agent).await?;
        Ok(Self::to_response_with_token(created, Some(plain_token)))
    }

    pub async fn list_agents(&self, pool: &PgPool, user_id: Uuid) -> Result<Vec<AgentResponse>> {
        let agents = self.agent_repo.find_by_user_id(pool, user_id).await?;
        Ok(agents.into_iter().map(Self::to_response).collect())
    }

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

    pub async fn update_agent(
        &self,
        pool: &PgPool,
        id: Uuid,
        user_id: Uuid,
        dto: UpdateAgentDto,
    ) -> Result<Option<AgentResponse>> {
        let token_hash = dto.token.as_deref().map(Self::hash_token);
        let agent = self
            .agent_repo
            .update(
                pool,
                id,
                user_id,
                &dto.name,
                &dto.url,
                token_hash.as_deref(),
            )
            .await?;
        Ok(agent.map(Self::to_response))
    }

    pub async fn delete_agent(&self, pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<bool> {
        self.agent_repo.delete(pool, id, user_id).await
    }

    fn hash_token(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let result = hasher.finalize();
        hex::encode(result)
    }

    fn encrypt_token(token: &str) -> String {
        // Simple base64 encoding (not real encryption, but sufficient for now)
        // In production, use proper encryption like AES-256-GCM
        use base64::{Engine as _, engine::general_purpose};
        general_purpose::STANDARD.encode(token.as_bytes())
    }

    fn decrypt_token(encrypted: &str) -> Result<String> {
        use base64::{Engine as _, engine::general_purpose};
        let decoded = general_purpose::STANDARD
            .decode(encrypted)
            .map_err(|e| eyre::eyre!("Failed to decode token: {}", e))?;
        String::from_utf8(decoded).map_err(|e| eyre::eyre!("Invalid UTF-8: {}", e))
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

    #[test]
    fn test_hash_token_consistency() {
        let token = "test-token-123";
        let hash1 = AgentService::hash_token(token);
        let hash2 = AgentService::hash_token(token);

        assert_eq!(hash1, hash2, "Same token should produce same hash");
        assert_ne!(hash1, token, "Hash should be different from original token");
        assert_eq!(hash1.len(), 64, "SHA256 hash should be 64 hex characters");
    }

    #[test]
    fn test_hash_token_different_inputs() {
        let token1 = "token-1";
        let token2 = "token-2";

        let hash1 = AgentService::hash_token(token1);
        let hash2 = AgentService::hash_token(token2);

        assert_ne!(
            hash1, hash2,
            "Different tokens should produce different hashes"
        );
    }

    #[test]
    fn test_hash_token_empty_string() {
        let token = "";
        let hash = AgentService::hash_token(token);

        assert!(!hash.is_empty(), "Hash of empty string should not be empty");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_hash_token_known_value() {
        let token = "test";
        let hash = AgentService::hash_token(token);

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
}
