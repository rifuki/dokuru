import { Users, Key, TrendingUp, Shield, AlertCircle, Activity, BarChart3, Wifi } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";

import { StatCard } from "./StatCard";
import { ActionCard } from "./ActionCard";
import { SystemHealthCard } from "./SystemHealthCard";
import { RecentRegistrationsTable } from "./RecentRegistrationsTable";
import { AgentConnectionChart } from "./AgentConnectionChart";
import { AuditActivityChart } from "./AuditActivityChart";

export function AdminDashboard() {
  const user = useAuthUser();
  const { data: stats, isLoading } = useDashboardStats();

  if (user?.role !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You don&apos;t have permission to access this page. This area is restricted to administrators only.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your application settings, users, agents, and audits.
        </p>
      </div>

      {/* Stats Overview - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users || 0}
          description="Registered accounts"
          icon={<Users className="h-4 w-4" />}
          trend="+12%"
          trendUp={true}
          loading={isLoading}
        />
        <StatCard
          title="Total Agents"
          value={stats?.total_agents || 0}
          description={`${stats?.active_agents || 0} online`}
          icon={<Activity className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Total Audits"
          value={stats?.total_audits || 0}
          description={`${stats?.audits_this_month || 0} this month`}
          icon={<BarChart3 className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Average Score"
          value={`${Math.round(stats?.average_score || 0)}%`}
          description="Security compliance"
          icon={<Shield className="h-4 w-4" />}
          trend="+3%"
          trendUp={true}
          loading={isLoading}
        />
      </div>

      {/* Stats Overview - Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Administrators"
          value={stats?.total_admins || 0}
          description="With full access"
          icon={<Shield className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          title="API Keys"
          value={stats?.total_api_keys || 0}
          description="Total created"
          icon={<Key className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Active Keys"
          value={stats?.active_api_keys || 0}
          description="Currently active"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          title="Relay Agents"
          value={stats?.relay_agents_count || 0}
          description="Connected via WebSocket"
          icon={<Wifi className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {/* System Health & Quick Actions */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* System Health */}
        <div className="md:col-span-4">
          {stats?.system_health && <SystemHealthCard health={stats.system_health} />}
        </div>

        {/* Quick Actions */}
        <div className="md:col-span-3">
          <div className="space-y-3">
            <ActionCard
              title="Manage Users"
              description="View, edit, and manage user accounts"
              href="/admin/users"
              icon={<Users className="h-5 w-5" />}
            />
            <ActionCard
              title="API Keys"
              description="Create and manage API access keys"
              href="/admin/api-keys"
              icon={<Key className="h-5 w-5" />}
            />
            <ActionCard
              title="System Settings"
              description="Configure application settings"
              href="/admin/settings"
              icon={<TrendingUp className="h-5 w-5" />}
              comingSoon
            />
          </div>
        </div>
      </div>

      {/* Recent Registrations & Agent Connection Types */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Recent Registrations */}
        <div className="md:col-span-4">
          {stats?.recent_registrations && (
            <RecentRegistrationsTable registrations={stats.recent_registrations} />
          )}
        </div>

        {/* Agent Connection Types */}
        <div className="md:col-span-3">
          {stats?.agents_by_mode && (
            <AgentConnectionChart agentsByMode={stats.agents_by_mode} />
          )}
        </div>
      </div>

      {/* Audit Activity Chart */}
      <div>
        {stats?.audit_activity && <AuditActivityChart activity={stats.audit_activity} />}
      </div>
    </div>
  );
}
