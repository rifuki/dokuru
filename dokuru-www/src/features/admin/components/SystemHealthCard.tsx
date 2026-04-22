import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Server, Activity, Wifi, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { DashboardStats } from "../types/stats";
import { cn } from "@/lib/utils";

interface SystemHealthCardProps {
  health: DashboardStats["system_health"];
}

const statusConfig = {
  healthy:  { icon: CheckCircle2,   color: "text-emerald-500", bg: "bg-emerald-500/10",  label: "Healthy",  dot: "bg-emerald-500" },
  degraded: { icon: AlertTriangle,  color: "text-amber-500",   bg: "bg-amber-500/10",    label: "Degraded", dot: "bg-amber-500 animate-pulse" },
  down:     { icon: XCircle,        color: "text-red-500",     bg: "bg-red-500/10",       label: "Down",     dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const cfg = statusConfig[status] ?? statusConfig.healthy;
  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", cfg.bg, cfg.color)}>
      <div className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </div>
  );
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function SystemHealthCard({ health }: SystemHealthCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-500" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border">
        {/* Database */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Database className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Database</p>
              <p className="text-xs text-muted-foreground">{health.database.response_time_ms}ms response</p>
            </div>
          </div>
          <StatusBadge status={health.database.status} />
        </div>

        {/* Redis */}
        {health.redis && (
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Redis</p>
                <p className="text-xs text-muted-foreground">{health.redis.response_time_ms}ms response</p>
              </div>
            </div>
            <StatusBadge status={health.redis.status} />
          </div>
        )}

        {/* Server Uptime */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Server className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Server Uptime</p>
              <p className="text-xs text-muted-foreground">since last restart</p>
            </div>
          </div>
          <span className="text-sm font-semibold">{formatUptime(health.server_uptime_seconds)}</span>
        </div>

        {/* WebSockets */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Wifi className="h-4 w-4 text-cyan-500" />
            </div>
            <div>
              <p className="text-sm font-medium">WebSocket Relay</p>
              <p className="text-xs text-muted-foreground">active connections</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-500">
            <div className={cn("h-1.5 w-1.5 rounded-full bg-cyan-500", health.active_websockets > 0 && "animate-pulse")} />
            {health.active_websockets} active
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
