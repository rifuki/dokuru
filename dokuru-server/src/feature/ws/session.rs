use axum::extract::ws::Message;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Agent session information
#[derive(Debug, Clone)]
pub struct AgentSession {
    pub env_id: Uuid,
    pub user_id: Uuid,
    pub token_id: Uuid,
    pub sender: mpsc::UnboundedSender<Message>,
}

impl AgentSession {
    pub fn new(
        env_id: Uuid,
        user_id: Uuid,
        token_id: Uuid,
        sender: mpsc::UnboundedSender<Message>,
    ) -> Self {
        Self {
            env_id,
            user_id,
            token_id,
            sender,
        }
    }

    /// Send message to agent
    pub fn send(&self, message: Message) -> Result<(), mpsc::error::SendError<Message>> {
        self.sender.send(message)
    }
}
