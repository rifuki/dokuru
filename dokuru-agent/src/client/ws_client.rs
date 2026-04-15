use eyre::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info};

use super::protocol::{AgentMessage, ServerMessage};

pub struct WsClient {
    server_url: String,
    token: String,
}

impl WsClient {
    pub fn new(server_url: String, token: String) -> Self {
        Self { server_url, token }
    }

    pub async fn connect(
        &self,
    ) -> Result<(
        mpsc::UnboundedSender<AgentMessage>,
        mpsc::UnboundedReceiver<ServerMessage>,
    )> {
        let url = format!("{}?token={}", self.server_url, self.token);
        info!("Connecting to server: {}", self.server_url);

        let (ws_stream, _) = connect_async(&url).await?;
        info!("WebSocket connected");

        let (mut write, mut read) = ws_stream.split();

        // Channel for sending messages to server
        let (tx_to_server, mut rx_from_agent) = mpsc::unbounded_channel::<AgentMessage>();

        // Channel for receiving messages from server
        let (tx_to_agent, rx_from_server) = mpsc::unbounded_channel::<ServerMessage>();

        // Task to send messages to server
        tokio::spawn(async move {
            while let Some(msg) = rx_from_agent.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(e) => {
                        error!("Failed to serialize message: {}", e);
                        continue;
                    }
                };

                if let Err(e) = write.send(Message::Text(json)).await {
                    error!("Failed to send message: {}", e);
                    break;
                }
            }
        });

        // Task to receive messages from server
        tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                if let Message::Text(text) = msg {
                    match serde_json::from_str::<ServerMessage>(&text) {
                        Ok(server_msg) => {
                            if tx_to_agent.send(server_msg).is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            error!("Failed to parse server message: {}", e);
                        }
                    }
                }
            }
        });

        Ok((tx_to_server, rx_from_server))
    }
}
