import { useEffect, useMemo, useRef, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import apiClient from "@/lib/api/axios-instance";
import { wsApiUrl } from "@/lib/api/api-config";
import { useAuthStore } from "@/stores/use-auth-store";

export interface DockerEvent {
  type: string;
  action: string;
  actor: {
    id: string;
    attributes: Record<string, string>;
  };
  time: number;
}

interface UseDockerEventsOptions {
  enabled?: boolean;
  maxEvents?: number;
  /** How many seconds of history to pre-load on connect. Default: 3600 (1 hour). */
  historySecs?: number;
}

export function useDockerEvents(agentUrl: string, agentToken: string, options: UseDockerEventsOptions = {}) {
  const { enabled = true, maxEvents = 1000, historySecs = 3600 } = options;
  const accessToken = useAuthStore((s) => s.accessToken);
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const eventsRef = useRef<DockerEvent[]>([]);
  // Track which agent URL we last loaded history for so we don't double-load
  const historyLoadedForRef = useRef<string>("");

  const isRelay = agentUrl === "relay";
  const wsUrl = useMemo(() => {
    if (!agentUrl || !agentToken) return null;
    if (isRelay) {
      if (!accessToken) return null;
      return `${wsApiUrl}/agents/${agentToken}/docker/events/stream?access_token=${encodeURIComponent(accessToken)}`;
    }

    return agentUrl.replace(/^http/, "ws") + "/docker/events/stream" +
      `?token=${encodeURIComponent(agentToken)}`;
  }, [accessToken, agentToken, agentUrl, isRelay]);

  // Clear events when agent changes - schedule as microtask to avoid sync setState in effect
  useEffect(() => {
    eventsRef.current = [];
    historyLoadedForRef.current = "";
    Promise.resolve().then(() => setEvents([]));
  }, [agentUrl, agentToken]);

  const { lastMessage, readyState } = useWebSocket(
    wsUrl,
    {
      shouldReconnect: () => enabled,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
    },
    enabled && !!wsUrl,
  );

  // On first successful connection, load the last `historySecs` of events
  // from the REST endpoint so the list isn't empty.
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    if (!agentUrl || !agentToken) return;
    const historyKey = `${agentUrl}:${agentToken}`;
    if (historyLoadedForRef.current === historyKey) return; // already loaded
    historyLoadedForRef.current = historyKey;

    const until = Math.floor(Date.now() / 1000);
    const since = until - historySecs;
    const historyRequest = isRelay
      ? apiClient.get<DockerEvent[]>(`/agents/${agentToken}/docker/events`, { params: { since, until } }).then((r) => r.data)
      : fetch(`${agentUrl}/docker/events?since=${since}&until=${until}`, {
          headers: { Authorization: `Bearer ${agentToken}` },
        }).then((r) => r.json() as Promise<DockerEvent[]>);

    historyRequest
      .then((data: DockerEvent[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        // Merge with any live events that may have arrived already,
        // deduplicate by (time + type + action + actor.id), sort newest first.
        const merged = [...eventsRef.current, ...data];
        const seen = new Set<string>();
        const deduped = merged
          .filter((e) => {
            const key = `${e.time}|${e.type}|${e.action}|${e.actor.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.time - a.time)
          .slice(0, maxEvents);
        eventsRef.current = deduped;
        setEvents([...deduped]);
      })
      .catch(() => { /* ignore — live stream still works */ });
  }, [readyState, agentUrl, agentToken, isRelay, historySecs, maxEvents]);

  // Append each live event that arrives via WebSocket.
  useEffect(() => {
    if (!lastMessage?.data) return;
    try {
      const event: DockerEvent = JSON.parse(lastMessage.data as string);
      // Deduplicate against what we already have (edge case: history load race)
      const key = `${event.time}|${event.type}|${event.action}|${event.actor.id}`;
      const duplicate = eventsRef.current.some(
        (e) => `${e.time}|${e.type}|${e.action}|${e.actor.id}` === key,
      );
      if (duplicate) return;
      eventsRef.current = [event, ...eventsRef.current].slice(0, maxEvents);
      setEvents([...eventsRef.current]);
    } catch {
      // not a JSON event frame (e.g. ping) — ignore
    }
  }, [lastMessage, maxEvents]);

  const clearEvents = () => {
    eventsRef.current = [];
    historyLoadedForRef.current = "";
    setEvents([]);
  };

  return {
    events,
    clearEvents,
    isConnected: readyState === ReadyState.OPEN,
    isConnecting: readyState === ReadyState.CONNECTING,
  };
}
