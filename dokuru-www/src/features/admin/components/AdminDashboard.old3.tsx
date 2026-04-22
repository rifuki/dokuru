import {
  Users, Shield, AlertCircle, Activity, TrendingUp, ArrowUpRight
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";
import { useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "@/features/admin/hooks/use-dashboard-stats";
import { formatDistanceToNow } from "date-fns";

export function AdminDashboard() {
  const user = useAuthUser();
  const { data: stats, isLoading, isFetching } = useDashboardStats();
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
  };

  const statCards = [
    { label: "Users", value: stats?.total_users ?? 0, change: `+${stats?.new_users_this_month ?? 0}`, icon: Users, href: "/admin/users" },
    { label: "Agents", value: stats?.total_agents ?? 0, change: `${stats?.active_agents ?? 0} active`, icon: Activity, href: "/admin/agents" },
    { label: "Audits", value: stats?.total_audits ?? 0, change: `${stats?.audits_this_month ?? 0} this month`, icon: Shield, href: "/admin/audits" },
    { label: "Avg Score", value: `${Math.round(stats?.average_score ?? 0)}%`, change: "Security", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
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
            <div className="group relative overflow-hidden rounded-lg border bg-card p-6 transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {isLoading ? "—" : stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.change}</p>
                </div>
                <div className="rounded-full bg-primary/10 p-2">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
              {stat.href && (
                <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/30 transition-all group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Left: Activity Chart */}
        <div className="lg:col-span-4 space-y-6">
          {/* Audit Activity */}
          <div className="rounded-lg border bg-card">
            <div className="border-b p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Audit Activity</h3>
                  <p className="text-sm text-muted-foreground">Last 7 days</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{stats?.audit_activity?.reduce((s, d) => s + d.count, 0) ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total audits</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {isLoading ? (
                <div className="flex h-[200px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {stats?.audit_activity?.map((day) => {
                    const maxCount = Math.max(...(stats?.audit_activity?.map(d => d.count) ?? [1]));
                    const percentage = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                    return (
                      <div key={day.date} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          <span className="font-medium">{day.count} audits</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div 
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Users */}
          <div className="rounded-lg border bg-card">
            <div className="border-b p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Recent Users</h3>
                <Link to="/admin/users" className="text-sm text-primary hover:underline">
                  View all
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
                  <div key={user.id} className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {(user.username || user.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.username || user.email}</p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                      </p>
                      {user.email_verified && (
                        <p className="text-xs text-emerald-600">Verified</p>
                      )}
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
        <div className="lg:col-span-3 space-y-6">
          {/* Connection Types */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-4">Connection Types</h3>
            <div className="space-y-3">
              {[
                { label: "Cloudflare", count: stats?.agents_by_mode?.cloudflare ?? 0, color: "bg-orange-500" },
                { label: "Direct", count: stats?.agents_by_mode?.direct ?? 0, color: "bg-blue-500" },
                { label: "Relay", count: stats?.agents_by_mode?.relay ?? 0, color: "bg-emerald-500" },
                { label: "Domain", count: stats?.agents_by_mode?.domain ?? 0, color: "bg-purple-500" },
              ].map((type) => {
                const total = (stats?.agents_by_mode?.cloudflare ?? 0) + 
                             (stats?.agents_by_mode?.direct ?? 0) + 
                             (stats?.agents_by_mode?.relay ?? 0) + 
                             (stats?.agents_by_mode?.domain ?? 0);
                const percentage = total > 0 ? Math.round((type.count / total) * 100) : 0;
                return (
                  <div key={type.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${type.color}`} />
                        <span>{type.label}</span>
                      </div>
                      <span className="font-medium">{type.count} ({percentage}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System Health */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-4">System Health</h3>
            {stats?.system_health ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <span className="text-xs text-emerald-600 font-medium">
                    {stats.system_health.database.response_time_ms}ms
                  </span>
                </div>
                {stats.system_health.redis && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Redis</span>
                    <span className="text-xs text-emerald-600 font-medium">
                      {stats.system_health.redis.response_time_ms}ms
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm">WebSocket</span>
                  <span className="text-xs text-muted-foreground">
                    {stats.system_health.active_websockets} connections
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </div>

          {/* Quick Stats */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Administrators</span>
                <span className="font-semibold">{stats?.total_admins ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API Keys</span>
                <span className="font-semibold">{stats?.total_api_keys ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Keys</span>
                <span className="font-semibold">{stats?.active_api_keys ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Relay Agents</span>
                <span className="font-semibold">{stats?.relay_agents_count ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
