use axum::extract::ws::{Message, WebSocket};
use dashmap::DashMap;
use futures::{SinkExt, StreamExt, stream::SplitSink};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

pub mod handler;
#[cfg(test)]
mod tests;

#[derive(Clone, Debug, serde::Serialize)]
pub struct WsEvent {
    pub r#type: String,
    pub data: serde_json::Value,
}

pub type WsClients = Arc<DashMap<Uuid, SplitSink<WebSocket, Message>>>;

#[derive(Clone)]
pub struct WsManager {
    clients: WsClients,
    tx: broadcast::Sender<WsEvent>,
}

impl Default for WsManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WsManager {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            clients: Arc::new(DashMap::new()),
            tx,
        }
    }

    pub async fn handle_connection(&self, ws: WebSocket) {
        let client_id = Uuid::new_v4();
        let (sender, mut receiver) = ws.split();

        self.clients.insert(client_id, sender);
        let mut rx = self.tx.subscribe();

        let clients = self.clients.clone();

        // Broadcast task
        let broadcast_task = tokio::spawn(async move {
            while let Ok(event) = rx.recv().await {
                if let Some(mut sender) = clients.get_mut(&client_id) {
                    let msg = serde_json::to_string(&event).unwrap_or_default();
                    let _ = sender.send(Message::Text(msg.into())).await;
                }
            }
        });

        // Receive task
        while let Some(Ok(msg)) = receiver.next().await {
            if matches!(msg, Message::Close(_)) {
                break;
            }
        }

        self.clients.remove(&client_id);
        broadcast_task.abort();
    }

    pub fn broadcast(&self, event: WsEvent) {
        let _ = self.tx.send(event);
    }

    pub fn broadcast_agent_connected(&self, agent_id: Uuid) {
        self.broadcast(WsEvent {
            r#type: "agent:connected".to_string(),
            data: json!({ "agentId": agent_id }),
        });
    }

    pub fn broadcast_agent_disconnected(&self, agent_id: Uuid) {
        self.broadcast(WsEvent {
            r#type: "agent:disconnected".to_string(),
            data: json!({ "agentId": agent_id }),
        });
    }

    pub fn broadcast_audit_completed(&self, agent_id: Uuid, audit_id: Uuid) {
        self.broadcast(WsEvent {
            r#type: "audit:completed".to_string(),
            data: json!({ "agentId": agent_id, "auditId": audit_id }),
        });
    }
}
