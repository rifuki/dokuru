/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

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
    const wsUrl = url.replace(/^http/, "ws");
    
    const { sendJsonMessage, lastMessage, readyState } = useWebSocket(
        wsUrl,
        {
            shouldReconnect: () => enabled,
            reconnectAttempts: 5,
            reconnectInterval: (attemptNumber: number) => Math.min(1000 * Math.pow(2, attemptNumber), 30000),
            share: false,
        },
        enabled
    );

    // Map ReadyState to our ConnectionStatus
    const statusMap: Record<ReadyState, ConnectionStatus> = {
        [ReadyState.CONNECTING]: "connecting",
        [ReadyState.OPEN]: "connected",
        [ReadyState.CLOSING]: "disconnected",
        [ReadyState.CLOSED]: "disconnected",
        [ReadyState.UNINSTANTIATED]: "disconnected",
    };
    const status = statusMap[readyState];

    const send = (data: unknown) => {
        sendJsonMessage(data);
    };

    return (
        <WebSocketContext.Provider value={{ status, send, lastMessage }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocketContext must be used within WebSocketProvider");
    }
    return context;
}

// Alias for backward compatibility
export { useWebSocketContext as useWebSocket };
