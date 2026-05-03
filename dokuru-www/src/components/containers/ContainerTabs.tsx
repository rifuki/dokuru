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
  Layers,
} from "lucide-react";
import { dockerApi, type Container } from "@/services/docker-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { wsApiUrl } from "@/lib/api/api-config";
import { useAuthStore } from "@/stores/use-auth-store";
import type { ContainerTab } from "@/stores/use-container-ui-store";

const TERMINAL_BG = "#090909";
const TERMINAL_FG = "#d4d4d4";
const TERMINAL_CURSOR = "#38bdf8";

function ContainerOverviewSkeleton() {
  return (
    <div className="p-5 sm:p-6 space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[0, 1].map((item) => (
          <section key={item} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="space-y-3 rounded-[19px] border border-border bg-muted/45 p-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          </section>
        ))}
      </div>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-28 rounded-[19px]" />
          <Skeleton className="h-28 rounded-[19px]" />
        </div>
      </section>
    </div>
  );
}

function ContainerLogsSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0d1117] px-4 py-2">
        <Skeleton className="h-3 w-28 bg-white/10" />
        <Skeleton className="h-5 w-20 rounded-full bg-white/10" />
      </div>
      <div className="h-96 space-y-2 bg-[#0d1117] p-4">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="h-3 bg-white/10" style={{ width: `${92 - (index % 4) * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

function ContainerStatsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-14 rounded-lg" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-36 rounded-[19px]" />
        <Skeleton className="h-36 rounded-[19px]" />
      </div>
    </div>
  );
}

function ContainerInspectSkeleton() {
  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0d1117] px-4 py-2">
          <Skeleton className="h-3 w-36 bg-white/10" />
          <Skeleton className="h-7 w-16 bg-white/10" />
        </div>
        <div className="max-h-[600px] space-y-2 bg-[#0d1117] p-4">
          {Array.from({ length: 14 }).map((_, index) => (
            <Skeleton key={index} className="h-3 bg-white/10" style={{ width: `${96 - (index % 5) * 9}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function mountTypeBadgeClass(type: string) {
  switch (type.toLowerCase()) {
    case "bind":
      return "border-sky-400/35 bg-sky-400/10 text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.08)]";
    case "volume":
      return "border-violet-400/35 bg-violet-400/10 text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.08)]";
    default:
      return "border-border bg-muted/70 text-muted-foreground";
  }
}

function volumeNameFromMount(mount: { Name?: string; Source?: string }) {
  if (mount.Name) return mount.Name;
  const match = mount.Source?.match(/\/volumes\/([^/]+)\/_data(?:\/|$)/);
  return match?.[1] ?? null;
}

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

  if (isLoading) return <ContainerOverviewSkeleton />;
  if (!data) return null;

  const cfg = data.Config as Record<string, unknown> | undefined;
  const hostCfg = data.HostConfig as Record<string, unknown> | undefined;
  const networkSettings = data.NetworkSettings as Record<string, unknown> | undefined;
  const mounts = data.Mounts as { Type: string; Source: string; Destination: string; Name?: string }[] | undefined;

  const env = (cfg?.Env as string[] | undefined) ?? [];
  const ports = networkSettings?.Ports as Record<string, { HostPort: string }[] | null> | undefined;
  const networks = networkSettings?.Networks as Record<string, unknown> | undefined;
  const labels = (cfg?.Labels as Record<string, string> | undefined) ?? {};
  const binds = (hostCfg?.Binds as string[] | undefined) ?? [];
  const stackName = labels["com.docker.compose.project"] || "";
  const serviceName = labels["com.docker.compose.service"] || "";
  const created = data.Created ? new Date(data.Created as string).toLocaleString() : "N/A";
  const imageReference = (data.Image as string | undefined) || (cfg?.Image as string | undefined);
  const imageLabel = (cfg?.Image as string | undefined) || imageReference;

  return (
    <div className="p-5 sm:p-6 space-y-6 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <div className="h-1 w-1 rounded-full bg-primary" />
            Container Info
          </h4>
          <div className="space-y-3 rounded-[19px] border border-border bg-muted/55 p-4 shadow-sm dark:bg-white/[0.045]">
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 text-xs">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-mono text-right truncate">{created}</span>
            </div>

            {imageReference && imageLabel && (
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 text-xs">
                <span className="text-muted-foreground">Image:</span>
                <Link
                  to="/agents/$id/images/$imageId"
                  params={{ id: agentId, imageId: imageReference }}
                  search={{ from: "container", containerId }}
                  className="ml-auto min-w-0 max-w-full truncate rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-right font-mono text-primary transition-colors hover:bg-primary/15"
                >
                  {imageLabel}
                </Link>
              </div>
            )}

            <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 text-xs">
              <span className="text-muted-foreground">Stack:</span>
              {stackName ? (
                <Link
                  to="/agents/$id/stacks"
                  params={{ id: agentId }}
                  className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-primary hover:bg-primary/15"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{stackName}</span>
                </Link>
              ) : (
                <span className="font-mono text-right text-muted-foreground">N/A</span>
              )}
            </div>

            {serviceName && (
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 text-xs">
                <span className="text-muted-foreground">Service:</span>
                <span className="ml-auto min-w-0 max-w-full truncate rounded-md border border-border/70 bg-background/45 px-2 py-1 text-right font-mono text-foreground">
                  {serviceName}
                </span>
              </div>
            )}
          </div>
        </section>

        {ports && Object.keys(ports).length > 0 && (
          <section className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Port Bindings
            </h4>
            <div className="rounded-[19px] border border-border bg-muted/55 p-4 font-mono text-xs shadow-sm dark:bg-white/[0.045]">
              {Object.entries(ports).map(([containerPort, bindings]) => (
                <div key={containerPort} className="grid grid-cols-[5.5rem_1rem_minmax(0,1fr)] items-center gap-x-3 py-1 first:pt-0 last:pb-0">
                  <span className="text-muted-foreground tabular-nums">{containerPort}</span>
                  <span className="text-center text-muted-foreground/60">→</span>
                  {bindings && bindings.length > 0 ? (
                    <span className="font-medium text-primary tabular-nums">{bindings.map((b) => b.HostPort).join(", ")}</span>
                  ) : (
                    <span className="italic text-muted-foreground/70">(not published)</span>
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
                      search={{ from: "container", containerId }}
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
            {(mounts ?? []).map((m, i) => {
              const volumeName = m.Type.toLowerCase() === "volume" ? volumeNameFromMount(m) : null;
              const content = (
                <>
                  <Badge variant="outline" className={`h-7 min-w-16 justify-center rounded-full px-2.5 text-[10px] uppercase tracking-[0.12em] ${mountTypeBadgeClass(m.Type)}`}>
                    {m.Type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-medium truncate">{m.Destination}</div>
                    <div className="text-muted-foreground text-[11px] truncate mt-0.5">← {m.Source}</div>
                  </div>
                </>
              );

              if (volumeName) {
                return (
                  <Link
                    key={`${m.Destination}-${i}`}
                    to="/agents/$id/volumes/$volumeName"
                    params={{ id: agentId, volumeName }}
                    search={{ from: "container", containerId }}
                    className="flex items-center gap-3 rounded-lg bg-background/50 px-3 py-2.5 font-mono text-xs transition-colors hover:bg-background hover:ring-1 hover:ring-primary/25"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div key={`${m.Destination}-${i}`} className="flex items-center gap-3 rounded-lg bg-background/50 px-3 py-2.5 font-mono text-xs transition-colors hover:bg-background">
                  {content}
                </div>
              );
            })}
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

  if (isLoading) return <ContainerLogsSkeleton />;

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

  if (isLoading) return <ContainerStatsSkeleton />;
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

type TerminalDisposable = { dispose: () => void };

interface ContainerTerminalSession {
  key: string;
  term: Terminal;
  fit: FitAddon;
  inputDisposable: TerminalDisposable;
  socket: WebSocket | null;
  status: TermStatus;
  selectedShell: ShellPath;
  detectedShell: ShellPath | null;
  detectingShell: boolean;
  dimensions: { cols: number; rows: number };
  subscribers: Set<() => void>;
}

const containerTerminalSessions = new Map<string, ContainerTerminalSession>();
const terminalEncoder = new TextEncoder();

function terminalSessionKey(agentUrl: string, token: string, containerId: string) {
  return `${agentUrl}\0${token}\0${containerId}`;
}

function notifyTerminalSession(session: ContainerTerminalSession) {
  for (const subscriber of session.subscribers) subscriber();
}

function getContainerTerminalSession(key: string) {
  const existing = containerTerminalSessions.get(key);
  if (existing) return existing;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    theme: { background: TERMINAL_BG, foreground: TERMINAL_FG, cursor: TERMINAL_CURSOR },
    allowTransparency: true,
    scrollback: 5000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.options.disableStdin = true;

  const session: ContainerTerminalSession = {
    key,
    term,
    fit,
    inputDisposable: { dispose: () => undefined },
    socket: null,
    status: "idle",
    selectedShell: "/bin/sh",
    detectedShell: null,
    detectingShell: false,
    dimensions: { cols: 80, rows: 24 },
    subscribers: new Set(),
  };

  session.inputDisposable = term.onData((data) => {
    if (session.socket?.readyState === WebSocket.OPEN) {
      session.socket.send(terminalEncoder.encode(data));
    }
  });

  containerTerminalSessions.set(key, session);
  return session;
}

function subscribeTerminalSession(session: ContainerTerminalSession, subscriber: () => void) {
  session.subscribers.add(subscriber);
  return () => {
    session.subscribers.delete(subscriber);
  };
}

function resizeTerminalSession(session: ContainerTerminalSession) {
  try {
    session.fit.fit();
  } catch {
    return;
  }

  const nextDimensions = { cols: session.term.cols, rows: session.term.rows };
  const changed = nextDimensions.cols !== session.dimensions.cols || nextDimensions.rows !== session.dimensions.rows;
  session.dimensions = nextDimensions;

  if (changed && session.socket?.readyState === WebSocket.OPEN) {
    session.socket.send(JSON.stringify({ type: "resize", ...nextDimensions }));
  }
}

function attachTerminalSession(session: ContainerTerminalSession, wrapper: HTMLDivElement) {
  if (session.term.element) {
    wrapper.replaceChildren(session.term.element);
  } else {
    wrapper.replaceChildren();
    session.term.open(wrapper);
  }

  resizeTerminalSession(session);
  const frameId = window.requestAnimationFrame(() => resizeTerminalSession(session));
  const resizeObserver = new ResizeObserver(() => resizeTerminalSession(session));
  resizeObserver.observe(wrapper);

  return () => {
    window.cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
  };
}

function writeTerminalMessage(session: ContainerTerminalSession, message: MessageEvent["data"]) {
  const data = message instanceof ArrayBuffer ? new Uint8Array(message) : message;
  session.term.write(data);
}

function connectTerminalSession(session: ContainerTerminalSession, wsUrl: string) {
  const currentState = session.socket?.readyState;
  if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) return;

  session.status = "connecting";
  session.term.options.disableStdin = true;
  notifyTerminalSession(session);

  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";
  session.socket = socket;

  socket.onopen = () => {
    if (session.socket !== socket) return;
    session.status = "connected";
    session.term.options.disableStdin = false;
    socket.send(JSON.stringify({ type: "resize", ...session.dimensions }));
    notifyTerminalSession(session);
  };

  socket.onmessage = (event) => {
    if (session.socket !== socket) return;
    writeTerminalMessage(session, event.data);
  };

  socket.onerror = () => {
    if (session.socket !== socket) return;
    session.status = "error";
    session.term.options.disableStdin = true;
    notifyTerminalSession(session);
  };

  socket.onclose = () => {
    if (session.socket !== socket) return;
    session.socket = null;
    session.status = "disconnected";
    session.term.options.disableStdin = true;
    notifyTerminalSession(session);
  };
}

function disconnectTerminalSession(session: ContainerTerminalSession) {
  session.term.write("\r\n\x1b[33m⏻ Disconnected\x1b[0m\r\n");
  session.term.options.disableStdin = true;

  const socket = session.socket;
  session.socket = null;
  session.status = "disconnected";
  notifyTerminalSession(session);

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(terminalEncoder.encode("exit\n"));
    window.setTimeout(() => socket.close(), 100);
  } else {
    socket?.close();
  }
}

function reconnectTerminalSession(session: ContainerTerminalSession, wsUrl: string, nextShell?: ShellPath) {
  if (nextShell) session.selectedShell = nextShell;

  const socket = session.socket;
  session.socket = null;
  socket?.close();
  session.term.clear();
  session.status = "idle";
  session.term.options.disableStdin = true;
  notifyTerminalSession(session);
  connectTerminalSession(session, wsUrl);
}

function detectTerminalShell(session: ContainerTerminalSession, agentUrl: string, token: string, containerId: string) {
  if (session.detectedShell !== null || session.detectingShell) return;

  session.detectingShell = true;
  notifyTerminalSession(session);

  dockerApi.detectContainerShell(agentUrl, token, containerId)
    .then((res) => {
      const shell = normalizeShell(res.data.shell);
      session.detectedShell = shell;
      session.selectedShell = shell;
    })
    .catch(() => {
      session.detectedShell = "/bin/sh";
      session.selectedShell = "/bin/sh";
    })
    .finally(() => {
      session.detectingShell = false;
      notifyTerminalSession(session);
    });
}

function terminalWsUrl({
  accessToken,
  agentUrl,
  containerId,
  dimensions,
  shell,
  token,
}: {
  accessToken: string | null;
  agentUrl: string;
  containerId: string;
  dimensions: { cols: number; rows: number };
  shell: ShellPath;
  token: string;
}) {
  const params = new URLSearchParams({
    cols: String(dimensions.cols),
    rows: String(dimensions.rows),
    shell,
  });

  if (agentUrl === "relay") {
    if (!accessToken) return null;
    params.set("access_token", accessToken);
    return `${wsApiUrl}/agents/${token}/docker/containers/${encodeURIComponent(containerId)}/exec?${params.toString()}`;
  }

  params.set("token", token);
  return `${agentUrl.replace(/^http/, "ws")}/docker/containers/${encodeURIComponent(containerId)}/exec?${params.toString()}`;
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
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [, forceRender] = useState(0);
  const accessToken = useAuthStore((s) => s.accessToken);
  const session = useMemo(
    () => getContainerTerminalSession(terminalSessionKey(agentUrl, token, containerId)),
    [agentUrl, containerId, token],
  );
  const detectedShell = session.detectedShell;
  const detectingShell = session.detectingShell;
  const selectedShell = session.selectedShell;
  const status = session.status;

  const availableShells = useMemo<ShellPath[]>(() => {
    if (detectedShell === "/bin/bash") return ["/bin/bash", "/bin/sh"];
    if (detectedShell === "/bin/sh") return ["/bin/sh"];
    return [];
  }, [detectedShell]);
  const activeShell = availableShells.includes(selectedShell)
    ? selectedShell
    : availableShells[0] ?? "/bin/sh";

  const buildWsUrl = useCallback((shell: ShellPath = activeShell) => (
    terminalWsUrl({
      accessToken,
      agentUrl,
      containerId,
      dimensions: session.dimensions,
      shell,
      token,
    })
  ), [accessToken, activeShell, agentUrl, containerId, session, token]);

  useEffect(() => subscribeTerminalSession(session, () => forceRender((value) => value + 1)), [session]);

  // Detect available shell when tab becomes active (once)
  useEffect(() => {
    if (!active) return;
    detectTerminalShell(session, agentUrl, token, containerId);
  }, [active, agentUrl, containerId, session, token]);

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

  // Attach the existing terminal DOM to the current route mount.
  useEffect(() => {
    if (!active || detectedShell === null || !wrapperRef.current) return;
    return attachTerminalSession(session, wrapperRef.current);
  }, [active, detectedShell, session]);

  useEffect(() => {
    if (!active || detectedShell === null || status !== "idle") return;
    const wsUrl = buildWsUrl();
    if (wsUrl) connectTerminalSession(session, wsUrl);
  }, [active, buildWsUrl, detectedShell, session, status]);

  const disconnect = useCallback(() => {
    disconnectTerminalSession(session);
  }, [session]);

  const reconnect = useCallback((nextShell?: ShellPath) => {
    const shell = nextShell ?? activeShell;
    const wsUrl = buildWsUrl(shell);
    if (!wsUrl) return;
    reconnectTerminalSession(session, wsUrl, nextShell);
  }, [activeShell, buildWsUrl, session]);

  const isConnected    = status === "connected";
  const isConnecting   = status === "connecting";
  const isDisconnected = status === "disconnected" || status === "error";
  const isDetecting    = active && (detectedShell === null || detectingShell);
  const shellLabel     = selectedShell.split("/").pop()!;

  return (
    <div className={`rounded-xl overflow-hidden border border-border shadow-lg ${!active ? "hidden" : ""}`}>

      {/* ── Title bar ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2 px-3 py-2 bg-card border-b border-border select-none dark:bg-[#171717]">
        {/* macOS dots */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57] shadow-[0_0_10px_rgba(255,95,87,0.35)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e] shadow-[0_0_10px_rgba(255,189,46,0.28)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840] shadow-[0_0_10px_rgba(40,200,64,0.28)]" />
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
          Both share the same neutral terminal surface so the padding gap is seamless. */}
      <div
        className="h-96"
        style={{ background: TERMINAL_BG, padding: "10px 6px 4px", boxSizing: "border-box", position: "relative" }}
      >
        <div ref={wrapperRef} style={{ height: "100%", width: "100%", overflow: "hidden", background: TERMINAL_BG }} />
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

  if (isLoading) return <ContainerInspectSkeleton />;

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

export function ContainerTabPanel({
  container,
  agentUrl,
  token,
  agentId,
  activeTab,
  onTabChange,
}: {
  container: Container;
  agentUrl: string;
  token: string;
  agentId: string;
  activeTab?: ContainerTab;
  onTabChange?: (tab: ContainerTab) => void;
}) {
  const [localTab, setLocalTab] = useState<ContainerTab>("overview");
  const isRunning = container.state.toLowerCase() === "running";
  const selectedTab = activeTab ?? localTab;
  const tab = !isRunning && (selectedTab === "stats" || selectedTab === "terminal") ? "overview" : selectedTab;

  const tabs: { id: ContainerTab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
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
            onClick={() => {
              if (onTabChange) {
                onTabChange(t.id);
              } else {
                setLocalTab(t.id);
              }
            }}
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
