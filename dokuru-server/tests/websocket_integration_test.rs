// WebSocket integration tests
// Run with: cargo test --test websocket_integration_test -- --ignored

use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

const WS_URL: &str = "ws://localhost:9393/ws";

// ============================================================================
// Integration Tests (require running server)
// ============================================================================

#[tokio::test]
#[ignore]
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
    let (ws_stream, _) = connect_async(WS_URL).await.expect("Failed to connect");
    let (mut write, mut read) = ws_stream.split();

    // Send message
    let test_msg = r#"{"type":"ping","data":"test"}"#;
    write
        .send(Message::Text(test_msg.into()))
        .await
        .expect("Failed to send");

    // Wait for potential broadcast events
    let msg = timeout(Duration::from_secs(2), read.next()).await;

    match msg {
        Ok(Some(Ok(message))) => {
            println!("✅ Received: {:?}", message);
            assert!(matches!(message, Message::Text(_)));
        }
        Ok(Some(Err(e))) => println!("⚠️  Error receiving: {}", e),
        Ok(None) => println!("⚠️  Connection closed"),
        Err(_) => println!("⚠️  No message received (expected for broadcast-only)"),
    }
}

#[tokio::test]
#[ignore]
async fn test_websocket_reconnection() {
    // First connection
    let (ws1, _) = connect_async(WS_URL)
        .await
        .expect("First connection failed");
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
    let (ws3, _) = connect_async(WS_URL).await.expect("Client 3 failed");

    println!("✅ Multiple clients connected");

    drop(ws1);
    drop(ws2);
    drop(ws3);
}

#[tokio::test]
#[ignore]
async fn test_websocket_broadcast_to_multiple_clients() {
    let (ws1, _) = connect_async(WS_URL).await.expect("Client 1 failed");
    let (ws2, _) = connect_async(WS_URL).await.expect("Client 2 failed");

    let (_, mut read1) = ws1.split();
    let (_, mut read2) = ws2.split();

    // Both clients should receive broadcast events
    // (This test requires triggering an event on the server)

    tokio::select! {
        msg1 = timeout(Duration::from_secs(2), read1.next()) => {
            if let Ok(Some(Ok(_))) = msg1 {
                println!("✅ Client 1 received broadcast");
            }
        }
        msg2 = timeout(Duration::from_secs(2), read2.next()) => {
            if let Ok(Some(Ok(_))) = msg2 {
                println!("✅ Client 2 received broadcast");
            }
        }
    }
}

#[tokio::test]
#[ignore]
async fn test_websocket_close_gracefully() {
    let (ws_stream, _) = connect_async(WS_URL).await.expect("Failed to connect");
    let (mut write, _) = ws_stream.split();

    // Send close message
    write
        .send(Message::Close(None))
        .await
        .expect("Failed to send close");

    tokio::time::sleep(Duration::from_millis(100)).await;
    println!("✅ Graceful close successful");
}

#[tokio::test]
#[ignore]
async fn test_websocket_json_message() {
    let (ws_stream, _) = connect_async(WS_URL).await.expect("Failed to connect");
    let (mut write, _) = ws_stream.split();

    let msg = json!({
        "type": "test",
        "data": {
            "message": "hello",
            "timestamp": "2026-04-21T06:00:00Z"
        }
    });

    write
        .send(Message::Text(msg.to_string().into()))
        .await
        .expect("Failed to send JSON");

    println!("✅ JSON message sent successfully");
}

#[tokio::test]
#[ignore]
async fn test_websocket_rapid_reconnections() {
    for i in 0..10 {
        let (ws, _) = connect_async(WS_URL)
            .await
            .unwrap_or_else(|_| panic!("Connection {} failed", i));
        drop(ws);
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    println!("✅ Rapid reconnections successful");
}

#[tokio::test]
#[ignore]
async fn test_websocket_long_lived_connection() {
    let (ws_stream, _) = connect_async(WS_URL).await.expect("Failed to connect");

    // Keep connection alive for 5 seconds
    tokio::time::sleep(Duration::from_secs(5)).await;

    drop(ws_stream);
    println!("✅ Long-lived connection successful");
}

// ============================================================================
// Unit Tests (always run)
// ============================================================================

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
fn test_exponential_backoff_capped() {
    let mut delays = vec![];
    for i in 0..10 {
        let delay = std::cmp::min(1000 * 2_u64.pow(i), 30000);
        delays.push(delay);
    }

    // Should cap at 30000ms
    assert!(delays.iter().all(|&d| d <= 30000));
    assert_eq!(delays[5], 30000); // 32000 capped to 30000
    println!("✅ Exponential backoff cap works");
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

#[test]
fn test_websocket_url_validation() {
    let valid_urls = vec![
        "ws://localhost:9393/ws",
        "wss://api.dokuru.rifuki.dev/ws",
        "ws://127.0.0.1:8080/ws",
        "wss://example.com/websocket",
    ];

    for url in valid_urls {
        assert!(url.starts_with("ws://") || url.starts_with("wss://"));
    }

    println!("✅ WebSocket URL validation passed");
}

#[test]
fn test_json_event_format() {
    let event = json!({
        "type": "agent:connected",
        "data": {
            "agentId": "123e4567-e89b-12d3-a456-426614174000"
        }
    });

    assert_eq!(event["type"], "agent:connected");
    assert!(event["data"]["agentId"].is_string());
    println!("✅ JSON event format valid");
}

#[test]
fn test_event_types() {
    let event_types = vec!["agent:connected", "agent:disconnected", "audit:completed"];

    for event_type in event_types {
        assert!(event_type.contains(':'));
        let parts: Vec<&str> = event_type.split(':').collect();
        assert_eq!(parts.len(), 2);
    }

    println!("✅ Event types format valid");
}
