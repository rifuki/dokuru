import { useSyncExternalStore } from "react";

import { wsApiUrl } from "@/lib/api/api-config";
import type { HostShellPath } from "@/lib/host-shell";

export type HostShellStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface HostShellOutputChunk {
  id: number;
  data: string | Uint8Array;
}

export interface HostShellSnapshot {
  status: HostShellStatus;
  chunks: HostShellOutputChunk[];
  shell: HostShellPath;
  cols: number;
  rows: number;
  error?: string;
}

interface ConnectOptions {
  agentId: string;
  agentUrl: string;
  accessMode?: string;
  token?: string;
  accessToken?: string | null;
  shell: HostShellPath;
  cols: number;
  rows: number;
}

const MAX_BUFFERED_CHUNKS = 4000;

class HostShellSession {
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private nextChunkId = 1;
  private snapshot: HostShellSnapshot = {
    status: "idle",
    chunks: [],
    shell: "/bin/sh",
    cols: 100,
    rows: 30,
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  connect(options: ConnectOptions) {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const url = this.connectionUrl(options);
    if (!url) {
      this.setSnapshot({ status: "error", error: "Shell connection credentials are missing" });
      return;
    }

    this.setSnapshot({
      status: "connecting",
      shell: options.shell,
      cols: options.cols,
      rows: options.rows,
      error: undefined,
    });

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onopen = () => {
      this.setSnapshot({ status: "connected", error: undefined });
    };

    socket.onmessage = (event) => {
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : String(event.data);
      this.append(data);
    };

    socket.onerror = () => {
      this.setSnapshot({ status: "error", error: "Shell connection failed" });
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.setSnapshot((current) => ({
        ...current,
        status: current.status === "error" ? "error" : "disconnected",
      }));
    };
  }

  send(data: string | Uint8Array) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  resize(cols: number, rows: number) {
    this.setSnapshot({ cols, rows });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }

  disconnect() {
    this.append("\r\n\x1b[33mDokuru host shell disconnected\x1b[0m\r\n");
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(new TextEncoder().encode("exit\n"));
      window.setTimeout(() => this.socket?.close(), 100);
    } else {
      this.socket?.close();
      this.socket = null;
      this.setSnapshot({ status: "disconnected" });
    }
  }

  private connectionUrl(options: ConnectOptions) {
    const params = new URLSearchParams({
      cols: String(options.cols),
      rows: String(options.rows),
      shell: options.shell,
    });

    if (options.accessMode === "relay") {
      if (!options.accessToken) return null;
      params.set("access_token", options.accessToken);
      return `${wsApiUrl}/agents/${options.agentId}/host/shell/stream?${params.toString()}`;
    }

    if (!options.agentUrl) return null;
    if (options.token) params.set("token", options.token);
    return `${options.agentUrl.replace(/^http/, "ws")}/host/shell/stream?${params.toString()}`;
  }

  private append(data: string | Uint8Array) {
    const chunks = [...this.snapshot.chunks, { id: this.nextChunkId, data }];
    this.nextChunkId += 1;

    if (chunks.length > MAX_BUFFERED_CHUNKS) {
      chunks.splice(0, chunks.length - MAX_BUFFERED_CHUNKS);
    }

    this.setSnapshot({ chunks });
  }

  private setSnapshot(update: Partial<HostShellSnapshot> | ((current: HostShellSnapshot) => HostShellSnapshot)) {
    this.snapshot = typeof update === "function" ? update(this.snapshot) : { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
}

const sessions = new Map<string, HostShellSession>();

export function getHostShellSession(agentId: string) {
  let session = sessions.get(agentId);
  if (!session) {
    session = new HostShellSession();
    sessions.set(agentId, session);
  }
  return session;
}

export function useHostShellSession(agentId: string) {
  const session = getHostShellSession(agentId);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, snapshot };
}
