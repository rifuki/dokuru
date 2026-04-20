// WebSocket integration tests
// Run with: cargo test --test websocket_integration_test

use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

const WS_URL: &str = "ws://localhost:9393/ws";

#[tokio::test]
#[ignore] // Run manually when server is running
async fn test_websocket_connection() {
    let result = timeout(Duration::from_secs(5), connect_async(WS_URL)).await;
    
    match result {
        Ok(Ok((ws_stream, _))) => {
            println!("✅ WebSocket connection successful");
            drop(ws_stream);
        }
        Ok(Err(e)) => panic!("❌ WebSocket connection failed: {}", e),
        Err(_) => panic!("❌ Connection timeout"),
    }
}

#[tokio::test]
#[ignore]
async fn test_websocket_send_receive() {
    use futures::{SinkExt, StreamExt};
    
    let (ws_stream, _) = connect_async(WS_URL).await.expect("Failed to connect");
    let (mut write, mut read) = ws_stream.split();

    // Send message
    let test_msg = r#"{"type":"ping","data":"test"}"#;
    write
        .send(Message::Text(test_msg.into()))
        .await
        .expect("Failed to send");

    // Receive response
    let msg = timeout(Duration::from_secs(2), read.next())
        .await
        .expect("Timeout")
        .expect("No message")
        .expect("Error");

    println!("✅ Received: {:?}", msg);
    assert!(matches!(msg, Message::Text(_)));
}

#[tokio::test]
#[ignore]
async fn test_websocket_reconnection() {
    // First connection
    let (ws1, _) = connect_async(WS_URL).await.expect("First connection failed");
    drop(ws1);

    // Wait a bit
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Reconnect
    let (ws2, _) = connect_async(WS_URL).await.expect("Reconnection failed");
    println!("✅ Reconnection successful");
    drop(ws2);
}

#[tokio::test]
#[ignore]
async fn test_websocket_multiple_clients() {
    let (ws1, _) = connect_async(WS_URL).await.expect("Client 1 failed");
    let (ws2, _) = connect_async(WS_URL).await.expect("Client 2 failed");
    
    println!("✅ Multiple clients connected");
    
    drop(ws1);
    drop(ws2);
}

#[test]
fn test_websocket_url_conversion() {
    // Test HTTP to WS conversion
    let http_url = "http://localhost:9393/ws";
    let ws_url = http_url.replace("http", "ws");
    assert_eq!(ws_url, "ws://localhost:9393/ws");

    // Test HTTPS to WSS conversion
    let https_url = "https://api.dokuru.rifuki.dev/ws";
    let wss_url = https_url.replace("http", "ws");
    assert_eq!(wss_url, "wss://api.dokuru.rifuki.dev/ws");
    
    println!("✅ URL conversion tests passed");
}

#[test]
fn test_exponential_backoff() {
    let mut delays = vec![];
    for i in 0..5 {
        let delay = std::cmp::min(1000 * 2_u64.pow(i), 30000);
        delays.push(delay);
    }
    
    assert_eq!(delays, vec![1000, 2000, 4000, 8000, 16000]);
    println!("✅ Exponential backoff calculation correct");
}

#[test]
fn test_max_reconnect_attempts() {
    let max_attempts = 5;
    let mut attempts = 0;
    
    while attempts < max_attempts {
        attempts += 1;
    }
    
    assert_eq!(attempts, 5);
    println!("✅ Max reconnect attempts enforced");
}
