import "@xterm/xterm/css/xterm.css";

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Container as ContainerIcon,
  ChevronDown,
  ChevronRight,
  Terminal as TerminalIcon,
  FileText,
  BarChart2,
  Info,
  Search,
} from "lucide-react";
import { dockerApi, type Container } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export const Route = createFileRoute("/_authenticated/agents/$id/containers")({
  component: ContainersPage,
});

// ─── State colour helper ───────────────────────────────────────────────────

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "exited":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

// ─── Overview tab ─────────────────────────────────────────────────────────

function ContainerOverview({
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
      return res.data as Record<string, unknown>;
    },
    staleTime: 10_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
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

  return (
    <div className="p-4 space-y-4 text-sm">
      {/* Ports */}
      {ports && Object.keys(ports).length > 0 && (
        <section>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Ports</h4>
          <div className="space-y-1">
            {Object.entries(ports).map(([containerPort, bindings]) => (
              <div key={containerPort} className="flex gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{containerPort}</span>
                {bindings && bindings.length > 0 ? (
                  <span>→ {bindings.map((b) => b.HostPort).join(", ")}</span>
                ) : (
                  <span className="text-muted-foreground">(not published)</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mounts / Binds */}
      {(mounts?.length || binds.length) > 0 && (
        <section>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Mounts</h4>
          <div className="space-y-1">
            {(mounts ?? []).map((m, i) => (
              <div key={i} className="font-mono text-xs text-muted-foreground truncate">
                <span className="text-foreground">{m.Destination}</span>{" "}
                ← {m.Source} <span className="opacity-50">({m.Type})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Networks */}
      {networks && Object.keys(networks).length > 0 && (
        <section>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Networks</h4>
          <div className="flex flex-wrap gap-1">
            {Object.keys(networks).map((n) => (
              <span key={n} className="bg-muted rounded px-2 py-0.5 text-xs font-mono">{n}</span>
            ))}
          </div>
        </section>
      )}

      {/* Env */}
      {env.length > 0 && (
        <section>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Environment ({env.length})
          </h4>
          <div className="space-y-0.5 max-h-48 overflow-y-auto rounded bg-muted/40 p-2">
            {env.map((e, i) => {
              const [key, ...rest] = e.split("=");
              return (
                <div key={i} className="font-mono text-xs leading-relaxed truncate">
                  <span className="text-blue-400">{key}</span>
                  {rest.length > 0 && <span className="text-muted-foreground">={rest.join("=")}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Labels */}
      {Object.keys(labels).length > 0 && (
        <section>
          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Labels ({Object.keys(labels).length})
          </h4>
          <div className="space-y-0.5 max-h-32 overflow-y-auto rounded bg-muted/40 p-2">
            {Object.entries(labels).map(([k, v]) => (
              <div key={k} className="font-mono text-xs truncate">
                <span className="text-purple-400">{k}</span>
                <span className="text-muted-foreground">={v}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────

function ContainerLogs({
  agentUrl,
  token,
  containerId,
}: {
  agentUrl: string;
  token: string;
  containerId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["container-logs", containerId],
    queryFn: async () => {
      const res = await dockerApi.getContainerLogs(agentUrl, token, containerId);
      return res.data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;

  return (
    <div className="h-72 overflow-y-auto bg-black rounded p-3 font-mono text-xs leading-relaxed">
      {(!logs || logs.length === 0) ? (
        <span className="text-muted-foreground">No logs available.</span>
      ) : (
        logs.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all text-gray-300">{line}</div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Stats tab ─────────────────────────────────────────────────────────────

function ContainerStats({
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

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground p-4">No stats available.</p>;

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
    <div className="p-4 space-y-5 text-sm">
      {/* CPU */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">CPU</span>
          <span className="font-mono font-semibold">{cpuPct.toFixed(2)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.min(cpuPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Memory */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Memory</span>
          <span className="font-mono font-semibold">
            {fmtBytes(memUsage)} / {fmtBytes(memLimit)} ({memPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${memPct > 80 ? "bg-red-500" : "bg-green-500"}`}
            style={{ width: `${Math.min(memPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Terminal tab ──────────────────────────────────────────────────────────

function ContainerTerminal({
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

  const connect = useCallback(() => {
    if (!wrapperRef.current) return;

    // Clean up any previous session
    wsRef.current?.close();
    termRef.current?.dispose();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
      },
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

    ws.onopen = () => term.write("\r\n\x1b[32m✓ Connected\x1b[0m\r\n\r\n");
    ws.onclose = () => term.write("\r\n\x1b[31m✗ Connection closed\x1b[0m\r\n");
    ws.onerror = () => term.write("\r\n\x1b[31m✗ Connection error\x1b[0m\r\n");

    ws.onmessage = (e) => {
      const data =
        e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data;
      term.write(data);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoded = new TextEncoder().encode(data);
        ws.send(encoded);
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const ro = new ResizeObserver(() => fit.fit());
    if (wrapperRef.current) ro.observe(wrapperRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [agentUrl, token, containerId]);

  useEffect(() => {
    if (!active) return;
    const cleanup = connect();
    return cleanup;
  }, [active, connect]);

  return (
    <div className="bg-[#0d1117] rounded overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-xs text-muted-foreground font-mono">/bin/sh — {containerId.slice(0, 12)}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2"
          onClick={connect}
        >
          Reconnect
        </Button>
      </div>
      <div ref={wrapperRef} className="h-72" />
    </div>
  );
}

// ─── Detail panel (tabs) ───────────────────────────────────────────────────

type Tab = "overview" | "logs" | "stats" | "terminal";

function ContainerDetail({
  container,
  agentUrl,
  token,
}: {
  container: Container;
  agentUrl: string;
  token: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const isRunning = container.state.toLowerCase() === "running";

  const tabs: { id: Tab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: "overview", label: "Overview", icon: <Info className="h-3.5 w-3.5" /> },
    { id: "logs", label: "Logs", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "stats", label: "Stats", icon: <BarChart2 className="h-3.5 w-3.5" />, disabled: !isRunning },
    { id: "terminal", label: "Terminal", icon: <TerminalIcon className="h-3.5 w-3.5" />, disabled: !isRunning },
  ];

  return (
    <div className="border-t bg-muted/20">
      {/* Tab bar */}
      <div className="flex gap-0.5 px-4 pt-2 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t transition-colors
              ${t.disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
              ${tab === t.id
                ? "bg-background border border-b-background text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"}
            `}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "overview" && (
          <ContainerOverview agentUrl={agentUrl} token={token} containerId={container.id} />
        )}
        {tab === "logs" && (
          <div className="p-4">
            <ContainerLogs agentUrl={agentUrl} token={token} containerId={container.id} />
          </div>
        )}
        {tab === "stats" && (
          <ContainerStats agentUrl={agentUrl} token={token} containerId={container.id} />
        )}
        {tab === "terminal" && (
          <div className="p-4">
            <ContainerTerminal
              agentUrl={agentUrl}
              token={token}
              containerId={container.id}
              active={tab === "terminal"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Container row ─────────────────────────────────────────────────────────

function ContainerRow({
  container,
  agentUrl,
  token,
  onStart,
  onStop,
  onRestart,
  onRemove,
  actionPending,
}: {
  container: Container;
  agentUrl: string;
  token: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
  actionPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = container.state.toLowerCase() === "running";
  const name = container.names[0]?.replace("/", "") || container.id.slice(0, 12);

  return (
    <div className="border-b last:border-b-0">
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1 grid grid-cols-[1fr_1fr_auto_1fr] gap-3 items-center">
          <span className="font-medium truncate">{name}</span>
          <span className="text-muted-foreground text-sm truncate">{container.image}</span>
          <Badge variant="outline" className={`text-xs ${stateColor(container.state)}`}>
            {container.state}
          </Badge>
          <span className="text-muted-foreground text-sm truncate hidden md:block">{container.status}</span>
        </div>

        {/* Actions — stop propagation so they don't toggle expand */}
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isRunning ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Stop"
                onClick={() => onStop(container.id)}
                disabled={actionPending}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Restart"
                onClick={() => onRestart(container.id)}
                disabled={actionPending}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Start"
              onClick={() => onStart(container.id)}
              disabled={actionPending}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Remove"
            onClick={() => {
              if (confirm(`Remove container "${name}"?`)) {
                onRemove(container.id);
              }
            }}
            disabled={actionPending}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <ContainerDetail container={container} agentUrl={agentUrl} token={token} />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

function ContainersPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(true);
  const [search, setSearch] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id, showAll],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, agent.token, showAll);
      return res.data;
    },
    enabled: !!agent?.token,
    refetchInterval: 5000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const startMutation = useMutation({
    mutationFn: (cid: string) => {
      if (!agent?.token) throw new Error("Token unavailable");
      return dockerApi.startContainer(agent.url, agent.token, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container started"); },
    onError: () => toast.error("Failed to start container"),
  });

  const stopMutation = useMutation({
    mutationFn: (cid: string) => {
      if (!agent?.token) throw new Error("Token unavailable");
      return dockerApi.stopContainer(agent.url, agent.token, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container stopped"); },
    onError: () => toast.error("Failed to stop container"),
  });

  const restartMutation = useMutation({
    mutationFn: (cid: string) => {
      if (!agent?.token) throw new Error("Token unavailable");
      return dockerApi.restartContainer(agent.url, agent.token, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container restarted"); },
    onError: () => toast.error("Failed to restart container"),
  });

  const removeMutation = useMutation({
    mutationFn: (cid: string) => {
      if (!agent?.token) throw new Error("Token unavailable");
      return dockerApi.removeContainer(agent.url, agent.token, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container removed"); },
    onError: () => toast.error("Failed to remove container"),
  });

  const anyPending =
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending ||
    removeMutation.isPending;

  const filtered = (containers ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (c.names[0] ?? "").toLowerCase();
    return name.includes(q) || c.image.toLowerCase().includes(q) || c.state.toLowerCase().includes(q);
  });

  const running = filtered.filter((c) => c.state.toLowerCase() === "running").length;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Containers</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isLoading
              ? "Loading…"
              : `${running} running · ${filtered.length} total`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-48 text-sm"
              placeholder="Filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* All toggle */}
          <Button
            size="sm"
            variant={showAll ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "All" : "Running"}
          </Button>
        </div>
      </div>

      {/* Container list */}
      {isLoading ? (
        <div className="rounded-lg border bg-card animate-pulse h-32" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <ContainerIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No containers found</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {search ? "No containers match your filter." : "No Docker containers on this agent."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y divide-border">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_auto_1fr] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 rounded-t-lg">
            <span>Name</span>
            <span>Image</span>
            <span>State</span>
            <span>Status</span>
          </div>

          {filtered.map((container) => (
            <ContainerRow
              key={container.id}
              container={container}
              agentUrl={agent?.url ?? ""}
              token={agent?.token ?? ""}
              onStart={(cid) => startMutation.mutate(cid)}
              onStop={(cid) => stopMutation.mutate(cid)}
              onRestart={(cid) => restartMutation.mutate(cid)}
              onRemove={(cid) => removeMutation.mutate(cid)}
              actionPending={anyPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
