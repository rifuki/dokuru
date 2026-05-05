import { useEffect, useRef } from "react";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import { agentDirectApi, type DockerInfo } from "@/lib/api/agent-direct";
import {
    classifyAgentConnectionError,
    classifyWebSocketClose,
    connectionIssueSummary,
    dockerUnavailableIssue,
    missingTokenIssue,
    type AgentConnectionIssue,
} from "@/lib/agent-connection-errors";
import type { Agent } from "@/types/agent";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS  = 30_000;

/**
 * Maintains one WebSocket connection per non-relay agent.
 *
 * On connecting → marks agent as "connecting" (blinking blue state).
 * On connect   → marks agent online, clears connecting state.
 * On close     → classifies the failure. Retryable network/tunnel failures
 *                reconnect with exponential backoff; token/auth failures stop.
 *
 * Relay agents are excluded — their status comes from the backend WS
 * (agent:connected / agent:disconnected events in useRealtimeAgents).
 */
export function useAgentConnections(agents: Agent[]) {
    const { setAgentOnline, setAgentConnecting, setAgentConnectionError, setAgentInfo, setAgentInfoError } = useAgentStore();

    const setOnlineRef      = useRef(setAgentOnline);
    const setConnectingRef  = useRef(setAgentConnecting);
    const setConnErrRef     = useRef(setAgentConnectionError);
    const setInfoRef        = useRef(setAgentInfo);
    const setInfoErrRef     = useRef(setAgentInfoError);

    const wsMap      = useRef(new Map<string, WebSocket>());
    const timerMap   = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const attemptMap = useRef(new Map<string, number>());

    const agentsRef   = useRef(agents);

    useEffect(() => {
        setOnlineRef.current     = setAgentOnline;
        setConnectingRef.current = setAgentConnecting;
        setConnErrRef.current    = setAgentConnectionError;
        setInfoRef.current       = setAgentInfo;
        setInfoErrRef.current    = setAgentInfoError;
        agentsRef.current = agents;
    });

    const clearReconnect = (agentId: string) => {
        const timer = timerMap.current.get(agentId);
        if (timer !== undefined) {
            clearTimeout(timer);
            timerMap.current.delete(agentId);
        }
    };

    const scheduleReconnect = (agentId: string, issue?: AgentConnectionIssue) => {
        clearReconnect(agentId);

        if (issue && !issue.retryable) {
            attemptMap.current.set(agentId, 0);
            const agent = agentsRef.current.find((a) => a.id === agentId);
            console.warn(`[WS] retry paused → ${agent?.name ?? agentId}: ${connectionIssueSummary(issue)}`);
            return;
        }

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
            const issue = classifyWebSocketClose(ev.code, ev.reason, agent.access_mode);
            console.warn(
                `[WS] closed     → ${agent.name}  code=${ev.code} wasClean=${ev.wasClean}` +
                (ev.reason ? `  reason="${ev.reason}"` : ""),
            );
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, false);
            setConnErrRef.current(agent.id, issue);
            wsMap.current.delete(agent.id);
            scheduleReconnect(agent.id, issue);
        };

        ws.onerror = (ev) => {
            console.error(`[WS] error      → ${agent.name}`, ev);
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as AgentWsMessage;
                if (msg.type === "ping") {
                    console.debug(`[WS] ping       ← ${agent.name}`);
                } else if (msg.type === "info:update") {
                    setInfoRef.current(agent.id, msg.data);
                } else if (msg.type === "info:error") {
                    setInfoErrRef.current(agent.id, msg.message);
                    setConnErrRef.current(agent.id, dockerUnavailableIssue(msg.message));
                }
            } catch { /* ignore non-JSON */ }
        };
    };

    const openWs = (agent: Agent) => {
        const token  = agent.token ?? getAgentToken(agent.id) ?? "";
        const wsUrl  = agent.url.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;

        console.log(`[WS] connecting → ${agent.name} (${wsUrl.split("?")[0]})`);

        if (!token) {
            const issue = missingTokenIssue();
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, false);
            setInfoErrRef.current(agent.id, connectionIssueSummary(issue));
            setConnErrRef.current(agent.id, issue);
            scheduleReconnect(agent.id, issue);
            return;
        }

        // Mark as connecting immediately so UI shows pulsing blue state.
        setConnectingRef.current(agent.id, true);
        setConnErrRef.current(agent.id, null);

        // Protected preflight gives us real HTTP status codes before WebSocket.
        // Browser WebSocket failures hide 401/403 details, which caused bad-token
        // agents to reconnect forever.
        agentDirectApi.getInfo(agent.url, token)
        .then((info) => {
            setInfoRef.current(agent.id, info);
            connectWebSocket(agent, wsUrl);
        })
        .catch((err) => {
            const issue = classifyAgentConnectionError(err, {
                accessMode: agent.access_mode,
                endpoint: "info",
            });
            console.error(`[WS] pre-check failed → ${agent.name}:`, err);
            setConnectingRef.current(agent.id, false);
            setOnlineRef.current(agent.id, false);
            setInfoErrRef.current(agent.id, connectionIssueSummary(issue));
            setConnErrRef.current(agent.id, issue);

            if (issue.code === "agent_error" || issue.code === "docker_unavailable") {
                connectWebSocket(agent, wsUrl);
                return;
            }

            scheduleReconnect(agent.id, issue);
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

type AgentWsMessage =
    | { type: "ping" }
    | { type: "info:update"; reason?: string; data: DockerInfo }
    | { type: "info:error"; message: string };
