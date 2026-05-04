import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BadgeInfo,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Cookie,
  Database,
  FileCode2,
  Mail,
  Pencil,
  RefreshCcw,
  Server,
  Settings2,
  Upload,
  X,
  Eye,
  EyeOff,
  Terminal,
} from "lucide-react";

import { adminService, type ConfigSourceDetail } from "@/lib/api/services/admin-services";
import { AgentConnectionChart } from "@/features/admin/components/AgentConnectionChart";
import { SystemHealthCard } from "@/features/admin/components/SystemHealthCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;
const LEVEL_PRIORITY: Record<string, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const LEVEL_STYLES: Record<string, string> = {
  trace: "text-slate-500",
  debug: "text-sky-400",
  info: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const ANSI_ESCAPE_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

const LOCAL_TOML_PLACEHOLDER = `# Example
[app]
rust_log = "info"
`;

type ParsedLogLine = {
  timestamp: string | null;
  level: string;
  message: string;
};

function normalizeLevel(raw: string | undefined) {
  const level = raw?.split("=").pop()?.trim().toLowerCase() ?? "info";
  return LOG_LEVELS.includes(level as (typeof LOG_LEVELS)[number]) ? level : "info";
}

function formatLogTimestamp(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function stripAnsi(raw: string) {
  return raw.replace(ANSI_ESCAPE_REGEX, "");
}

function tidyHttpTraceMessage(raw: string) {
  const withoutPrefix = raw.replace(
    /^http_request:\s+http_trace::on_response:\s+.*?http_trace\.rs:\d+:\s*/,
    ""
  );

  return withoutPrefix
    .split(/\s(?:method|uri|version|client_ip|request_id)=/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function parseLogLine(raw: string): ParsedLogLine {
  const cleaned = stripAnsi(raw).trim();
  const match = cleaned.match(/^(\S+)\s+([A-Z]+)\s+(.*)$/);

  if (!match) {
    return {
      timestamp: null,
      level: "info",
      message: cleaned,
    };
  }

  const messageBody = match[3].includes("http_request: http_trace::on_response:")
    ? tidyHttpTraceMessage(match[3])
    : match[3].replace(/\s+/g, " ").trim();

  return {
    timestamp: formatLogTimestamp(match[1]),
    level: match[2].toLowerCase(),
    message: messageBody,
  };
}

type SourceKind = "env" | "local" | "secrets" | "defaults" | "runtime" | "unknown";

function parseSource(source?: string): { kind: SourceKind; label: string; detail: string } {
  if (!source) return { kind: "unknown", label: "?", detail: "" };
  if (source.startsWith("env:")) {
    const varName = source.slice(4).trim();
    return { kind: "env", label: "env", detail: varName };
  }
  if (source.includes("local.toml"))   return { kind: "local",    label: "local",    detail: "local.toml" };
  if (source.includes("secrets.toml")) return { kind: "secrets",  label: "secrets",  detail: "secrets.toml" };
  if (source.includes("defaults.toml"))return { kind: "defaults", label: "defaults", detail: "defaults.toml" };
  if (source === "runtime")            return { kind: "runtime",  label: "runtime",  detail: "runtime" };
  return { kind: "unknown", label: "?", detail: source };
}

const SOURCE_DOT: Record<SourceKind, string> = {
  env:      "bg-violet-400",
  local:    "bg-sky-400",
  secrets:  "bg-amber-400",
  defaults: "bg-muted-foreground/40",
  runtime:  "bg-muted-foreground/40",
  unknown:  "bg-muted-foreground/20",
};

function MaskedValue({ value, isSensitive, mono }: { value: string; isSensitive: boolean; mono?: boolean }) {
  const [show, setShow] = useState(false);
  
  if (!isSensitive) {
    return <span className={`truncate text-sm ${mono ? "font-mono" : ""} text-foreground/90 text-right`}>{value || "—"}</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className={`truncate text-sm ${mono && show ? "font-mono" : ""} text-foreground/90 text-right tracking-tight`}>
        {show ? (value || "—") : "••••••••"}
      </span>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground transition-colors"
      >
        {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </div>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  sources,
  mono,
  tomlPath,
  onSave,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  sources?: ConfigSourceDetail[];
  mono?: boolean;
  tomlPath?: string[];
  onSave?: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSource = sources?.[0];
  const parsedActive = parseSource(activeSource?.source);
  const hasMultiple = (sources?.length ?? 0) > 1;

  const isEditable = Boolean(tomlPath && onSave);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function cancel() {
    setEditing(false);
    setDraft("");
  }

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === value.trim()) { cancel(); return; }
    setSaving(true);
    try {
      await onSave?.(trimmed);
      setEditing(false);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col border-b last:border-0 border-border/30 rounded-sm">
      <div className="grid grid-cols-1 gap-2 px-3 py-2.5 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(150px,1fr)_100px_minmax(150px,1fr)] sm:items-center sm:gap-4">
        {/* Left: icon + label */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="truncate text-sm font-medium text-foreground/80">{label}</span>
          {hasMultiple && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
              title="View overridden values"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {/* Middle: source dot + tiny text */}
        <div className="flex items-center gap-1.5 justify-start">
          {activeSource && (
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-muted/30 transition-colors" title={parsedActive.detail || parsedActive.label}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${SOURCE_DOT[parsedActive.kind]}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{parsedActive.label}</span>
            </div>
          )}
        </div>

        {/* Right: value + edit */}
        <div className="flex min-w-0 shrink-0 items-center justify-start gap-2 sm:justify-end">
          {editing ? (
            <>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit();
                  if (e.key === "Escape") cancel();
                }}
                autoFocus
                className="h-7 w-full max-w-[200px] rounded border bg-background px-2.5 font-mono text-xs text-foreground shadow-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => void commit()}
                disabled={saving}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
              >
                {saving ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/60 text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <MaskedValue 
                value={activeSource?.value ?? value} 
                isSensitive={parsedActive.kind === "env" || parsedActive.kind === "secrets"} 
                mono={mono} 
              />
              {isEditable && (
                <button
                  type="button"
                  onClick={startEdit}
                  title={`Edit ${label}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border/40 text-muted-foreground/60 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all ml-1"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && hasMultiple && (
        <div className="space-y-2 border-t border-border/10 bg-muted/5 px-3 pb-3 pt-1 sm:pl-[46px]">
          {sources!.slice(1).map((src, i) => {
            const parsed = parseSource(src.source);
            return (
              <div key={i} className="grid grid-cols-1 gap-1 sm:grid-cols-[100px_minmax(150px,1fr)] sm:items-center sm:gap-4">
                <div className="flex items-center gap-1.5" title={parsed.detail || parsed.label}>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${SOURCE_DOT[parsed.kind]}`} />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">{parsed.label}</span>
                </div>
                <div className="flex justify-start sm:justify-end sm:pr-9">
                  <MaskedValue 
                    value={src.value} 
                    isSensitive={parsed.kind === "env" || parsed.kind === "secrets"} 
                    mono={mono} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium tracking-tight text-foreground/90">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="rounded-xl border bg-card px-4 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  accentClassName,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: typeof Activity;
  accentClassName: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4">
      <div className="mb-3 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accentClassName}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AdminSettingsPage() {
  const [pendingLogLevel, setPendingLogLevel] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>("trace");
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [localConfigDraft, setLocalConfigDraft] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminService.getDashboardStats,
  });

  const {
    data: logs,
    isLoading: logsLoading,
    isFetching: logsFetching,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["admin", "logs"],
    queryFn: adminService.getLogs,
    refetchInterval: autoRefreshLogs ? 3_000 : false,
  });

  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: adminService.getEffectiveConfig,
  });

  const {
    data: localConfig,
    isLoading: localConfigLoading,
    isFetching: localConfigFetching,
    refetch: refetchLocalConfig,
  } = useQuery({
    queryKey: ["admin", "config", "local"],
    queryFn: adminService.getLocalConfig,
  });

  const setLogLevelMutation = useMutation({
    mutationFn: (level: "trace" | "debug" | "info" | "warn" | "error") =>
      adminService.setLogLevel(level),
    onSuccess: (_, nextLevel) => {
      setPendingLogLevel(null);
      toast.success(`Runtime log level -> ${nextLevel}`);
      void refetchLogs();
    },
    onError: () => {
      toast.error("Failed to update log level");
    },
  });

  const saveLocalConfigMutation = useMutation({
    mutationFn: (content: string) => adminService.saveLocalConfig(content),
    onSuccess: (result) => {
      setLocalConfigDraft(result.content);
      toast.success("local.toml saved");
      void Promise.all([refetchLocalConfig(), refetchConfig()]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save local config");
    },
  });

  const reloadConfigMutation = useMutation({
    mutationFn: () => adminService.reloadConfig(),
    onSuccess: async (result) => {
      toast.success(result.message);
      setLocalConfigDraft(null);
      await Promise.all([refetchConfig(), refetchLocalConfig()]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reload config preview");
    },
  });

  const currentLogLevel = pendingLogLevel ?? normalizeLevel(logs?.runtime_level);
  const effectiveSources = config?.field_sources ?? {};
  const editorContent = localConfigDraft ?? localConfig?.content ?? "";


  const updateFieldMutation = useMutation({
    mutationFn: ({ path, value, target }: { path: string[]; value: string; target?: "local" | "secrets" }) =>
      adminService.updateConfigField(path, value, target),
    onSuccess: (result) => {
      setLocalConfigDraft(result.content);
      void Promise.all([refetchConfig(), refetchLocalConfig()]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save field");
    },
  });

  function makeFieldSaver(label: string, path: string[], target: "local" | "secrets" = "local") {
    return async (newValue: string) => {
      await updateFieldMutation.mutateAsync({ path, value: newValue, target });
      toast.success(`${label} → saved to ${target}.toml`);
    };
  }


  const visibleLines = useMemo(() => {
    const lines = logs?.lines ?? [];
    return lines
      .map(parseLogLine)
      .filter(
        (parsed) =>
          (LEVEL_PRIORITY[parsed.level] ?? LEVEL_PRIORITY.info) >=
          (LEVEL_PRIORITY[filterLevel] ?? LEVEL_PRIORITY.trace)
      );
  }, [filterLevel, logs?.lines]);

  const metrics = [
    {
      title: "Users",
      value: stats?.total_users ?? 0,
      description: "Registered accounts",
      icon: Activity,
      accentClassName: "bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
    },
    {
      title: "Agents",
      value: stats?.total_agents ?? 0,
      description: "Tracked by this instance",
      icon: Server,
      accentClassName: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    },
    {
      title: "Audits",
      value: stats?.total_audits ?? 0,
      description: "Stored audit records",
      icon: Database,
      accentClassName: "bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    },
    {
      title: "WebSockets",
      value: stats?.system_health.active_websockets ?? 0,
      description: "Active relay connections",
      icon: Cable,
      accentClassName: "bg-violet-100 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Settings</h1>
        <p className="text-muted-foreground">
          Runtime controls, recent logs, and the effective server configuration.
        </p>
      </div>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-muted/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLogsOpen((value) => !value)}
              className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
            >
              {logsOpen ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-hover:text-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:text-foreground" />
              )}
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-sm">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight">Runtime Logging</div>
            </div>
          </div>

          <div className="flex w-full items-center gap-1.5 overflow-x-auto rounded-xl border bg-background p-1 shadow-sm lg:w-auto">
            <div className="flex items-center gap-1 border-r border-border/50 px-2">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Level
              </span>
              <Select value={currentLogLevel} onValueChange={setPendingLogLevel}>
                <SelectTrigger className="h-7 w-[90px] border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map((level) => (
                    <SelectItem key={level} value={level} className="text-xs">
                      {level.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs font-medium hover:bg-primary/10 hover:text-primary"
                onClick={() =>
                  setLogLevelMutation.mutate(
                    currentLogLevel as "trace" | "debug" | "info" | "warn" | "error"
                  )
                }
                disabled={setLogLevelMutation.isPending || currentLogLevel === normalizeLevel(logs?.runtime_level)}
              >
                {setLogLevelMutation.isPending ? "..." : "Apply"}
              </Button>
            </div>

            <div className="flex items-center gap-1 px-2">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Live
              </span>
              <button
                type="button"
                onClick={() => setAutoRefreshLogs((value) => !value)}
                className={`h-6 rounded-md px-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  autoRefreshLogs ? "bg-emerald-500/15 text-emerald-500" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {autoRefreshLogs ? "ON" : "OFF"}
              </button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-muted-foreground hover:text-foreground" 
                onClick={() => void refetchLogs()} 
                disabled={logsFetching}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${logsFetching ? "animate-spin" : ""}`} />
                <span className="sr-only">Refresh logs</span>
              </Button>
            </div>
          </div>
        </div>

        {logsOpen ? (
          <div className="border-t px-4 pb-4 pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  View
                </span>
                {LOG_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFilterLevel(level)}
                    className={`rounded px-2 py-0.5 text-[10px] font-mono font-semibold uppercase transition ${
                      filterLevel === level
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{normalizeLevel(logs?.runtime_level).toUpperCase()}</Badge>
                <span className="text-muted-foreground">active runtime filter</span>
                {logs?.log_file ? (
                  <span className="font-mono text-xs text-muted-foreground">{logs.log_file}</span>
                ) : null}
              </div>
            </div>

            <div className="h-80 overflow-y-auto rounded-xl border bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
              {logsLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Loading logs...
                </div>
              ) : visibleLines.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No logs matched the current filter.
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleLines.map((parsed, index) => (
                    <div key={`${parsed.timestamp ?? "raw"}-${index}`} className="grid grid-cols-[88px_56px_minmax(0,1fr)] gap-3 py-[2px]">
                      <span className="text-muted-foreground/70">{parsed.timestamp ?? "--:--:--"}</span>
                      <span className={`font-semibold uppercase ${LEVEL_STYLES[parsed.level] ?? "text-slate-300"}`}>
                        {parsed.level.slice(0, 4)}
                      </span>
                      <span className="whitespace-pre-wrap break-words text-slate-200">{parsed.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <div className="space-y-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Effective Configuration</CardTitle>
              </div>
              <CardDescription>
                The active server configuration after startup, resolved from embedded TOML defaults plus optional mounted files and environment overrides.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-6">
              {configLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : config ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-sm shadow-sm">
                    <Badge variant="secondary" className="font-normal uppercase tracking-wider text-[10px]">{config.source}</Badge>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ENV</span>
                      <span className="font-mono text-xs font-medium text-foreground/90">{config.app.rust_env}</span>
                    </div>
                  </div>

                  <ConfigSection
                    title="Bootstrap"
                    description="Initial admin bootstrap settings. Password remains outside this view because it should live in env or secrets."
                  >
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Enabled" value={config.bootstrap.enabled ? "enabled" : "disabled"} sources={effectiveSources["bootstrap.enabled"]} tomlPath={["bootstrap","enabled"]} onSave={makeFieldSaver("Bootstrap Enabled",["bootstrap","enabled"])} />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Email" value={config.bootstrap.admin_email} sources={effectiveSources["bootstrap.admin_email"]} mono tomlPath={["bootstrap","admin_email"]} onSave={makeFieldSaver("Bootstrap Email",["bootstrap","admin_email"])} />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Username" value={config.bootstrap.admin_username} sources={effectiveSources["bootstrap.admin_username"]} mono tomlPath={["bootstrap","admin_username"]} onSave={makeFieldSaver("Bootstrap Username",["bootstrap","admin_username"])} />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Name" value={config.bootstrap.admin_name} sources={effectiveSources["bootstrap.admin_name"]} tomlPath={["bootstrap","admin_name"]} onSave={makeFieldSaver("Bootstrap Name",["bootstrap","admin_name"])} />
                  </ConfigSection>

                  <ConfigSection
                    title="Server"
                    description="HTTP listener and origin policy. Changes here are validated by reload, but full application requires restart for port/CORS updates."
                  >
                    <ConfigRow icon={Server} label="API Port" value={String(config.server.port)} sources={effectiveSources["server.port"]} mono tomlPath={["server","port"]} onSave={makeFieldSaver("API Port",["server","port"])} />
                    <ConfigRow icon={Cable} label="CORS Origins" value={config.server.cors_allowed_origins.join(", ")} sources={effectiveSources["server.cors_allowed_origins"]} mono tomlPath={["server","cors_allowed_origins"]} onSave={makeFieldSaver("CORS Origins",["server","cors_allowed_origins"])} />
                    <ConfigRow icon={Activity} label="Default Log Level" value={config.app.rust_log} sources={effectiveSources["app.rust_log"]} tomlPath={["app","rust_log"]} onSave={makeFieldSaver("Default Log Level",["app","rust_log"])} />
                  </ConfigSection>

                  <ConfigSection
                    title="Cookie & Upload"
                    description="Client session behavior and media delivery settings that frontend behavior depends on."
                  >
                    <ConfigRow icon={Cookie} label="Cookie Policy" value={`${config.cookie.same_site} · ${config.cookie.secure ? "secure" : "insecure"}`} sources={effectiveSources["cookie.same_site"]} />
                    <ConfigRow icon={Cookie} label="HttpOnly" value={config.cookie.http_only ? "enabled" : "disabled"} sources={effectiveSources["cookie.http_only"]} />
                    <ConfigRow icon={Upload} label="Upload Dir" value={config.upload.upload_dir} sources={effectiveSources["upload.dir"]} mono tomlPath={["upload","dir"]} onSave={makeFieldSaver("Upload Dir",["upload","dir"])} />
                    <ConfigRow icon={Upload} label="Upload Base URL" value={config.upload.base_url} sources={effectiveSources["upload.base_url"]} mono tomlPath={["upload","base_url"]} onSave={makeFieldSaver("Upload Base URL",["upload","base_url"])} />
                  </ConfigSection>

                  <ConfigSection
                    title="Database"
                    description="PostgreSQL connection settings. URL is sensitive — stored in env or secrets.toml."
                  >
                    <ConfigRow icon={Database} label="Database URL" value={config.database.url_configured ? "configured" : "not set"} sources={effectiveSources["database.url"]} mono />
                    <ConfigRow icon={Database} label="Max Connections" value={String(config.database.max_connections)} sources={effectiveSources["database.max_connections"]} mono tomlPath={["database","max_connections"]} onSave={makeFieldSaver("Max Connections",["database","max_connections"])} />
                    <ConfigRow icon={Database} label="Min Connections" value={String(config.database.min_connections)} sources={effectiveSources["database.min_connections"]} mono tomlPath={["database","min_connections"]} onSave={makeFieldSaver("Min Connections",["database","min_connections"])} />
                  </ConfigSection>

                  <ConfigSection
                    title="Redis"
                    description="Redis connection for sessions and caching. URL is sensitive — stored in env or secrets.toml."
                  >
                    <ConfigRow icon={Database} label="Redis URL" value={config.redis.url_configured ? "configured" : "not set"} sources={effectiveSources["redis.url"]} mono />
                  </ConfigSection>

                  <ConfigSection
                    title="Auth & Tokens"
                    description="JWT signing secrets and token expiry durations. Secrets must live in env or secrets.toml."
                  >
                    <ConfigRow icon={Server} label="Access Secret" value={config.auth.access_secret_configured ? "configured" : "not set"} sources={effectiveSources["auth.access_secret"]} mono />
                    <ConfigRow icon={Server} label="Refresh Secret" value={config.auth.refresh_secret_configured ? "configured" : "not set"} sources={effectiveSources["auth.refresh_secret"]} mono />
                    <ConfigRow icon={Server} label="Access Token Expiry" value={`${config.auth.access_expiry_secs}s`} sources={effectiveSources["auth.access_expiry_secs"]} mono tomlPath={["auth","access_expiry_secs"]} onSave={makeFieldSaver("Access Expiry",["auth","access_expiry_secs"])} />
                    <ConfigRow icon={Server} label="Refresh Token Expiry" value={`${config.auth.refresh_expiry_secs}s`} sources={effectiveSources["auth.refresh_expiry_secs"]} mono tomlPath={["auth","refresh_expiry_secs"]} onSave={makeFieldSaver("Refresh Expiry",["auth","refresh_expiry_secs"])} />
                  </ConfigSection>

                  <ConfigSection
                    title="Email"
                    description="Email delivery via Resend. API key is sensitive — store in env or secrets.toml."
                  >
                    <ConfigRow icon={Mail} label="Resend API Key" value={config.features.email_enabled ? "configured" : "not set"} sources={effectiveSources["email.resend_api_key"]} mono />
                    <ConfigRow icon={Mail} label="From Email" value={config.email.from_email} sources={effectiveSources["email.from_email"]} mono tomlPath={["email","from_email"]} onSave={makeFieldSaver("From Email",["email","from_email"])} />
                    <ConfigRow icon={Mail} label="Provider" value={config.email.provider} />
                  </ConfigSection>

                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileCode2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Local Override Editor</CardTitle>
              </div>
              <CardDescription>
                Edit `local.toml` overrides here. These values override `defaults.toml`, but environment variables still take precedence.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              <div className="overflow-hidden rounded-xl border bg-muted/10 shadow-sm focus-within:ring-1 focus-within:ring-primary/50 transition-shadow">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground/90">local.toml</span>
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:inline-block">
                      {localConfig?.path ?? config?.local_config_path ?? "config/local.toml"}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-normal uppercase tracking-wider text-[10px] hidden sm:inline-flex px-1.5 py-0">
                      env wins
                    </Badge>
                    <div className="h-4 w-px bg-border mx-1 hidden sm:block" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => void reloadConfigMutation.mutateAsync()}
                      disabled={reloadConfigMutation.isPending}
                    >
                      <RefreshCcw className={`mr-1.5 h-3 w-3 ${reloadConfigMutation.isPending ? "animate-spin" : ""}`} />
                      Reload Config
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setLocalConfigDraft(null);
                        void refetchLocalConfig();
                      }}
                      disabled={localConfigFetching}
                    >
                      <RefreshCcw className={`mr-1.5 h-3 w-3 ${localConfigFetching ? "animate-spin" : ""}`} />
                      Reload File
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={editorContent}
                    onChange={(event) => setLocalConfigDraft(event.target.value)}
                    spellCheck={false}
                    className="min-h-[320px] w-full resize-y bg-black/40 p-5 font-mono text-[13px] leading-relaxed text-slate-200 outline-none placeholder:text-muted-foreground/50 focus:bg-black/60 transition-colors"
                    placeholder={LOCAL_TOML_PLACEHOLDER}
                  />
                </div>

                <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${localConfig?.exists ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                    {localConfigLoading
                      ? "Loading file state..."
                      : localConfig?.exists
                      ? "Editing existing file."
                      : "File does not exist; saving will create it."}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => saveLocalConfigMutation.mutate("")}
                      disabled={saveLocalConfigMutation.isPending}
                    >
                      Reset File
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 px-4 text-xs font-semibold shadow-sm"
                      onClick={() => saveLocalConfigMutation.mutate(editorContent)}
                      disabled={saveLocalConfigMutation.isPending}
                    >
                      {saveLocalConfigMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {stats?.system_health ? (
          <SystemHealthCard health={stats.system_health} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Waiting for runtime health data.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Application Snapshot</CardTitle>
            <CardDescription>Current usage and operational totals.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 grid-cols-2">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                description={metric.description}
                icon={metric.icon}
                accentClassName={metric.accentClassName}
              />
            ))}
          </CardContent>
        </Card>

        <AgentConnectionChart
          agentsByMode={stats?.agents_by_mode}
          totalAgents={stats?.total_agents ?? 0}
          loading={statsLoading}
        />
      </div>
    </div>
    </div>
  );
}
