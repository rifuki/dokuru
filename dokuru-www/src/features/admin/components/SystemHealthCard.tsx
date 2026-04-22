import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Server, Activity, Wifi } from "lucide-react";
import type { DashboardStats } from "../types/stats";

interface SystemHealthCardProps {
  health: DashboardStats["system_health"];
}

export function SystemHealthCard({ health }: SystemHealthCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/10 text-green-500 border-green-500/30";
      case "degraded":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/30";
      case "down":
        return "bg-red-500/10 text-red-500 border-red-500/30";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/30";
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Database */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Database</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(health.database.status)}>
              {health.database.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {health.database.response_time_ms}ms
            </span>
          </div>
        </div>

        {/* Redis */}
        {health.redis && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Redis</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getStatusColor(health.redis.status)}>
                {health.redis.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {health.redis.response_time_ms}ms
              </span>
            </div>
          </div>
        )}

        {/* Server Uptime */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Server</span>
          </div>
          <span className="text-sm font-medium">
            {formatUptime(health.server_uptime_seconds)}
          </span>
        </div>

        {/* WebSocket Connections */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">WebSockets</span>
          </div>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
            {health.active_websockets} active
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
