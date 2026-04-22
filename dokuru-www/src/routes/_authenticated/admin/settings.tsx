import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api/services/admin-services";
import { AgentConnectionChart } from "@/features/admin/components/AgentConnectionChart";
import { SystemHealthCard } from "@/features/admin/components/SystemHealthCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, KeyRound, Settings2, Shield, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

const LOG_LEVELS = [
  { value: "trace", label: "Trace", description: "Most verbose logging" },
  { value: "debug", label: "Debug", description: "Detailed debugging information" },
  { value: "info", label: "Info", description: "General informational messages" },
  { value: "warn", label: "Warning", description: "Warning messages" },
  { value: "error", label: "Error", description: "Error messages only" },
] as const;

function AdminSettingsPage() {
  const [currentLogLevel, setCurrentLogLevel] = useState<string>(() => {
    if (typeof window === "undefined") return "info";
    return window.localStorage.getItem("dokuru_admin_log_level") ?? "info";
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminService.getDashboardStats,
  });

  const setLogLevelMutation = useMutation({
    mutationFn: (level: "trace" | "debug" | "info" | "warn" | "error") =>
      adminService.setLogLevel(level),
    onSuccess: () => {
      toast.success("Log level updated successfully");
    },
    onError: () => {
      toast.error("Failed to update log level");
    },
  });

  const handleLogLevelChange = (value: string) => {
    setCurrentLogLevel(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dokuru_admin_log_level", value);
    }
    setLogLevelMutation.mutate(value as "trace" | "debug" | "info" | "warn" | "error");
  };

  const metrics = [
    {
      title: "Users",
      value: stats?.total_users ?? 0,
      description: "Registered accounts",
      icon: Users,
      iconWrapClassName: "bg-blue-100 dark:bg-blue-950/30",
      iconClassName: "text-blue-600",
    },
    {
      title: "Agents",
      value: stats?.total_agents ?? 0,
      description: "Tracked by this instance",
      icon: Activity,
      iconWrapClassName: "bg-emerald-100 dark:bg-emerald-950/30",
      iconClassName: "text-emerald-600",
    },
    {
      title: "Audits",
      value: stats?.total_audits ?? 0,
      description: "Stored audit records",
      icon: Shield,
      iconWrapClassName: "bg-amber-100 dark:bg-amber-950/30",
      iconClassName: "text-amber-600",
    },
    {
      title: "WebSockets",
      value: stats?.system_health.active_websockets ?? 0,
      description: "Active relay connections",
      icon: Wifi,
      iconWrapClassName: "bg-violet-100 dark:bg-violet-950/30",
      iconClassName: "text-violet-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">
          Configure application-wide settings
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Runtime Controls</CardTitle>
              </div>
              <CardDescription>
                Apply operational changes to the current Dokuru server process.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="log-level">Log Level</Label>
                <Select value={currentLogLevel} onValueChange={handleLogLevelChange}>
                  <SelectTrigger id="log-level">
                    <SelectValue placeholder="Select log level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{level.label}</span>
                          <span className="text-xs text-muted-foreground">{level.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                Changes apply immediately and affect server-side tracing output only. No restart required.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Platform Snapshot</CardTitle>
              </div>
              <CardDescription>
                Quick operational metrics from the current Dokuru deployment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {metrics.map((metric) => (
                    <div key={metric.title} className="rounded-xl border bg-card px-4 py-4">
                      <div className="mb-3 flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${metric.iconWrapClassName}`}>
                          <metric.icon className={`h-4 w-4 ${metric.iconClassName}`} />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">{metric.title}</span>
                      </div>
                      <p className="text-2xl font-bold tracking-tight">{metric.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Access Snapshot</CardTitle>
              </div>
              <CardDescription>
                Current API key and relay activity at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">API Keys</p>
                <p className="mt-2 text-2xl font-bold">{stats?.total_api_keys ?? 0}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Keys</p>
                <p className="mt-2 text-2xl font-bold">{stats?.active_api_keys ?? 0}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Relay Agents</p>
                <p className="mt-2 text-2xl font-bold">{stats?.relay_agents_count ?? 0}</p>
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

          <AgentConnectionChart
            agentsByMode={stats?.agents_by_mode}
            totalAgents={stats?.total_agents ?? 0}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
