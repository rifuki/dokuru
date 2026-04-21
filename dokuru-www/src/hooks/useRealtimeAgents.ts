import { useEffect } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentStore } from "@/stores/use-agent-store";

export function useRealtimeAgents() {
    const { status, lastMessage } = useWebSocket();
    const queryClient = useQueryClient();
    const { setAgentOnline } = useAgentStore();

    useEffect(() => {
        if (!lastMessage) return;

        try {
            const data = JSON.parse(lastMessage.data);

            switch (data.type) {
                case "agent:connected":
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    if (data.data?.agentId) setAgentOnline(data.data.agentId, true);
                    break;

                case "agent:disconnected":
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    if (data.data?.agentId) setAgentOnline(data.data.agentId, false);
                    break;

                case "agent:updated":
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    break;

                case "audit:completed":
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
    }, [lastMessage, queryClient, setAgentOnline]);

    return { status };
}
