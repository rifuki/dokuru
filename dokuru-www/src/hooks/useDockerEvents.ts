import { useEffect, useRef, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

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
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const eventsRef = useRef<DockerEvent[]>([]);
  // Track which agent URL we last loaded history for so we don't double-load
  const historyLoadedForRef = useRef<string>("");

  const wsUrl = agentUrl.replace(/^http/, "ws") + "/docker/events/stream" +
    (agentToken ? `?token=${encodeURIComponent(agentToken)}` : "");

  // Clear events when agent changes - schedule as microtask to avoid sync setState in effect
  useEffect(() => {
    eventsRef.current = [];
    historyLoadedForRef.current = "";
    Promise.resolve().then(() => setEvents([]));
  }, [agentUrl]);

  const { lastMessage, readyState } = useWebSocket(
    wsUrl,
    {
      shouldReconnect: () => enabled,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
    },
    enabled && !!agentUrl && !!agentToken,
  );

  // On first successful connection, load the last `historySecs` of events
  // from the REST endpoint so the list isn't empty.
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    if (!agentUrl || !agentToken) return;
    if (historyLoadedForRef.current === agentUrl) return; // already loaded
    historyLoadedForRef.current = agentUrl;

    const since = Math.floor(Date.now() / 1000) - historySecs;
    fetch(`${agentUrl}/docker/events?since=${since}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    })
      .then((r) => r.json())
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyState, agentUrl, agentToken]);

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
