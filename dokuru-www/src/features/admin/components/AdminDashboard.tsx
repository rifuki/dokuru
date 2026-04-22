import {
  Users, Shield, AlertCircle, Activity, TrendingUp, ArrowUpRight,
  Database, Server, Wifi, CheckCircle2, Clock
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";
import { useAdminAgentStatuses } from "@/features/admin/hooks/use-admin-agent-statuses";
import { adminService } from "@/lib/api/services/admin-services";
import { adminKeys } from "@/features/admin/hooks/use-dashboard-stats";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

export function AdminDashboard() {
  const user = useAuthUser();
  const { data: stats, isLoading, isFetching } = useDashboardStats();
  const { data: agentData } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: adminService.getAdminAgents,
  });
  const adminAgents = agentData?.agents ?? [];
  const { counts: liveAgentCounts } = useAdminAgentStatuses(adminAgents);
  const queryClient = useQueryClient();

  if (user?.role !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You don&apos;t have permission to access this page.
        </AlertDescription>
      </Alert>
    );
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "agents"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "agents", "live-status"] });
  };

  const liveOnlineAgents = adminAgents.length > 0 ? liveAgentCounts.online : (stats?.active_agents ?? 0);
  const recentHeartbeatAgents = adminAgents.length > 0 ? liveAgentCounts.recentHeartbeat : (stats?.active_agents ?? 0);

  const statCards = [
    { label: "Total Users", value: stats?.total_users ?? 0, change: `+${stats?.new_users_this_month ?? 0} this month`, icon: Users, href: "/admin/users", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
    { label: "Reachable Agents", value: liveOnlineAgents, change: `${recentHeartbeatAgents} recent heartbeat`, icon: Activity, href: "/admin/agents", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Total Audits", value: stats?.total_audits ?? 0, change: `${stats?.audits_this_month ?? 0} this month`, icon: Shield, href: "/admin/audits", color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
    { label: "Security Score", value: `${Math.round(stats?.average_score ?? 0)}%`, change: "Average", icon: TrendingUp, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
  ];

  // Prepare chart data
  const auditChartData = stats?.audit_activity?.map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    audits: day.count
  })) ?? [];

  const connectionData = [
    { name: "Cloudflare", value: stats?.agents_by_mode?.cloudflare ?? 0, color: "#f97316" },
    { name: "Direct", value: stats?.agents_by_mode?.direct ?? 0, color: "#3b82f6" },
    { name: "Relay", value: stats?.agents_by_mode?.relay ?? 0, color: "#10b981" },
    { name: "Domain", value: stats?.agents_by_mode?.domain ?? 0, color: "#8b5cf6" },
  ].filter(d => d.value > 0);

  const totalConnections = connectionData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user?.username || user?.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          {isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.href || "#"} className={!stat.href ? "pointer-events-none" : ""}>
            <div className="group relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg hover:border-primary/50">
              <div className="flex items-start justify-between mb-4">
                <div className={`rounded-lg p-2.5 ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                {stat.href && (
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-all group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-bold tracking-tight">
                  {isLoading ? "—" : stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Audit Activity Chart */}
          <div className="rounded-xl border bg-card">
            <div className="border-b p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Audit Activity</h3>
                  <p className="text-sm text-muted-foreground">Last 7 days performance</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{auditChartData.reduce((s, d) => s + d.audits, 0)}</p>
                  <p className="text-xs text-muted-foreground">Total audits</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {isLoading ? (
                <div className="flex h-[280px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={auditChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#fff'
                      }}
                    />
                    <Bar 
                      dataKey="audits" 
                      fill="#3b82f6"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={50}
                      animationDuration={800}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent Users */}
          <div className="rounded-xl border bg-card">
            <div className="border-b p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Recent Users</h3>
                <Link to="/admin/users" className="text-sm text-primary hover:underline flex items-center gap-1">
                  View all
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <div className="flex h-[200px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                </div>
              ) : stats?.recent_registrations && stats.recent_registrations.length > 0 ? (
                stats.recent_registrations.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {(user.username || user.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.username || user.email}</p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.email_verified ? (
                        <div className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="h-3 w-3" />
                          Pending
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  No recent users
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-6">
          {/* Connection Types */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">Connection Types</h3>
            {isLoading ? (
              <div className="flex h-[200px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              </div>
            ) : connectionData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={connectionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {connectionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {connectionData.map((type) => {
                    const percentage = totalConnections > 0 ? Math.round((type.value / totalConnections) * 100) : 0;
                    return (
                      <div key={type.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} />
                          <span className="text-sm">{type.name}</span>
                        </div>
                        <span className="text-sm font-semibold">{type.value} ({percentage}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                No agents connected
              </div>
            )}
          </div>

          {/* System Health */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">System Health</h3>
            {stats?.system_health ? (
              <div className="space-y-4">
                {/* Database */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                    <Database className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">PostgreSQL</p>
                    <p className="text-xs text-muted-foreground">{stats.system_health.database.response_time_ms}ms response</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    Healthy
                  </div>
                </div>

                {/* Redis */}
                {stats.system_health.redis && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                      <Activity className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">Redis Cache</p>
                      <p className="text-xs text-muted-foreground">{stats.system_health.redis.response_time_ms}ms response</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      Healthy
                    </div>
                  </div>
                )}

                {/* Server */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                    <Server className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Server</p>
                    <p className="text-xs text-muted-foreground">
                      Uptime {Math.floor(stats.system_health.server_uptime_seconds / 3600)}h
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    Online
                  </div>
                </div>

                {/* WebSocket */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/30">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/50">
                    <Wifi className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">WebSocket</p>
                    <p className="text-xs text-muted-foreground">{stats.system_health.active_websockets} active connections</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
