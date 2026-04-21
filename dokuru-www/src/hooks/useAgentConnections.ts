import { useEffect, useRef } from "react";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import type { Agent } from "@/types/agent";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 30_000;

/**
 * Maintains one WebSocket connection per non-relay agent.
 *
 * On connect  → marks agent online  immediately.
 * On close    → marks agent offline immediately, schedules reconnect
 *               with exponential backoff (2s → 4s → 8s … capped at 30s).
 *
 * Relay agents are excluded — their status comes from the backend WS
 * (agent:connected / agent:disconnected events in useRealtimeAgents).
 *
 * Auth: token is passed as ?token= query param because browsers cannot
 * set the Authorization header during a WebSocket upgrade.
 */
export function useAgentConnections(agents: Agent[]) {
    const { setAgentOnline } = useAgentStore();

    // Use refs so closures always see current values without re-running effect.
    const setOnlineRef   = useRef(setAgentOnline);
    setOnlineRef.current = setAgentOnline;

    const wsMap      = useRef(new Map<string, WebSocket>());
    const timerMap   = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const attemptMap = useRef(new Map<string, number>());

    // Keep a stable ref to the agents list for use inside ws callbacks.
    const agentsRef   = useRef(agents);
    agentsRef.current = agents;

    // Sync connections whenever the set of agents (or their URLs) changes.
    // Does NOT close existing connections — only adds new ones and removes
    // stale ones.  Unmount cleanup is handled by the effect below.
    useEffect(() => {
        const eligible = agents.filter(
            (a) => a.access_mode !== "relay" && a.url && a.url !== "relay",
        );
        const eligibleIds = new Set(eligible.map((a) => a.id));

        // Tear down connections for agents that were removed or whose URL changed.
        for (const [id, ws] of wsMap.current) {
            const agent = eligible.find((a) => a.id === id);
            const expectedWsUrl = agent
                ? agent.url.replace(/^http/, "ws") + "/ws"
                : null;
            const urlChanged = expectedWsUrl && !ws.url.startsWith(expectedWsUrl);

            if (!eligibleIds.has(id) || urlChanged) {
                ws.onclose = null; // prevent reconnect loop
                ws.close();
                wsMap.current.delete(id);
                clearReconnect(id);
            }
        }

        // Open connections for new agents (existing open/connecting ones are skipped).
        for (const agent of eligible) {
            const existing = wsMap.current.get(agent.id);
            if (existing && existing.readyState <= WebSocket.OPEN) continue;
            openWs(agent);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agents.map((a) => a.id + a.url).join(",")]);

    // Close all connections only when the hook unmounts (sidebar leaves DOM).
    useEffect(() => {
        return () => {
            for (const ws of wsMap.current.values()) {
                ws.onclose = null;
                ws.close();
            }
            for (const timer of timerMap.current.values()) clearTimeout(timer);
            wsMap.current.clear();
            timerMap.current.clear();
            attemptMap.current.clear();
        };
    }, []);

    function openWs(agent: Agent) {
        const token  = agent.token ?? getAgentToken(agent.id) ?? "";
        const wsUrl  = agent.url.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;

        const ws = new WebSocket(wsUrl);
        wsMap.current.set(agent.id, ws);

        ws.onopen = () => {
            setOnlineRef.current(agent.id, true);
            attemptMap.current.set(agent.id, 0);
        };

        ws.onclose = () => {
            setOnlineRef.current(agent.id, false);
            wsMap.current.delete(agent.id);
            scheduleReconnect(agent.id);
        };

        // onerror always fires before onclose; handle in onclose only.
        ws.onerror = () => {};
    }

    function scheduleReconnect(agentId: string) {
        clearReconnect(agentId);

        const attempt = attemptMap.current.get(agentId) ?? 0;
        const delay   = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attemptMap.current.set(agentId, attempt + 1);

        const timer = setTimeout(() => {
            timerMap.current.delete(agentId);
            // Look up the latest agent data when reconnecting.
            const agent = agentsRef.current.find((a) => a.id === agentId);
            if (agent) openWs(agent);
        }, delay);

        timerMap.current.set(agentId, timer);
    }

    function clearReconnect(agentId: string) {
        const timer = timerMap.current.get(agentId);
        if (timer !== undefined) {
            clearTimeout(timer);
            timerMap.current.delete(agentId);
        }
    }
}
