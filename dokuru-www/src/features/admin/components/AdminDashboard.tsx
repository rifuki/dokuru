import {
  Users, Key, Shield, AlertCircle, Activity,
  BarChart3, Wifi, RefreshCw, Bot
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";
import { useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "@/features/admin/hooks/use-dashboard-stats";

import { StatCard } from "./StatCard";
import { SystemHealthCard } from "./SystemHealthCard";
import { RecentRegistrationsTable } from "./RecentRegistrationsTable";
import { AgentConnectionChart } from "./AgentConnectionChart";
import { AuditActivityChart } from "./AuditActivityChart";

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform overview — users, agents, audits & system health
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Row 1 — Primary metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users ?? 0}
          description={`${stats?.new_users_this_month ?? 0} new this month`}
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/users"
          color="blue"
        />
        <StatCard
          title="Total Agents"
          value={stats?.total_agents ?? 0}
          description={`${stats?.active_agents ?? 0} active recently`}
          icon={<Bot className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/agents"
          color="green"
        />
        <StatCard
          title="Total Audits"
          value={stats?.total_audits ?? 0}
          description={`${stats?.audits_this_month ?? 0} this month`}
          icon={<BarChart3 className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/audits"
          color="purple"
        />
        <StatCard
          title="Avg Security Score"
          value={`${Math.round(stats?.average_score ?? 0)}%`}
          description="Across all audits"
          icon={<Shield className="h-4 w-4" />}
          loading={isLoading}
          color="amber"
        />
      </div>

      {/* Row 2 — Secondary metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Administrators"
          value={stats?.total_admins ?? 0}
          description="With full platform access"
          icon={<Shield className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/users"
          color="indigo"
        />
        <StatCard
          title="API Keys"
          value={stats?.total_api_keys ?? 0}
          description="Total created"
          icon={<Key className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/api-keys"
          color="cyan"
        />
        <StatCard
          title="Active Keys"
          value={stats?.active_api_keys ?? 0}
          description="Currently active"
          icon={<Activity className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/api-keys"
          color="teal"
        />
        <StatCard
          title="Relay Agents"
          value={stats?.relay_agents_count ?? 0}
          description="Via WebSocket relay"
          icon={<Wifi className="h-4 w-4" />}
          loading={isLoading}
          href="/admin/agents"
          color="rose"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Audit Activity — wider */}
        <div className="lg:col-span-3">
          <AuditActivityChart
            activity={stats?.audit_activity}
            loading={isLoading}
          />
        </div>

        {/* Agent Connection Types */}
        <div className="lg:col-span-2">
          <AgentConnectionChart
            agentsByMode={stats?.agents_by_mode}
            totalAgents={stats?.total_agents ?? 0}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Recent Registrations */}
        <div className="lg:col-span-3">
          <RecentRegistrationsTable
            registrations={stats?.recent_registrations}
            loading={isLoading}
          />
        </div>

        {/* System Health */}
        <div className="lg:col-span-2">
          {stats?.system_health ? (
            <SystemHealthCard health={stats.system_health} />
          ) : (
            <div className="rounded-xl border border-border bg-card h-full flex items-center justify-center text-muted-foreground text-sm p-6">
              {isLoading ? "Loading system health..." : "System health unavailable"}
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Manage Users",    desc: "View, edit, and manage accounts",  href: "/admin/users",    icon: Users,     color: "text-blue-500 bg-blue-500/10" },
            { label: "Manage Agents",   desc: "Monitor all registered agents",    href: "/admin/agents",   icon: Bot,       color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Audit Results",   desc: "Browse platform-wide audit logs",  href: "/admin/audits",   icon: BarChart3, color: "text-purple-500 bg-purple-500/10" },
            { label: "API Keys",        desc: "Create and manage access keys",    href: "/admin/api-keys", icon: Key,       color: "text-cyan-500 bg-cyan-500/10" },
          ].map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:bg-accent/30 transition-all duration-150"
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
