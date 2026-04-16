import { Users, Key, TrendingUp, Shield, AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuthUser } from "@/stores/use-auth-store";
import { useDashboardStats } from "@/features/admin/hooks/use-dashboard-stats";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { StatCard } from "./StatCard";
import { ActionCard } from "./ActionCard";

const mockChartData = [
  { name: "Mon", users: 12 },
  { name: "Tue", users: 19 },
  { name: "Wed", users: 15 },
  { name: "Thu", users: 25 },
  { name: "Fri", users: 22 },
  { name: "Sat", users: 8 },
  { name: "Sun", users: 10 },
];

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
          Manage your application settings, users, and API keys.
        </p>
      </div>

      {/* Stats Overview */}
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
          trend="+5%"
          trendUp={true}
          loading={isLoading}
        />
        <StatCard
          title="Active Keys"
          value={stats?.active_api_keys || 0}
          description="Currently active"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {/* Charts & Quick Links */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Chart */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
            <CardDescription>New user registrations over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="w-full h-[300px]">
              <ResponsiveContainer>
                <BarChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <Tooltip
                    cursor={{ fill: "var(--color-muted)" }}
                    contentStyle={{
                      backgroundColor: "var(--color-background)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      color: "var(--color-foreground)",
                    }}
                    itemStyle={{
                      color: "var(--color-foreground)",
                    }}
                  />
                  <Bar
                    dataKey="users"
                    fill="var(--color-primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Manage your application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
