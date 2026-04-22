import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BadgeInfo,
  Cable,
  ChevronDown,
  ChevronRight,
  Cookie,
  Database,
  FileCode2,
  Mail,
  RefreshCcw,
  Server,
  Settings2,
  Terminal,
  Upload,
} from "lucide-react";

import { adminService } from "@/lib/api/services/admin-services";
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
[logging]
default_level = "info"
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

function formatSourceLabel(source?: string) {
  if (!source) return null;
  if (source.startsWith("env:")) return source.replace("env:", "Env:").trim();
  if (source.startsWith("file:")) return source.replace("file:", "File:").trim();
  return source;
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  source,
  mono,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  source?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-1 border-b last:border-0 border-border/50 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium text-foreground/90">{label}</div>
      </div>
      <div className="flex items-center gap-3 text-right shrink-0">
        <div className={`truncate max-w-[200px] sm:max-w-[300px] text-sm ${mono ? "font-mono text-muted-foreground" : "text-muted-foreground"}`}>{value || "—"}</div>
        {source ? (
          <Badge variant="secondary" className="shrink-0 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0">
            {formatSourceLabel(source)}
          </Badge>
        ) : null}
      </div>
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
                    <span className="font-medium text-foreground/90">{config.is_production ? "Production Mode" : "Development Mode"}</span>
                    <span className="text-border">•</span>
                    <span className="font-mono text-xs text-muted-foreground">{config.rust_env}</span>
                  </div>

                  <ConfigSection
                    title="Bootstrap"
                    description="Initial admin bootstrap settings. Password remains outside this view because it should live in env or secrets."
                  >
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Enabled" value={config.bootstrap.enabled ? "enabled" : "disabled"} source={effectiveSources["bootstrap.enabled"]} />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Email" value={config.bootstrap.admin_email} source={effectiveSources["bootstrap.admin_email"]} mono />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Username" value={config.bootstrap.admin_username} source={effectiveSources["bootstrap.admin_username"]} mono />
                    <ConfigRow icon={BadgeInfo} label="Bootstrap Name" value={config.bootstrap.admin_name} source={effectiveSources["bootstrap.admin_name"]} />
                  </ConfigSection>

                  <ConfigSection
                    title="Server"
                    description="HTTP listener and origin policy. Changes here are validated by reload, but full application requires restart for port/CORS updates."
                  >
                    <ConfigRow icon={Server} label="API Port" value={String(config.server.port)} source={effectiveSources["server.port"]} mono />
                    <ConfigRow icon={Cable} label="CORS Origins" value={config.server.cors_allowed_origins.join(", ")} source={effectiveSources["server.cors_allowed_origins"]} mono />
                    <ConfigRow icon={Activity} label="Default Log Level" value={config.logging.default_level} source={effectiveSources["logging.default_level"]} />
                  </ConfigSection>

                  <ConfigSection
                    title="Cookie & Upload"
                    description="Client session behavior and media delivery settings that frontend behavior depends on."
                  >
                    <ConfigRow icon={Cookie} label="Cookie Policy" value={`${config.cookie.same_site} · ${config.cookie.secure ? "secure" : "insecure"}`} source={effectiveSources["cookie.same_site"]} />
                    <ConfigRow icon={Cookie} label="HttpOnly" value={config.cookie.http_only ? "enabled" : "disabled"} source={effectiveSources["cookie.http_only"]} />
                    <ConfigRow icon={Upload} label="Upload Dir" value={config.upload.upload_dir} source={effectiveSources["upload.dir"]} mono />
                    <ConfigRow icon={Upload} label="Upload Base URL" value={config.upload.base_url} source={effectiveSources["upload.base_url"]} mono />
                  </ConfigSection>

                  <ConfigSection
                    title="Delivery & Features"
                    description="Feature toggles inferred from the active config plus email delivery metadata."
                  >
                    <ConfigRow icon={Mail} label="Email From" value={config.email.from_email} source={effectiveSources["email.from_email"]} mono />
                    <ConfigRow icon={Mail} label="Email Provider" value={config.email.provider} />
                    <ConfigRow icon={Database} label="Redis" value={config.features.redis_enabled ? "enabled" : "disabled"} />
                    <ConfigRow icon={Upload} label="Uploads" value={config.features.uploads_enabled ? "enabled" : "disabled"} />
                    <ConfigRow icon={Mail} label="Email" value={config.features.email_enabled ? "enabled" : "disabled"} />
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
