import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface WebSocketContextType {
    status: ConnectionStatus;
    send: (data: unknown) => void;
    lastMessage: MessageEvent | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within WebSocketProvider");
    }
    return context;
}

interface WebSocketProviderProps {
    children: ReactNode;
    url: string;
    enabled?: boolean;
}

export function WebSocketProvider({ children, url, enabled = true }: WebSocketProviderProps) {
    const [status, setStatus] = useState<ConnectionStatus>("disconnected");
    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;

    const connect = () => {
        if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

        setStatus("connecting");

        try {
            // Try WSS first (Cloudflare), fallback to HTTPS
            const wsUrl = url.replace(/^http/, "ws");
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                setStatus("connected");
                reconnectAttemptsRef.current = 0;
                console.log("✅ WebSocket connected:", wsUrl);
            };

            wsRef.current.onmessage = (event) => {
                setLastMessage(event);
            };

            wsRef.current.onerror = (error) => {
                console.error("❌ WebSocket error:", error);
                setStatus("error");
            };

            wsRef.current.onclose = () => {
                setStatus("disconnected");
                console.log("🔌 WebSocket disconnected");

                // Auto-reconnect with exponential backoff
                if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
                    reconnectAttemptsRef.current++;
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log(`🔄 Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
                        connect();
                    }, delay);
                } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                    toast.error("WebSocket connection failed", {
                        description: "Falling back to HTTP polling"
                    });
                }
            };
        } catch (error) {
            console.error("Failed to create WebSocket:", error);
            setStatus("error");
        }
    };

    const send = (data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        } else {
            console.warn("WebSocket not connected, message not sent");
        }
    };

    useEffect(() => {
        if (enabled) {
            connect();
        }

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [url, enabled]);

    return (
        <WebSocketContext.Provider value={{ status, send, lastMessage }}>
            {children}
        </WebSocketContext.Provider>
    );
}
