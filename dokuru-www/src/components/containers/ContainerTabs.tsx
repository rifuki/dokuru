import "@xterm/xterm/css/xterm.css";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Info,
  FileText,
  BarChart2,
  Terminal as TerminalIcon,
  RotateCw,
  Cpu,
  MemoryStick,
  Plug,
  PowerOff,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { dockerApi, type Container } from "@/services/docker-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { wsApiUrl } from "@/lib/api/api-config";
import { useAuthStore } from "@/stores/use-auth-store";

// ─── Overview tab ─────────────────────────────────────────────────────────────

export function ContainerOverview({
  agentUrl,
  token,
  containerId,
  agentId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
  agentId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["container-inspect", containerId],
    queryFn: async () => {
      const res = await dockerApi.inspectContainer(agentUrl, token, containerId);
      return res.data as Record<string, unknown>;
    },
    staleTime: 10_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-6">Loading…</p>;
  if (!data) return null;

  const cfg = data.Config as Record<string, unknown> | undefined;
  const hostCfg = data.HostConfig as Record<string, unknown> | undefined;
  const networkSettings = data.NetworkSettings as Record<string, unknown> | undefined;
  const mounts = data.Mounts as { Type: string; Source: string; Destination: string }[] | undefined;

  const env = (cfg?.Env as string[] | undefined) ?? [];
  const ports = networkSettings?.Ports as Record<string, { HostPort: string }[] | null> | undefined;
  const networks = networkSettings?.Networks as Record<string, unknown> | undefined;
  const labels = (cfg?.Labels as Record<string, string> | undefined) ?? {};
  const binds = (hostCfg?.Binds as string[] | undefined) ?? [];
  const stackName = labels["com.docker.compose.project"] || "N/A";
  const created = data.Created ? new Date(data.Created as string).toLocaleString() : "N/A";

  return (
    <div className="p-5 sm:p-6 space-y-6 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Container Info
          </h4>
          <div className="space-y-2 rounded-[19px] border border-border bg-muted/55 p-4 shadow-sm dark:bg-white/[0.045]">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-mono">{created}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Stack:</span>
              <span className="font-mono text-primary">{stackName}</span>
            </div>
          </div>
        </section>

        {ports && Object.keys(ports).length > 0 && (
          <section className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Port Bindings
            </h4>
            <div className="space-y-2 rounded-[19px] border border-border bg-muted/55 p-4 shadow-sm dark:bg-white/[0.045]">
              {Object.entries(ports).map(([containerPort, bindings]) => (
                <div key={containerPort} className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-muted-foreground">{containerPort}</span>
                  <span className="text-muted-foreground">→</span>
                  {bindings && bindings.length > 0 ? (
                    <span className="text-primary font-medium">{bindings.map((b) => b.HostPort).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground italic">(not published)</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {networks && Object.keys(networks).length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Networks & IP Address
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(networks).map(([name, net]) => {
              const networkData = net as { IPAddress?: string; NetworkID?: string };
              return (
                <div key={name} className="rounded-[19px] border border-border bg-muted/55 p-4 shadow-sm dark:bg-white/[0.045]">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      to="/agents/$id/networks/$networkId"
                      params={{ id: agentId, networkId: networkData.NetworkID || name }}
                      className="bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-1 text-xs font-mono font-medium hover:bg-primary/20 transition-colors"
                    >
                      {name}
                    </Link>
                  </div>
                  {networkData.IPAddress && (
                    <div className="text-xs font-mono text-muted-foreground mt-2">
                      IP: <span className="text-foreground">{networkData.IPAddress}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(mounts?.length || binds.length) > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Volume Mounts
          </h4>
          <div className="space-y-2 rounded-[19px] border border-border bg-muted/55 p-4 shadow-sm dark:bg-white/[0.045]">
            {(mounts ?? []).map((m, i) => (
              <div key={i} className="font-mono text-xs flex items-start gap-3 rounded-[6px] bg-background/50 p-2 transition-colors hover:bg-background">
                <Badge variant="outline" className="text-[10px] mt-0.5">{m.Type}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-medium truncate">{m.Destination}</div>
                  <div className="text-muted-foreground text-[11px] truncate mt-0.5">← {m.Source}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {env.length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Environment Variables
            <Badge variant="secondary" className="text-[10px] ml-auto">{env.length}</Badge>
          </h4>
          <div className="max-h-64 overflow-y-auto rounded-[19px] border border-border bg-muted/55 p-4 space-y-1 shadow-sm dark:bg-white/[0.045]">
            {env.map((e, i) => {
              const [key, ...rest] = e.split("=");
              return (
                <div key={i} className="font-mono text-xs leading-relaxed p-1.5 rounded-[6px] hover:bg-background transition-colors">
                  <span className="text-primary font-medium">{key}</span>
                  {rest.length > 0 && <span className="text-muted-foreground">={rest.join("=")}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {Object.keys(labels).length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Labels
            <Badge variant="secondary" className="text-[10px] ml-auto">{Object.keys(labels).length}</Badge>
          </h4>
          <div className="max-h-48 overflow-y-auto rounded-[19px] border border-border bg-muted/55 p-4 space-y-1 shadow-sm dark:bg-white/[0.045]">
            {Object.entries(labels).map(([k, v]) => (
              <div key={k} className="font-mono text-xs p-1.5 rounded-[6px] hover:bg-background transition-colors">
                <span className="text-primary font-medium">{k}</span>
                <span className="text-muted-foreground">={v}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}(?:\\[[0-?]*[ -/]*[@-~]|\\].*?(?:${String.fromCharCode(7)}|${String.fromCharCode(27)}\\\\))`,
  "g",
);

function cleanLogEntry(entry: string) {
  return entry.replace(ANSI_ESCAPE_PATTERN, "").replace(/\r/g, "");
}

export function ContainerLogs({
  agentUrl,
  token,
  containerId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
}) {
  const logViewportRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["container-logs", containerId],
    queryFn: async () => {
      const res = await dockerApi.getContainerLogs(agentUrl, token, containerId);
      return res.data;
    },
    refetchInterval: 3000,
  });

  const normalizedLogs = useMemo(() => {
    if (!logs) return [];

    return logs
      .flatMap((entry) => cleanLogEntry(entry).split("\n"))
      .filter((line) => line.length > 0);
  }, [logs]);

  useEffect(() => {
    if (!autoScroll) return;
    const viewport = logViewportRef.current;
    if (!viewport) return;

    viewport.scrollTop = viewport.scrollHeight;
  }, [autoScroll, normalizedLogs.length]);

  if (isLoading) return <p className="text-sm text-muted-foreground p-6">Loading…</p>;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-[#0d1117] px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">Container Logs</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            {autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
          </button>
          <Badge variant="secondary" className="text-[10px]">{normalizedLogs.length} lines</Badge>
        </div>
      </div>
      <div ref={logViewportRef} className="h-96 overflow-auto bg-[#0d1117] p-4 font-mono text-xs leading-relaxed">
        {normalizedLogs.length === 0 ? (
          <span className="text-muted-foreground italic">No logs available.</span>
        ) : (
          normalizedLogs.map((line, i) => (
            <div key={i} className="w-max min-w-full whitespace-pre text-gray-300 hover:bg-white/5 px-2 py-0.5 rounded transition-colors">{line}</div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────────────

export function ContainerStats({
  agentUrl,
  token,
  containerId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
}) {
  const [interval, setInterval] = useState(2000);
  
  const { data, isLoading } = useQuery({
    queryKey: ["container-stats", containerId],
    queryFn: async () => {
      const res = await dockerApi.getContainerStats(agentUrl, token, containerId);
      return res.data;
    },
    refetchInterval: interval,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-6">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground p-6">No stats available.</p>;

  const cpuDelta =
    data.cpu_stats.cpu_usage.total_usage -
    ((data as unknown as { precpu_stats?: { cpu_usage: { total_usage: number } } })
      .precpu_stats?.cpu_usage.total_usage ?? 0);
  const systemDelta =
    data.cpu_stats.system_cpu_usage -
    ((data as unknown as { precpu_stats?: { system_cpu_usage: number } }).precpu_stats?.system_cpu_usage ?? 0);
  const cpuPct = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;
  const memUsage = data.memory_stats.usage;
  const memLimit = data.memory_stats.limit;
  const memPct = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

  function fmtBytes(b: number) {
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(0)} KB`;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Interval Control */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Update Interval:</span>
          <span className="text-sm text-muted-foreground">{interval}ms ({(interval/1000).toFixed(1)}s)</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="500"
            max="10000"
            step="500"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3 rounded-[19px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Cpu className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-sm font-semibold">CPU Usage</span>
            </div>
            <span className="font-mono text-2xl font-bold text-blue-500">{cpuPct.toFixed(1)}%</span>
          </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(cpuPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Real-time CPU utilization</p>
        </div>

        <div className="space-y-3 rounded-[19px] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${memPct > 80 ? "bg-red-500/10" : "bg-primary/10"}`}>
                <MemoryStick className={`h-4 w-4 ${memPct > 80 ? "text-red-500" : "text-primary"}`} />
              </div>
              <span className="text-sm font-semibold">Memory Usage</span>
            </div>
            <span className={`font-mono text-2xl font-bold ${memPct > 80 ? "text-red-500" : "text-primary"}`}>
              {memPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 shadow-lg ${
                memPct > 80
                  ? "bg-red-500"
                  : "bg-primary"
              }`}
              style={{ width: `${Math.min(memPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {fmtBytes(memUsage)} of {fmtBytes(memLimit)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Terminal tab ─────────────────────────────────────────────────────────────

type TermStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

const SHELLS = ["/bin/bash", "/bin/sh"] as const;
type ShellPath = (typeof SHELLS)[number];

function normalizeShell(shell: string | null | undefined): ShellPath {
  return shell === "/bin/bash" ? "/bin/bash" : "/bin/sh";
}

export function ContainerTerminal({
  agentUrl,
  token,
  containerId,
  active,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
  active: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [termDimensions, setTermDimensions] = useState({ cols: 80, rows: 24 });
  const [selectedShell, setSelectedShell] = useState<ShellPath>("/bin/sh");
  const [detectedShell, setDetectedShell] = useState<ShellPath | null>(null);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isRelay = agentUrl === "relay";
  const availableShells = useMemo<ShellPath[]>(() => {
    if (detectedShell === "/bin/bash") return ["/bin/bash", "/bin/sh"];
    if (detectedShell === "/bin/sh") return ["/bin/sh"];
    return [];
  }, [detectedShell]);
  const activeShell = availableShells.includes(selectedShell)
    ? selectedShell
    : availableShells[0] ?? "/bin/sh";

  // Build WebSocket URL
  const wsUrl = useMemo(() => {
    if (!shouldConnect || detectedShell === null) return null;
    const params = new URLSearchParams({
      cols: String(termDimensions.cols),
      rows: String(termDimensions.rows),
      shell: activeShell,
    });

    if (isRelay) {
      if (!accessToken) return null;
      params.set("access_token", accessToken);
      return `${wsApiUrl}/agents/${token}/docker/containers/${encodeURIComponent(containerId)}/exec?${params.toString()}`;
    }

    params.set("token", token);
    return `${agentUrl.replace(/^http/, "ws")}/docker/containers/${encodeURIComponent(containerId)}/exec?${params.toString()}`;
  }, [accessToken, activeShell, agentUrl, containerId, detectedShell, isRelay, shouldConnect, termDimensions, token]);

  const { sendMessage, lastMessage, readyState, getWebSocket } = useWebSocket(wsUrl, {
    shouldReconnect: () => false,
    reconnectAttempts: 0,
    reconnectInterval: 0,
    retryOnError: false,
    share: false,
    onOpen: () => {
      if (termRef.current) termRef.current.options.disableStdin = false;
      // Set binary type to arraybuffer
      const ws = getWebSocket();
      if (ws && 'binaryType' in ws) ws.binaryType = 'arraybuffer';
    },
    onClose: () => {
      if (termRef.current) termRef.current.options.disableStdin = true;
    },
    onError: () => {
      if (termRef.current) termRef.current.options.disableStdin = true;
    },
  }, wsUrl !== null);

  const status: TermStatus =
    readyState === ReadyState.OPEN ? "connected" :
    readyState === ReadyState.CONNECTING ? "connecting" :
    readyState === ReadyState.UNINSTANTIATED ? "idle" :
    readyState === ReadyState.CLOSED ? "disconnected" : "error";

  // Detect available shell when tab becomes active (once)
  useEffect(() => {
    if (!active || detectedShell !== null) return;
    dockerApi.detectContainerShell(agentUrl, token, containerId)
      .then((res) => {
        const shell = normalizeShell(res.data.shell);
        setDetectedShell(shell);
        setSelectedShell(shell);
      })
      .catch(() => {
        setDetectedShell("/bin/sh");
        setSelectedShell("/bin/sh");
      });
  }, [active, agentUrl, token, containerId, detectedShell]);

  // Close shell dropdown when clicking outside
  useEffect(() => {
    if (!shellMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (shellMenuRef.current && !shellMenuRef.current.contains(e.target as Node)) {
        setShellMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shellMenuOpen]);

  // Initialize terminal
  useEffect(() => {
    if (!active || detectedShell === null || !wrapperRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(wrapperRef.current);
    fit.fit();
    term.clear(); // Clear any previous content
    termRef.current = term;
    fitRef.current = fit;

    queueMicrotask(() => {
      setTermDimensions({ cols: term.cols, rows: term.rows });
      setShouldConnect(true);
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      queueMicrotask(() => setTermDimensions({ cols: term.cols, rows: term.rows }));
    });
    ro.observe(wrapperRef.current);
    roRef.current = ro;

    return () => {
      ro.disconnect();
      roRef.current = null;
      term.dispose();
      termRef.current = null;
      setShouldConnect(false);
    };
  }, [active, detectedShell]);

  // Handle terminal input
  useEffect(() => {
    if (!termRef.current) return;
    const disposable = termRef.current.onData((data) => {
      if (readyState === ReadyState.OPEN) sendMessage(new TextEncoder().encode(data));
    });
    return () => disposable.dispose();
  }, [readyState, sendMessage]);

  // Handle terminal resize
  useEffect(() => {
    if (!termRef.current) return;
    const disposable = termRef.current.onResize(({ cols, rows }) => {
      if (readyState === ReadyState.OPEN) sendMessage(JSON.stringify({ type: "resize", cols, rows }));
    });
    return () => disposable.dispose();
  }, [readyState, sendMessage]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage || !termRef.current) return;
    const data = lastMessage.data instanceof ArrayBuffer ? new Uint8Array(lastMessage.data) : lastMessage.data;
    termRef.current.write(data);
  }, [lastMessage]);

  const disconnect = useCallback(() => {
    if (termRef.current) {
      termRef.current.write("\r\n\x1b[33m⏻ Disconnected\x1b[0m\r\n");
      termRef.current.options.disableStdin = true;
    }
    if (readyState === ReadyState.OPEN) {
      sendMessage(new TextEncoder().encode("exit\n"));
      setTimeout(() => getWebSocket()?.close(), 100);
    }
  }, [readyState, sendMessage, getWebSocket]);

  const reconnect = useCallback((nextShell?: ShellPath) => {
    if (!wrapperRef.current) return;
    if (nextShell) setSelectedShell(nextShell);
    
    // Cleanup existing terminal and observer
    roRef.current?.disconnect();
    roRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    setShouldConnect(false);

    // Reinitialize terminal
    queueMicrotask(() => {
      if (!wrapperRef.current) return;
      
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(wrapperRef.current);
      fit.fit();
      term.clear(); // Clear any previous content
      termRef.current = term;
      fitRef.current = fit;

      const ro = new ResizeObserver(() => {
        fit.fit();
        queueMicrotask(() => setTermDimensions({ cols: term.cols, rows: term.rows }));
      });
      ro.observe(wrapperRef.current);
      roRef.current = ro;

      setTermDimensions({ cols: term.cols, rows: term.rows });
      setShouldConnect(true);
    });
  }, []);

  const isConnected    = status === "connected";
  const isConnecting   = status === "connecting";
  const isDisconnected = status === "disconnected" || status === "error";
  const isDetecting    = active && detectedShell === null;
  const shellLabel     = selectedShell.split("/").pop()!;

  return (
    <div className={`rounded-xl overflow-hidden border border-border shadow-lg ${!active ? "hidden" : ""}`}>

      {/* ── Title bar ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border select-none">

        {/* Status accent line at top */}
        <div className={`absolute inset-x-0 top-0 h-px transition-colors duration-500 ${
          isConnected    ? "bg-primary/50"
          : isConnecting ? "bg-primary/30"
          : "bg-border"
        }`} />

        {/* macOS dots */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-white/[0.18]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/[0.18]" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
        </div>

        {/* Separator */}
        <div className="h-3 w-px bg-border/50 shrink-0" />

        {/* Prompt + container path */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-primary font-mono text-xs font-bold leading-none shrink-0">❯</span>
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">~/</span>
          <span className="font-mono text-[10px] text-foreground/80 truncate max-w-[96px]">{containerId.slice(0, 12)}</span>
        </div>

        {/* Shell selector */}
        <div ref={shellMenuRef} className="relative shrink-0">
          <button
            onClick={() => !isDetecting && setShellMenuOpen((v) => !v)}
            disabled={isDetecting}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all ${
              isDetecting
                ? "bg-muted border-border text-muted-foreground/50 cursor-not-allowed"
                : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {isDetecting
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" />detecting…</>
              : <><span className="mr-0.5">{shellLabel}</span><ChevronDown className="h-2.5 w-2.5 opacity-60" /></>
            }
          </button>

          {shellMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden w-[150px]">
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">shell</span>
              </div>
              {SHELLS.map((s) => {
                const isSelected = selectedShell === s;
                const isDefault  = s === detectedShell;
                const isAvailable = availableShells.includes(s);
                return (
                  <button
                    key={s}
                    disabled={!isAvailable}
                    onClick={() => {
                      if (!isAvailable) return;
                      setShellMenuOpen(false);
                      reconnect(s);
                    }}
                    className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-colors flex items-center justify-between gap-2 ${
                      !isAvailable
                        ? "text-muted-foreground/35 cursor-not-allowed"
                        : isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <span>{s}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {!isAvailable && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground/60 border border-border font-mono tracking-wide">
                          missing
                        </span>
                      )}
                      {isDefault && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 font-mono tracking-wide">
                          detected
                        </span>
                      )}
                      {isSelected && !isDefault && <span className="text-primary text-xs">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Status indicator — disconnected only shown if we've had a session before */}
        {(isConnected || isConnecting || isDisconnected) && (
          <div className={`flex items-center gap-1 text-[10px] font-mono font-medium uppercase tracking-wide shrink-0 transition-colors duration-300 ${
            isConnected    ? "text-primary"
            : isConnecting ? "text-primary"
            : "text-destructive"
          }`}>
            {isConnecting
              ? <Loader2 className="h-2 w-2 animate-spin" />
              : <span className={`h-1 w-1 rounded-full bg-current shrink-0 ${isConnected ? "animate-pulse" : ""}`} />
            }
            {isConnected ? "Connected" : isConnecting ? "Connecting" : "Disconnected"}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Disconnect button — only when connected, labeled so it's findable */}
          {isConnected && (
            <button
              onClick={disconnect}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-medium border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all"
            >
              <PowerOff className="h-2.5 w-2.5" />
              Disconnect
            </button>
          )}

          {/* Connect / Reconnect button — hidden when connected */}
          {!isConnected && (
            <button
              onClick={() => reconnect()}
              disabled={isConnecting}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-medium transition-all border ${
                isConnecting
                  ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
                  : isDisconnected
                  ? "bg-muted border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  : "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
              }`}
            >
              {isConnecting
                ? <RotateCw className="h-2.5 w-2.5 animate-spin" />
                : isDisconnected
                ? <RotateCw className="h-2.5 w-2.5" />
                : <Plug className="h-2.5 w-2.5" />
              }
              {isDisconnected ? "Reconnect" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {/* ── Terminal body ──────────────────────────────────────────────────────────
          Outer div owns the padding + background. Inner div (wrapperRef) fills
          the *content area* via height:100% — so FitAddon measures the right
          dimensions (padding pixels are NOT counted as usable rows).
          Both share #0d1117 so the padding gap is seamless.                      */}
      <div
        className="h-96"
        style={{ background: "#0d1117", padding: "10px 6px 4px", boxSizing: "border-box", position: "relative" }}
      >
        <div ref={wrapperRef} style={{ height: "100%", width: "100%", overflow: "hidden" }} />
      </div>
    </div>
  );
}

// ─── Inspect tab ──────────────────────────────────────────────────────────────

export function ContainerInspect({
  agentUrl,
  token,
  containerId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["container-inspect", containerId],
    queryFn: async () => {
      const res = await dockerApi.inspectContainer(agentUrl, token, containerId);
      return res.data;
    },
    staleTime: 10_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-6">Loading…</p>;

  return (
    <div className="p-5 overflow-x-hidden">
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-[#0d1117] px-4 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">Docker Inspect JSON</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-3 hover:bg-white/10"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
          >
            Copy
          </Button>
        </div>
        <pre className="bg-[#0d1117] p-4 overflow-x-auto max-h-[600px] text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ─── Full tab panel ───────────────────────────────────────────────────────────

type Tab = "overview" | "logs" | "stats" | "terminal" | "inspect";

export function ContainerTabPanel({
  container,
  agentUrl,
  token,
  agentId,
}: {
  container: Container;
  agentUrl: string;
  token: string;
  agentId: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const isRunning = container.state.toLowerCase() === "running";

  const tabs: { id: Tab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: "overview", label: "Overview", icon: <Info className="h-4 w-4" /> },
    { id: "logs",     label: "Logs",     icon: <FileText className="h-4 w-4" /> },
    { id: "stats",    label: "Stats",    icon: <BarChart2 className="h-4 w-4" />, disabled: !isRunning },
    { id: "terminal", label: "Terminal", icon: <TerminalIcon className="h-4 w-4" />, disabled: !isRunning },
    { id: "inspect",  label: "Inspect",  icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <div className="border-t bg-muted/30">
      <div className="flex gap-1 px-5 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all border-t border-x
              ${t.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              ${tab === t.id
                ? "bg-background text-foreground shadow-sm border-border"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50 border-transparent"}
            `}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-background rounded-tr-lg">
        {tab === "overview" && <ContainerOverview agentUrl={agentUrl} token={token} containerId={container.id} agentId={agentId} />}
        {tab === "logs" && <div className="p-5"><ContainerLogs agentUrl={agentUrl} token={token} containerId={container.id} /></div>}
        {tab === "stats" && <ContainerStats agentUrl={agentUrl} token={token} containerId={container.id} />}
        {tab === "terminal" && (
          <div className="p-5">
            <ContainerTerminal agentUrl={agentUrl} token={token} containerId={container.id} active={tab === "terminal"} />
          </div>
        )}
        {tab === "inspect" && <ContainerInspect agentUrl={agentUrl} token={token} containerId={container.id} />}
      </div>
    </div>
  );
}
