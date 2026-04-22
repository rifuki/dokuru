import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Server, Activity, Wifi, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { DashboardStats } from "../types/stats";
import { cn } from "@/lib/utils";

interface SystemHealthCardProps {
  health: DashboardStats["system_health"];
}

const statusConfig = {
  healthy:  { icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950/30", label: "Healthy",  dot: "bg-emerald-500" },
  degraded: { icon: AlertTriangle, color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-950/30",   label: "Degraded", dot: "bg-amber-500 animate-pulse" },
  down:     { icon: XCircle,       color: "text-red-600",   bg: "bg-red-100 dark:bg-red-950/30",     label: "Down",     dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const cfg = statusConfig[status] ?? statusConfig.healthy;
  return (
    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", cfg.bg, cfg.color)}>
      <div className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </div>
  );
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function SystemHealthCard({ health }: SystemHealthCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border/50">
        {/* Database */}
        <div className="flex items-center justify-between py-2.5 first:pt-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Database</p>
              <p className="text-xs text-muted-foreground">{health.database.response_time_ms}ms</p>
            </div>
          </div>
          <StatusBadge status={health.database.status} />
        </div>

        {/* Redis */}
        {health.redis && (
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Redis</p>
                <p className="text-xs text-muted-foreground">{health.redis.response_time_ms}ms</p>
              </div>
            </div>
            <StatusBadge status={health.redis.status} />
          </div>
        )}

        {/* Server */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
              <Server className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Server</p>
              <p className="text-xs text-muted-foreground">Up {formatUptime(health.server_uptime_seconds)}</p>
            </div>
          </div>
          <StatusBadge status="healthy" />
        </div>

        {/* WebSocket */}
        <div className="flex items-center justify-between py-2.5 last:pb-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-cyan-100 dark:bg-cyan-950/30 flex items-center justify-center">
              <Wifi className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium">WebSocket</p>
              <p className="text-xs text-muted-foreground">{health.active_websockets} connections</p>
            </div>
          </div>
          <StatusBadge status="healthy" />
        </div>
      </CardContent>
    </Card>
  );
}
