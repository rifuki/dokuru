#[cfg(test)]
mod tests {
    use crate::websocket::{WsEvent, WsManager};
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn test_ws_manager_new() {
        let manager = WsManager::new();
        assert_eq!(manager.clients.len(), 0);
    }

    #[test]
    fn test_ws_manager_default() {
        let manager = WsManager::default();
        assert_eq!(manager.clients.len(), 0);
    }

    #[test]
    fn test_ws_event_serialization() {
        let event = WsEvent {
            r#type: "test:event".to_string(),
            data: json!({"key": "value"}),
        };

        let serialized = serde_json::to_string(&event).unwrap();
        assert!(serialized.contains("test:event"));
        assert!(serialized.contains("key"));
        assert!(serialized.contains("value"));
    }

    #[test]
    fn test_broadcast_agent_connected() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();

        // Should not panic
        manager.broadcast_agent_connected(agent_id);
    }

    #[test]
    fn test_broadcast_agent_disconnected() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();

        // Should not panic
        manager.broadcast_agent_disconnected(agent_id);
    }

    #[test]
    fn test_broadcast_audit_completed() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();
        let audit_id = Uuid::new_v4();

        // Should not panic
        manager.broadcast_audit_completed(agent_id, audit_id);
    }

    #[test]
    fn test_broadcast_custom_event() {
        let manager = WsManager::new();
        let event = WsEvent {
            r#type: "custom:event".to_string(),
            data: json!({"test": true}),
        };

        // Should not panic
        manager.broadcast(event);
    }

    #[test]
    fn test_ws_event_agent_connected_format() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();

        let mut rx = manager.tx.subscribe();
        manager.broadcast_agent_connected(agent_id);

        let event = rx.try_recv().unwrap();
        assert_eq!(event.r#type, "agent:connected");
        assert_eq!(event.data["agentId"], agent_id.to_string());
    }

    #[test]
    fn test_ws_event_agent_disconnected_format() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();

        let mut rx = manager.tx.subscribe();
        manager.broadcast_agent_disconnected(agent_id);

        let event = rx.try_recv().unwrap();
        assert_eq!(event.r#type, "agent:disconnected");
        assert_eq!(event.data["agentId"], agent_id.to_string());
    }

    #[test]
    fn test_ws_event_audit_completed_format() {
        let manager = WsManager::new();
        let agent_id = Uuid::new_v4();
        let audit_id = Uuid::new_v4();

        let mut rx = manager.tx.subscribe();
        manager.broadcast_audit_completed(agent_id, audit_id);

        let event = rx.try_recv().unwrap();
        assert_eq!(event.r#type, "audit:completed");
        assert_eq!(event.data["agentId"], agent_id.to_string());
        assert_eq!(event.data["auditId"], audit_id.to_string());
    }

    #[test]
    fn test_multiple_subscribers() {
        let manager = WsManager::new();
        let mut rx1 = manager.tx.subscribe();
        let mut rx2 = manager.tx.subscribe();

        let event = WsEvent {
            r#type: "test".to_string(),
            data: json!({"msg": "hello"}),
        };

        manager.broadcast(event);

        // Both subscribers should receive the event
        let event1 = rx1.try_recv().unwrap();
        let event2 = rx2.try_recv().unwrap();

        assert_eq!(event1.r#type, "test");
        assert_eq!(event2.r#type, "test");
    }

    #[test]
    fn test_broadcast_channel_capacity() {
        let manager = WsManager::new();
        let mut rx = manager.tx.subscribe();

        // Send 100 events (channel capacity)
        for i in 0..100 {
            manager.broadcast(WsEvent {
                r#type: format!("event:{i}"),
                data: json!({"index": i}),
            });
        }

        // Should receive all events
        for i in 0..100 {
            let event = rx.try_recv().unwrap();
            assert_eq!(event.r#type, format!("event:{i}"));
        }
    }

    #[test]
    fn test_ws_manager_clone() {
        let manager1 = WsManager::new();
        let manager2 = manager1.clone();

        let agent_id = Uuid::new_v4();
        let mut rx = manager2.tx.subscribe();

        manager1.broadcast_agent_connected(agent_id);

        let event = rx.try_recv().unwrap();
        assert_eq!(event.r#type, "agent:connected");
    }

    #[test]
    fn test_empty_broadcast_no_panic() {
        let manager = WsManager::new();
        // No subscribers, should not panic
        manager.broadcast(WsEvent {
            r#type: "test".to_string(),
            data: json!({}),
        });
    }

    #[test]
    fn test_ws_event_json_serialization() {
        let event = WsEvent {
            r#type: "agent:connected".to_string(),
            data: json!({
                "agentId": "123e4567-e89b-12d3-a456-426614174000",
                "timestamp": "2026-04-21T06:00:00Z"
            }),
        };

        let json = serde_json::to_string(&event).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["type"], "agent:connected");
        assert_eq!(
            parsed["data"]["agentId"],
            "123e4567-e89b-12d3-a456-426614174000"
        );
    }

    #[test]
    fn test_concurrent_broadcasts() {
        use std::sync::Arc;

        let manager = Arc::new(WsManager::new());
        let mut handles = vec![];

        // Spawn 10 threads broadcasting concurrently
        for i in 0..10 {
            let m = Arc::clone(&manager);
            let handle = std::thread::spawn(move || {
                m.broadcast(WsEvent {
                    r#type: format!("thread:{i}"),
                    data: json!({"thread": i}),
                });
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // Should not panic
        assert_eq!(manager.clients.len(), 0);
    }
}
