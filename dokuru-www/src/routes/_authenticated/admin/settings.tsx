import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Cable,
  Cookie,
  Database,
  FileCode2,
  Mail,
  RefreshCcw,
  Server,
  Settings2,
  Upload,
} from "lucide-react";

import { adminService } from "@/lib/api/services/admin-services";
import { AgentConnectionChart } from "@/features/admin/components/AgentConnectionChart";
import { SystemHealthCard } from "@/features/admin/components/SystemHealthCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

function parseLogLine(raw: string): ParsedLogLine {
  const match = raw.match(/^(\S+)\s+([A-Z]+)\s+(.*)$/);
  if (!match) {
    return { timestamp: null, level: "info", message: raw };
  }

  return {
    timestamp: formatLogTimestamp(match[1]),
    level: match[2].toLowerCase(),
    message: match[3],
  };
}

function ConfigItem({
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
    <div className="rounded-xl border bg-card/60 px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {source ? <Badge variant="outline" className="text-[10px] capitalize">{source}</Badge> : null}
      </div>
      <div className={`truncate text-sm ${mono ? "font-mono text-foreground/90" : "font-medium"}`}>{value || "—"}</div>
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

  const currentLogLevel = pendingLogLevel ?? normalizeLevel(logs?.runtime_level);

  const effectiveSources = config?.field_sources ?? {};

  const visibleLines = useMemo(() => {
    const lines = logs?.lines ?? [];
    return lines.filter((raw) => {
      const parsed = parseLogLine(raw);
      return (LEVEL_PRIORITY[parsed.level] ?? LEVEL_PRIORITY.info) >= (LEVEL_PRIORITY[filterLevel] ?? LEVEL_PRIORITY.trace);
    });
  }, [filterLevel, logs?.lines]);

  const editorContent = localConfigDraft ?? localConfig?.content ?? "";

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Runtime Logging</CardTitle>
              </div>
              <CardDescription>
                View recent application logs and adjust the runtime log level without restarting the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <Label htmlFor="log-level">Runtime Log Level</Label>
                  <div className="flex gap-2">
                    <Select value={currentLogLevel} onValueChange={setPendingLogLevel}>
                      <SelectTrigger id="log-level" className="w-[220px]">
                        <SelectValue placeholder="Select log level" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOG_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() =>
                        setLogLevelMutation.mutate(
                          currentLogLevel as "trace" | "debug" | "info" | "warn" | "error"
                        )
                      }
                      disabled={setLogLevelMutation.isPending}
                    >
                      {setLogLevelMutation.isPending ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{normalizeLevel(logs?.runtime_level).toUpperCase()}</Badge>
                    <span className="text-muted-foreground">active runtime filter</span>
                  </div>
                  {logs?.log_file && (
                    <div className="font-mono text-xs text-muted-foreground">{logs.log_file}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">View</span>
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoRefreshLogs((value) => !value)}
                    className={`rounded px-2 py-1 text-[10px] font-semibold uppercase transition ${
                      autoRefreshLogs ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {autoRefreshLogs ? "● live" : "live"}
                  </button>
                  <Button variant="outline" size="sm" onClick={() => void refetchLogs()} disabled={logsFetching}>
                    <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${logsFetching ? "animate-spin" : ""}`} />
                    Refresh logs
                  </Button>
                </div>
              </div>

              <div className="h-72 overflow-y-auto rounded-xl border bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
                {logsLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">Loading logs...</div>
                ) : visibleLines.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No logs matched the current filter.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {visibleLines.map((raw, index) => {
                      const parsed = parseLogLine(raw);
                      return (
                        <div key={`${parsed.timestamp ?? "raw"}-${index}`} className="flex gap-3">
                          <span className="w-[72px] shrink-0 text-muted-foreground/70">
                            {parsed.timestamp ?? "--:--:--"}
                          </span>
                          <span className={`w-10 shrink-0 font-semibold uppercase ${LEVEL_STYLES[parsed.level] ?? "text-slate-300"}`}>
                            {parsed.level.slice(0, 4)}
                          </span>
                          <span className="text-slate-200">{parsed.message}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
            <CardContent className="space-y-4">
              {configLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : config ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                    <Badge variant="outline">{config.source}</Badge>
                    <span>{config.is_production ? "Production mode" : "Development mode"}</span>
                    <span>·</span>
                    <span>{config.rust_env}</span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ConfigItem icon={Server} label="API Port" value={String(config.server.port)} source={effectiveSources["server.port"]} mono />
                    <ConfigItem icon={Cable} label="CORS Origins" value={config.server.cors_allowed_origins.join(", ")} source={effectiveSources["server.cors_allowed_origins"]} mono />
                    <ConfigItem icon={Activity} label="Default Log Level" value={config.logging.default_level} source={effectiveSources["logging.default_level"]} />
                    <ConfigItem icon={Cookie} label="Cookie Policy" value={`${config.cookie.same_site} · ${config.cookie.secure ? "secure" : "insecure"}`} source={effectiveSources["cookie.same_site"]} />
                    <ConfigItem icon={Cookie} label="HttpOnly" value={config.cookie.http_only ? "enabled" : "disabled"} source={effectiveSources["cookie.http_only"]} />
                    <ConfigItem icon={Upload} label="Upload Dir" value={config.upload.upload_dir} source={effectiveSources["upload.dir"]} mono />
                    <ConfigItem icon={Upload} label="Upload Base URL" value={config.upload.base_url} source={effectiveSources["upload.base_url"]} mono />
                    <ConfigItem icon={Mail} label="Email From" value={config.email.from_email} source={effectiveSources["email.from_email"]} mono />
                    <ConfigItem icon={Mail} label="Email Provider" value={config.email.provider} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <ConfigItem icon={Database} label="Redis" value={config.features.redis_enabled ? "enabled" : "disabled"} />
                    <ConfigItem icon={Upload} label="Uploads" value={config.features.uploads_enabled ? "enabled" : "disabled"} />
                    <ConfigItem icon={Mail} label="Email" value={config.features.email_enabled ? "enabled" : "disabled"} />
                  </div>
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
                Edit `local.toml` overrides here. These values override `defaults.toml`, but can still be overridden by environment variables.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">local.toml</Badge>
                  <span>{localConfig?.path ?? config?.local_config_path ?? "config/local.toml"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">env wins</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLocalConfigDraft(null);
                      void refetchLocalConfig();
                    }}
                    disabled={localConfigFetching}
                  >
                    <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${localConfigFetching ? "animate-spin" : ""}`} />
                    Reload file
                  </Button>
                </div>
              </div>

              <textarea
                value={editorContent}
                onChange={(event) => setLocalConfigDraft(event.target.value)}
                spellCheck={false}
                className="min-h-[280px] w-full rounded-xl border bg-black/40 p-4 font-mono text-sm text-slate-200 outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={LOCAL_TOML_PLACEHOLDER}
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {localConfigLoading ? "Loading local.toml..." : localConfig?.exists ? "Editing existing local.toml" : "local.toml does not exist yet; saving here will create it."}
                </div>
                <Button onClick={() => saveLocalConfigMutation.mutate(editorContent)} disabled={saveLocalConfigMutation.isPending}>
                  {saveLocalConfigMutation.isPending ? "Saving..." : "Save local.toml"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
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
            <CardContent className="grid gap-4 md:grid-cols-2">
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cable className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Agent Connection Mix</CardTitle>
              </div>
              <CardDescription>How agents currently connect into Dokuru.</CardDescription>
            </CardHeader>
            <CardContent>
              <AgentConnectionChart
                agentsByMode={stats?.agents_by_mode}
                totalAgents={stats?.total_agents ?? 0}
                loading={statsLoading}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
