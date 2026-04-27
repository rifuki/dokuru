import { useEffect } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentStore } from "@/stores/use-agent-store";

export function useRealtimeAgents() {
    const { status, lastMessage } = useWebSocket();
    const queryClient = useQueryClient();
    const { setAgentOnline, agents } = useAgentStore();

    useEffect(() => {
        if (!lastMessage) return;

        try {
            const data = JSON.parse(lastMessage.data);

            switch (data.type) {
                case "agent:connected": {
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    const agentId = data.data?.agentId as string | undefined;
                    if (agentId) {
                        // Only update online status for relay agents.
                        // Direct/cloudflare agents are managed by useAgentConnections
                        // via their own per-agent WS — letting both sources write the
                        // same flag causes a race that makes the card flicker.
                        const agent = agents.find((a) => a.id === agentId);
                        console.log(`[Relay] agent:connected → ${agent?.name ?? agentId} (mode=${agent?.access_mode})`);
                        if (agent?.access_mode === "relay") {
                            setAgentOnline(agentId, true);
                        }
                    }
                    break;
                }

                case "agent:disconnected": {
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    const agentId = data.data?.agentId as string | undefined;
                    if (agentId) {
                        const agent = agents.find((a) => a.id === agentId);
                        console.log(`[Relay] agent:disconnected → ${agent?.name ?? agentId} (mode=${agent?.access_mode})`);
                        if (agent?.access_mode === "relay") {
                            setAgentOnline(agentId, false);
                        }
                    }
                    break;
                }

                case "agent:updated":
                    void queryClient.invalidateQueries({ queryKey: ["agents"] });
                    break;

                case "audit:completed":
                    void queryClient.invalidateQueries({
                        queryKey: ["agent", data.agentId, "audits"]
                    });
                    break;

                case "notifications:updated":
                    break;

                default:
                    console.log("Unknown WebSocket message:", data);
            }
        } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
        }
    }, [lastMessage, queryClient, setAgentOnline, agents]);

    return { status };
}
