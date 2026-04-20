import { useEffect } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Example hook for real-time agent updates via WebSocket
 * Usage: const { status } = useRealtimeAgents();
 */
export function useRealtimeAgents() {
    const { status, lastMessage } = useWebSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!lastMessage) return;

        try {
            const data = JSON.parse(lastMessage.data);

            // Handle different message types
            switch (data.type) {
                case "agent:connected":
                case "agent:disconnected":
                case "agent:updated":
                    // Invalidate agents query to refetch
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    break;

                case "audit:completed":
                    // Invalidate specific agent audits
                    void queryClient.invalidateQueries({ 
                        queryKey: ["agent", data.agentId, "audits"] 
                    });
                    break;

                default:
                    console.log("Unknown WebSocket message:", data);
            }
        } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
        }
    }, [lastMessage, queryClient]);

    return { status };
}
