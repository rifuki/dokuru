import {
  Users, Shield, AlertCircle,
  BarChart3, RefreshCw, Bot
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";
import { useQueryClient } from "@tanstack/react-query";
import { adminKeys } from "@/features/admin/hooks/use-dashboard-stats";

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Platform metrics and system status</p>
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

      {/* Stats Grid - Compact */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/users" className="group">
          <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Users</span>
              <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="text-2xl font-semibold">{isLoading ? "—" : stats?.total_users ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats?.new_users_this_month ?? 0} this month
            </p>
          </div>
        </Link>

        <Link to="/admin/agents" className="group">
          <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Agents</span>
              <Bot className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="text-2xl font-semibold">{isLoading ? "—" : stats?.total_agents ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.active_agents ?? 0} active
            </p>
          </div>
        </Link>

        <Link to="/admin/audits" className="group">
          <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Audits</span>
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="text-2xl font-semibold">{isLoading ? "—" : stats?.total_audits ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.audits_this_month ?? 0} this month
            </p>
          </div>
        </Link>

        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Avg Score</span>
            <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
          <div className="text-2xl font-semibold">{isLoading ? "—" : `${Math.round(stats?.average_score ?? 0)}%`}</div>
          <p className="text-xs text-muted-foreground mt-1">Security rating</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-4">
          <AuditActivityChart
            activity={stats?.audit_activity}
            loading={isLoading}
          />
          
          <RecentRegistrationsTable
            registrations={stats?.recent_registrations}
            loading={isLoading}
          />
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-4">
          <AgentConnectionChart
            agentsByMode={stats?.agents_by_mode}
            totalAgents={stats?.total_agents ?? 0}
            loading={isLoading}
          />

          {stats?.system_health ? (
            <SystemHealthCard health={stats.system_health} />
          ) : (
            <div className="rounded-lg border bg-card h-full flex items-center justify-center text-muted-foreground text-sm p-6">
              {isLoading ? "Loading..." : "System health unavailable"}
            </div>
          )}

          {/* Quick Stats */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">Quick Stats</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Admins</span>
                <span className="font-medium">{stats?.total_admins ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Keys</span>
                <span className="font-medium">{stats?.total_api_keys ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active Keys</span>
                <span className="font-medium">{stats?.active_api_keys ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Relay Agents</span>
                <span className="font-medium">{stats?.relay_agents_count ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
