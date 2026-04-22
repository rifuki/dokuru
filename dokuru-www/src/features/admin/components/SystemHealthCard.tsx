import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Server, Activity, Wifi, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { DashboardStats } from "../types/stats";
import { cn } from "@/lib/utils";

interface SystemHealthCardProps {
  health: DashboardStats["system_health"];
}

const statusConfig = {
  healthy:  { icon: CheckCircle2,  color: "text-[hsl(142,45%,45%)]", bg: "bg-[hsl(142,40%,96%)] dark:bg-[hsl(142,40%,15%)]", label: "Healthy",  dot: "bg-[hsl(142,45%,45%)]" },
  degraded: { icon: AlertTriangle, color: "text-[hsl(38,50%,50%)]",  bg: "bg-[hsl(38,45%,96%)] dark:bg-[hsl(38,45%,15%)]",   label: "Degraded", dot: "bg-[hsl(38,50%,50%)] animate-pulse" },
  down:     { icon: XCircle,       color: "text-[hsl(0,45%,50%)]",   bg: "bg-[hsl(0,40%,96%)] dark:bg-[hsl(0,40%,15%)]",     label: "Down",     dot: "bg-[hsl(0,45%,50%)]" },
};

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const cfg = statusConfig[status] ?? statusConfig.healthy;
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", cfg.bg, cfg.color)}>
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
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[hsl(220,50%,96%)] dark:bg-[hsl(220,50%,15%)] flex items-center justify-center">
            <Activity className="h-4 w-4 text-[hsl(220,50%,55%)]" />
          </div>
          <CardTitle className="text-base font-semibold">System Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border/50">
        {/* Database */}
        <div className="flex items-center justify-between py-3 first:pt-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[hsl(220,50%,96%)] dark:bg-[hsl(220,50%,15%)] flex items-center justify-center">
              <Database className="h-4 w-4 text-[hsl(220,50%,55%)]" />
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
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[hsl(0,45%,96%)] dark:bg-[hsl(0,45%,15%)] flex items-center justify-center">
                <Activity className="h-4 w-4 text-[hsl(0,45%,50%)]" />
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
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[hsl(142,40%,96%)] dark:bg-[hsl(142,40%,15%)] flex items-center justify-center">
              <Server className="h-4 w-4 text-[hsl(142,45%,45%)]" />
            </div>
            <div>
              <p className="text-sm font-medium">Server</p>
              <p className="text-xs text-muted-foreground">Uptime {formatUptime(health.server_uptime_seconds)}</p>
            </div>
          </div>
          <StatusBadge status="healthy" />
        </div>

        {/* WebSocket */}
        <div className="flex items-center justify-between py-3 last:pb-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[hsl(180,40%,96%)] dark:bg-[hsl(180,40%,15%)] flex items-center justify-center">
              <Wifi className="h-4 w-4 text-[hsl(180,40%,50%)]" />
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
