/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface WebSocketContextType {
    status: ConnectionStatus;
    send: (data: unknown) => void;
    lastMessage: MessageEvent | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
    children: ReactNode;
    url: string;
    enabled?: boolean;
}

export function WebSocketProvider({ children, url, enabled = true }: WebSocketProviderProps) {
    const [status, setStatus] = useState<ConnectionStatus>("disconnected");
    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const connectRef = useRef<(() => void) | null>(null);
    const isCleaningUpRef = useRef(false);

    const send = useCallback((data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    useEffect(() => {
        isCleaningUpRef.current = false;

        const connect = () => {
            if (!enabled || wsRef.current?.readyState === WebSocket.OPEN || isCleaningUpRef.current) return;

            setStatus("connecting");

            try {
                const wsUrl = url.replace(/^http/, "ws");
                wsRef.current = new WebSocket(wsUrl);

                wsRef.current.onopen = () => {
                    if (isCleaningUpRef.current) return;
                    setStatus("connected");
                    reconnectAttemptsRef.current = 0;
                };

                wsRef.current.onmessage = (event) => {
                    if (isCleaningUpRef.current) return;
                    setLastMessage(event);
                };

                wsRef.current.onerror = () => {
                    if (isCleaningUpRef.current) return;
                    setStatus("error");
                };

                wsRef.current.onclose = () => {
                    if (isCleaningUpRef.current) return;
                    setStatus("disconnected");

                    if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
                        reconnectAttemptsRef.current++;
                        
                        reconnectTimeoutRef.current = setTimeout(() => {
                            if (!isCleaningUpRef.current) {
                                connectRef.current?.();
                            }
                        }, delay);
                    } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                        toast.error("WebSocket connection failed", {
                            description: "Falling back to HTTP polling"
                        });
                    }
                };
            } catch {
                if (!isCleaningUpRef.current) {
                    setStatus("error");
                }
            }
        };

        connectRef.current = connect;

        if (enabled) {
            connect();
        }

        return () => {
            isCleaningUpRef.current = true;
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

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within WebSocketProvider");
    }
    return context;
}
