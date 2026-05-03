import { useEffect, useMemo, useState } from "react";
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

type DockerEventsConfig = {
  channelKey: string;
  agentUrl: string;
  agentToken: string;
  wsUrl: string | null;
  isRelay: boolean;
  historyKey: string;
  maxEvents: number;
  historySecs: number;
};

type DockerEventsSnapshot = {
  events: DockerEvent[];
  readyState: number;
};

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;
const IDLE_DISCONNECT_MS = 10 * 60 * 1000;

function dockerEventKey(event: DockerEvent) {
  return `${event.time}|${event.type}|${event.action}|${event.actor?.id ?? ""}`;
}

function normalizeEvents(events: DockerEvent[], maxEvents: number) {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      const key = dockerEventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, maxEvents);
}

function buildDockerEventsConfig(agentUrl: string, agentToken: string, accessToken: string | null, maxEvents: number, historySecs: number): DockerEventsConfig {
  const isRelay = agentUrl === "relay";
  const hasAgentCredentials = !!agentUrl && !!agentToken;
  const wsUrl = hasAgentCredentials
    ? isRelay
      ? accessToken
        ? `${wsApiUrl}/agents/${agentToken}/docker/events/stream?access_token=${encodeURIComponent(accessToken)}`
        : null
      : `${agentUrl.replace(/^http/, "ws")}/docker/events/stream?token=${encodeURIComponent(agentToken)}`
    : null;

  return {
    channelKey: hasAgentCredentials ? `${isRelay ? "relay" : "direct"}:${agentUrl}:${agentToken}` : "disabled",
    agentUrl,
    agentToken,
    wsUrl,
    isRelay,
    historyKey: hasAgentCredentials ? `${isRelay ? "relay" : "direct"}:${agentUrl}:${agentToken}` : "disabled",
    maxEvents,
    historySecs,
  };
}

class DockerEventsChannel {
  private config: DockerEventsConfig;
  private events: DockerEvent[] = [];
  private readyState = WS_CLOSED;
  private enabled = false;
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
  private idleTimer: ReturnType<typeof window.setTimeout> | null = null;
  private historyLoadedFor = "";
  private listeners = new Set<() => void>();

  constructor(config: DockerEventsConfig) {
    this.config = config;
  }

  configure(config: DockerEventsConfig) {
    const shouldReconnect = this.config.wsUrl !== config.wsUrl || this.config.historyKey !== config.historyKey;
    this.config = config;
    if (this.events.length > config.maxEvents) {
      this.events = this.events.slice(0, config.maxEvents);
      this.notify();
    }
    if (this.enabled && shouldReconnect) {
      this.disconnect();
      this.enabled = true;
      this.connect();
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    this.clearIdleTimer();

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.scheduleIdleDisconnect();
    };
  }

  getSnapshot(): DockerEventsSnapshot {
    return {
      events: this.events,
      readyState: this.readyState,
    };
  }

  start() {
    this.enabled = true;
    this.clearIdleTimer();
    this.connect();
  }

  pause() {
    this.enabled = false;
    this.disconnect();
  }

  clearEvents() {
    this.events = [];
    this.historyLoadedFor = this.config.historyKey;
    this.notify();
  }

  private connect() {
    if (!this.enabled || !this.config.wsUrl || typeof WebSocket === "undefined") {
      this.readyState = WS_CLOSED;
      this.notify();
      return;
    }

    if (this.websocket && (this.websocket.readyState === WS_CONNECTING || this.websocket.readyState === WS_OPEN)) return;

    this.clearReconnectTimer();
    this.readyState = WS_CONNECTING;
    this.notify();

    const websocket = new WebSocket(this.config.wsUrl);
    this.websocket = websocket;

    websocket.onopen = () => {
      if (this.websocket !== websocket) return;
      this.reconnectAttempts = 0;
      this.readyState = WS_OPEN;
      this.notify();
      void this.loadHistory();
    };

    websocket.onmessage = (message) => {
      if (this.websocket !== websocket || !message.data) return;
      try {
        const event = JSON.parse(String(message.data)) as DockerEvent;
        const eventKey = dockerEventKey(event);
        if (this.events.some((existing) => dockerEventKey(existing) === eventKey)) return;
        this.events = [event, ...this.events].slice(0, this.config.maxEvents);
        this.notify();
      } catch {
        // Ignore non-event frames such as pings.
      }
    };

    websocket.onclose = () => {
      if (this.websocket !== websocket) return;
      this.websocket = null;
      this.readyState = WS_CLOSED;
      this.notify();
      if (this.enabled) this.scheduleReconnect();
    };

    websocket.onerror = () => {
      websocket.close();
    };
  }

  private disconnect() {
    this.clearReconnectTimer();
    const websocket = this.websocket;
    this.websocket = null;
    if (websocket && websocket.readyState !== WS_CLOSED) websocket.close();
    if (this.readyState !== WS_CLOSED) {
      this.readyState = WS_CLOSED;
      this.notify();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= 10 || this.reconnectTimer || !this.enabled) return;
    this.reconnectAttempts += 1;
    this.readyState = WS_CONNECTING;
    this.notify();
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleIdleDisconnect() {
    if (!this.enabled || this.idleTimer) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      this.enabled = false;
      this.historyLoadedFor = "";
      this.disconnect();
    }, IDLE_DISCONNECT_MS);
  }

  private clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async loadHistory() {
    const historyKey = this.config.historyKey;
    if (this.historyLoadedFor === historyKey || historyKey === "disabled") return;
    this.historyLoadedFor = historyKey;

    const until = Math.floor(Date.now() / 1000);
    const since = until - this.config.historySecs;

    try {
      const data = this.config.isRelay
        ? await apiClient.get<DockerEvent[]>(`/agents/${this.config.agentToken}/docker/events`, { params: { since, until } }).then((response) => response.data)
        : await fetch(`${this.config.agentUrl}/docker/events?since=${since}&until=${until}`, {
            headers: { Authorization: `Bearer ${this.config.agentToken}` },
          }).then((response) => response.json() as Promise<DockerEvent[]>);

      if (this.config.historyKey !== historyKey || !Array.isArray(data) || data.length === 0) return;
      this.events = normalizeEvents([...this.events, ...data], this.config.maxEvents);
      this.notify();
    } catch {
      // Live streaming still works if history loading fails.
    }
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

const dockerEventsChannels = new Map<string, DockerEventsChannel>();

function getDockerEventsChannel(config: DockerEventsConfig) {
  const existing = dockerEventsChannels.get(config.channelKey);
  if (existing) return existing;

  const channel = new DockerEventsChannel(config);
  dockerEventsChannels.set(config.channelKey, channel);
  return channel;
}

export function useDockerEvents(agentUrl: string, agentToken: string, options: UseDockerEventsOptions = {}) {
  const { enabled = true, maxEvents = 1000, historySecs = 3600 } = options;
  const accessToken = useAuthStore((state) => state.accessToken);
  const config = useMemo(
    () => buildDockerEventsConfig(agentUrl, agentToken, accessToken, maxEvents, historySecs),
    [accessToken, agentToken, agentUrl, historySecs, maxEvents],
  );
  const channel = useMemo(() => getDockerEventsChannel(config), [config]);
  const [snapshot, setSnapshot] = useState(() => channel.getSnapshot());

  useEffect(() => {
    let cancelled = false;
    channel.configure(config);
    const syncSnapshot = () => {
      if (!cancelled) setSnapshot(channel.getSnapshot());
    };
    const unsubscribe = channel.subscribe(syncSnapshot);
    if (enabled && config.wsUrl) channel.start();
    else channel.pause();
    queueMicrotask(syncSnapshot);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [channel, config, enabled]);

  return {
    events: snapshot.events,
    clearEvents: () => channel.clearEvents(),
    isConnected: snapshot.readyState === WS_OPEN,
    isConnecting: snapshot.readyState === WS_CONNECTING,
  };
}
