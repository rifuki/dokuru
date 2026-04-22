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
}

export function useDockerEvents(agentUrl: string, options: UseDockerEventsOptions = {}) {
  const { enabled = true, maxEvents = 1000 } = options;
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const eventsRef = useRef<DockerEvent[]>([]);

  const wsUrl = agentUrl.replace(/^http/, "ws") + "/docker/events/stream";

  const { lastMessage, readyState } = useWebSocket(
    wsUrl,
    {
      shouldReconnect: () => enabled,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
    },
    enabled
  );

  useEffect(() => {
    if (lastMessage?.data) {
      try {
        const event: DockerEvent = JSON.parse(lastMessage.data);
        eventsRef.current = [event, ...eventsRef.current].slice(0, maxEvents);
        setEvents([...eventsRef.current]);
      } catch (error) {
        console.error("Failed to parse event:", error);
      }
    }
  }, [lastMessage, maxEvents]);

  const clearEvents = () => {
    eventsRef.current = [];
    setEvents([]);
  };

  return {
    events,
    clearEvents,
    isConnected: readyState === ReadyState.OPEN,
    isConnecting: readyState === ReadyState.CONNECTING,
  };
}
