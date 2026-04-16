use eyre::Result;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use super::dto::{AgentResponse, CreateAgentDto};
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
        let plain_token = dto.token.clone(); // Keep for response

        let agent = Agent {
            id: Uuid::new_v4(),
            user_id,
            name: dto.name,
            url: dto.url,
            token_hash,
            access_mode: "direct".to_string(),
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

        if let Some(agent) = agent {
            if agent.user_id == user_id {
                return Ok(Some(Self::to_response(agent)));
            }
        }

        Ok(None)
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

    fn to_response(agent: Agent) -> AgentResponse {
        Self::to_response_with_token(agent, None)
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
