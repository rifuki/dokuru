use std::sync::Arc;

use rand::Rng;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::infrastructure::persistence::Database;

use super::{
    models::{Token, TokenResponse},
    repository::TokenRepository,
};

pub struct TokenService {
    db: Database,
    repo: Arc<dyn TokenRepository>,
}

impl TokenService {
    pub fn new(db: Database, repo: Arc<dyn TokenRepository>) -> Self {
        Self { db, repo }
    }

    /// Generate new API token with format: dok_<32_hex_chars>
    pub async fn generate(&self, user_id: Uuid, name: &str) -> eyre::Result<TokenResponse> {
        // Generate random token
        let token = Self::generate_token();
        
        // Hash token for storage
        let token_hash = Self::hash_token(&token);
        
        // Store in database
        let token_record = self.repo.create(&self.db, user_id, name, &token_hash).await?;
        
        Ok(TokenResponse {
            id: token_record.id,
            name: token_record.name,
            token, // Return plain token only once
            created_at: token_record.created_at,
        })
    }

    /// Verify token and return associated token record
    pub async fn verify(&self, token: &str) -> eyre::Result<Option<Token>> {
        let token_hash = Self::hash_token(token);
        let token_record = self.repo.find_by_hash(&self.db, &token_hash).await?;
        
        // Update last_used timestamp if token found
        if let Some(ref token) = token_record {
            let _ = self.repo.update_last_used(&self.db, token.id).await;
        }
        
        Ok(token_record)
    }

    /// List all tokens for a user
    pub async fn list(&self, user_id: Uuid) -> eyre::Result<Vec<Token>> {
        self.repo.list_by_user(&self.db, user_id).await
    }

    /// Revoke (delete) a token
    pub async fn revoke(&self, token_id: Uuid, user_id: Uuid) -> eyre::Result<bool> {
        self.repo.delete(&self.db, token_id, user_id).await
    }

    /// Generate random token with format: dok_<32_hex_chars>
    fn generate_token() -> String {
        let mut rng = rand::thread_rng();
        let random_bytes: [u8; 16] = rng.r#gen();
        let hex_string = hex::encode(random_bytes);
        format!("dok_{}", hex_string)
    }

    /// Hash token using SHA-256
    fn hash_token(token: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        hex::encode(hasher.finalize())
    }
}
