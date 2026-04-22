import "@xterm/xterm/css/xterm.css";

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
} from "lucide-react";
import { dockerApi, type Container } from "@/services/docker-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

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
    <div className="p-6 space-y-6 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Container Info
          </h4>
          <div className="space-y-2 bg-muted/50 rounded-lg p-4">
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
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Port Bindings
            </h4>
            <div className="space-y-2 bg-muted/50 rounded-lg p-4">
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
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Networks & IP Address
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(networks).map(([name, net]) => {
              const networkData = net as { IPAddress?: string; NetworkID?: string };
              return (
                <div key={name} className="bg-muted/50 rounded-lg p-3">
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
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Volume Mounts
          </h4>
          <div className="space-y-2 bg-muted/50 rounded-lg p-4">
            {(mounts ?? []).map((m, i) => (
              <div key={i} className="font-mono text-xs flex items-start gap-3 p-2 rounded hover:bg-background transition-colors">
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
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Environment Variables
            <Badge variant="secondary" className="text-[10px] ml-auto">{env.length}</Badge>
          </h4>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-4 space-y-1">
            {env.map((e, i) => {
              const [key, ...rest] = e.split("=");
              return (
                <div key={i} className="font-mono text-xs leading-relaxed p-1.5 rounded hover:bg-background transition-colors">
                  <span className="text-blue-400 font-medium">{key}</span>
                  {rest.length > 0 && <span className="text-muted-foreground">={rest.join("=")}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {Object.keys(labels).length > 0 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Labels
            <Badge variant="secondary" className="text-[10px] ml-auto">{Object.keys(labels).length}</Badge>
          </h4>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-4 space-y-1">
            {Object.entries(labels).map(([k, v]) => (
              <div key={k} className="font-mono text-xs p-1.5 rounded hover:bg-background transition-colors">
                <span className="text-purple-400 font-medium">{k}</span>
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

export function ContainerLogs({
  agentUrl,
  token,
  containerId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["container-logs", containerId],
    queryFn: async () => {
      const res = await dockerApi.getContainerLogs(agentUrl, token, containerId);
      return res.data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

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
          <Badge variant="secondary" className="text-[10px]">{logs?.length ?? 0} lines</Badge>
        </div>
      </div>
      <div className="h-96 overflow-y-auto bg-[#0d1117] p-4 font-mono text-xs leading-relaxed">
        {(!logs || logs.length === 0) ? (
          <span className="text-muted-foreground italic">No logs available.</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all text-gray-300 hover:bg-white/5 px-2 py-0.5 rounded transition-colors">{line}</div>
          ))
        )}
        <div ref={bottomRef} />
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
  const { data, isLoading } = useQuery({
    queryKey: ["container-stats", containerId],
    queryFn: async () => {
      const res = await dockerApi.getContainerStats(agentUrl, token, containerId);
      return res.data;
    },
    refetchInterval: 2000,
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
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3 p-5 rounded-lg border bg-card">
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
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 shadow-lg shadow-blue-500/50"
              style={{ width: `${Math.min(cpuPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Real-time CPU utilization</p>
        </div>

        <div className="space-y-3 p-5 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${memPct > 80 ? "bg-red-500/10" : "bg-green-500/10"}`}>
                <MemoryStick className={`h-4 w-4 ${memPct > 80 ? "text-red-500" : "text-green-500"}`} />
              </div>
              <span className="text-sm font-semibold">Memory Usage</span>
            </div>
            <span className={`font-mono text-2xl font-bold ${memPct > 80 ? "text-red-500" : "text-green-500"}`}>
              {memPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 shadow-lg ${
                memPct > 80
                  ? "bg-gradient-to-r from-red-500 to-red-600 shadow-red-500/50"
                  : "bg-gradient-to-r from-green-500 to-green-600 shadow-green-500/50"
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
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TermStatus>("idle");
  const [hasConnectedBefore, setHasConnectedBefore] = useState(false);

  const connect = useCallback(() => {
    if (!wrapperRef.current) return;
    wsRef.current?.close();
    termRef.current?.dispose();

    setStatus("connecting");

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(wrapperRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const wsUrl =
      agentUrl.replace(/^http/, "ws") +
      `/docker/containers/${containerId}/exec?token=${encodeURIComponent(token)}&cols=${term.cols}&rows=${term.rows}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setHasConnectedBefore(true);
    };
    ws.onclose = () => {
      setStatus("disconnected");
      term.write("\r\n\x1b[31m✗ Connection closed\x1b[0m\r\n");
    };
    ws.onerror = () => {
      setStatus("error");
      term.write("\r\n\x1b[31m✗ Connection error\x1b[0m\r\n");
    };
    ws.onmessage = (e) => {
      const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
      term.write(data);
    };
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });

    const ro = new ResizeObserver(() => fit.fit());
    if (wrapperRef.current) ro.observe(wrapperRef.current);

    return () => { ro.disconnect(); ws.close(); term.dispose(); };
  }, [agentUrl, token, containerId]);

  // Auto-connect when terminal tab becomes active
  useEffect(() => {
    if (!active || termRef.current) return;
    connect();
  }, [active, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  const statusDot = {
    idle:         "bg-muted-foreground/40",
    connecting:   "bg-yellow-400 animate-pulse",
    connected:    "bg-green-400",
    disconnected: "bg-red-400",
    error:        "bg-red-400",
  }[status];

  const statusLabel = {
    idle:         "Not connected",
    connecting:   "Connecting…",
    connected:    "Connected",
    disconnected: "Disconnected",
    error:        "Error",
  }[status];

  return (
    <div className={`rounded-lg border overflow-hidden shadow-lg ${!active ? "hidden" : ""}`}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1117] border-b border-white/10">
        <div className="flex items-center gap-3">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">/bin/sh</span>
          <Badge variant="secondary" className="text-[10px]">{containerId.slice(0, 12)}</Badge>
          {/* Status indicator */}
          <div className="flex items-center gap-1.5 ml-1">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot}`} />
            <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-3 hover:bg-white/10"
          onClick={connect}
          disabled={status === "connecting"}
        >
          <RotateCw className={`h-3 w-3 mr-1.5 ${status === "connecting" ? "animate-spin" : ""}`} />
          {hasConnectedBefore.current ? "Reconnect" : "Connect"}
        </Button>
      </div>
      <div ref={wrapperRef} className="h-96 bg-[#0d1117]" />
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
