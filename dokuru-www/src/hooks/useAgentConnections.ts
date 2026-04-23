import { useEffect, useRef } from "react";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import type { Agent } from "@/types/agent";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 30_000;

/**
 * Maintains one WebSocket connection per non-relay agent.
 *
 * On connecting → marks agent as "connecting" (blinking blue state).
 * On connect   → marks agent online, clears connecting state.
 * On close     → marks agent offline, clears connecting state,
 *                schedules reconnect with exponential backoff (2s → 4s → … → 30s).
 *
 * Relay agents are excluded — their status comes from the backend WS
 * (agent:connected / agent:disconnected events in useRealtimeAgents).
 */
export function useAgentConnections(agents: Agent[]) {
    const { setAgentOnline, setAgentConnecting, setAgentConnectionError } = useAgentStore();

    const setOnlineRef      = useRef(setAgentOnline);
    const setConnectingRef  = useRef(setAgentConnecting);
    const setConnErrRef     = useRef(setAgentConnectionError);

    const wsMap      = useRef(new Map<string, WebSocket>());
    const timerMap   = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const attemptMap = useRef(new Map<string, number>());

    const agentsRef   = useRef(agents);

    useEffect(() => {
        setOnlineRef.current     = setAgentOnline;
        setConnectingRef.current = setAgentConnecting;
        setConnErrRef.current    = setAgentConnectionError;
        agentsRef.current = agents;
    });

    const clearReconnect = (agentId: string) => {
        const timer = timerMap.current.get(agentId);
        if (timer !== undefined) {
            clearTimeout(timer);
            timerMap.current.delete(agentId);
        }
    };

    const scheduleReconnect = (agentId: string) => {
        clearReconnect(agentId);

        const attempt = attemptMap.current.get(agentId) ?? 0;
        const delay   = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attemptMap.current.set(agentId, attempt + 1);

        const agent = agentsRef.current.find((a) => a.id === agentId);
        const name  = agent?.name ?? agentId;
        console.log(`[WS] reconnect  → ${name} in ${delay}ms (attempt ${attempt + 1})`);

        const timer = setTimeout(() => {
            timerMap.current.delete(agentId);
            const latestAgent = agentsRef.current.find((a) => a.id === agentId);
            if (latestAgent) openWs(latestAgent);
        }, delay);

        timerMap.current.set(agentId, timer);
    };

    const connectWebSocket = (agent: Agent, wsUrl: string) => {
        const ws = new WebSocket(wsUrl);
        wsMap.current.set(agent.id, ws);

        ws.onopen = () => {
            const attempt = attemptMap.current.get(agent.id) ?? 0;
            console.log(`[WS] connected  → ${agent.name} (attempt ${attempt})`);
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, true);
            setConnErrRef.current(agent.id, null);
            attemptMap.current.set(agent.id, 0);
        };

        ws.onclose = (ev) => {
            const reason = ev.reason || resolveCloseReason(ev.code);
            console.warn(
                `[WS] closed     → ${agent.name}  code=${ev.code} wasClean=${ev.wasClean}` +
                (ev.reason ? `  reason="${ev.reason}"` : ""),
            );
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, false);
            if (!ev.wasClean) {
                setConnErrRef.current(agent.id, reason);
            }
            wsMap.current.delete(agent.id);
            scheduleReconnect(agent.id);
        };

        ws.onerror = (ev) => {
            console.error(`[WS] error      → ${agent.name}`, ev);
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as { type: string };
                if (msg.type === "ping") {
                    console.debug(`[WS] ping       ← ${agent.name}`);
                }
            } catch { /* ignore non-JSON */ }
        };
    };

    const openWs = (agent: Agent) => {
        const token  = agent.token ?? getAgentToken(agent.id) ?? "";
        const wsUrl  = agent.url.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;

        console.log(`[WS] connecting → ${agent.name} (${wsUrl.split("?")[0]})`);

        // Mark as connecting immediately so UI shows pulsing blue state.
        setConnectingRef.current(agent.id, true);
        setConnErrRef.current(agent.id, null);

        // First, test HTTP endpoint to get better error messages
        const httpUrl = agent.url + "/health";
        fetch(httpUrl, { 
            method: "GET",
            signal: AbortSignal.timeout(5000)
        })
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            // Health check passed, now try WebSocket
            connectWebSocket(agent, wsUrl);
        })
        .catch((err) => {
            console.error(`[WS] pre-check failed → ${agent.name}:`, err);
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, false);
            
            // Better error messages
            let errorMsg = "Connection failed";
            if (err.name === "AbortError" || err.message.includes("timeout")) {
                errorMsg = "Connection timeout - agent unreachable";
            } else if (err.message.includes("404")) {
                errorMsg = "Agent not found (404) - check URL";
            } else if (err.message.includes("401") || err.message.includes("403")) {
                errorMsg = "Authentication failed - check token";
            } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
                errorMsg = "Network error - agent offline or URL invalid";
            } else {
                errorMsg = err.message || "Unknown error";
            }
            
            setConnErrRef.current(agent.id, errorMsg);
            scheduleReconnect(agent.id);
        });
    };

    useEffect(() => {
        const eligible = agents.filter(
            (a) => a.access_mode !== "relay" && a.url && a.url !== "relay",
        );
        const eligibleIds = new Set(eligible.map((a) => a.id));

        for (const [id, ws] of wsMap.current) {
            const agent = eligible.find((a) => a.id === id);
            const expectedWsUrl = agent
                ? agent.url.replace(/^http/, "ws") + "/ws"
                : null;
            const urlChanged = expectedWsUrl && !ws.url.startsWith(expectedWsUrl);

            const currentToken = agent ? (agent.token ?? getAgentToken(agent.id) ?? "") : "";
            const tokenChanged = expectedWsUrl &&
                !ws.url.includes(`token=${encodeURIComponent(currentToken)}`);

            if (!eligibleIds.has(id) || urlChanged || tokenChanged) {
                ws.onclose = null;
                ws.close();
                wsMap.current.delete(id);
                clearReconnect(id);
                setConnectingRef.current(id, false);
            }
        }

        for (const agent of eligible) {
            const existing = wsMap.current.get(agent.id);
            if (existing && existing.readyState <= WebSocket.OPEN) continue;
            openWs(agent);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agents.map((a) => a.id + a.url + (a.token ?? "")).join(",")]);

    useEffect(() => {
        const ws = wsMap.current;
        const timers = timerMap.current;
        const attempts = attemptMap.current;
        return () => {
            for (const [id, socket] of ws) {
                socket.onclose = null;
                socket.close();
                setConnectingRef.current(id, false);
            }
            for (const timer of timers.values()) clearTimeout(timer);
            ws.clear();
            timers.clear();
            attempts.clear();
        };
    }, []);
}

function resolveCloseReason(code: number): string {
    switch (code) {
        case 1000: return "Connection closed normally";
        case 1001: return "Agent going away";
        case 1006: return "Connection lost - agent offline or network error";
        case 1008: return "Policy violation - check token or permissions";
        case 1011: return "Agent internal error";
        case 1012: return "Agent restarting";
        case 4001: return "Authentication failed - invalid token";
        case 4003: return "Access denied - insufficient permissions";
        case 4004: return "Agent not found - check URL";
        default:   return `Connection closed (code ${code})`;
    }
}
