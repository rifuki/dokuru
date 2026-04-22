import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { DashboardStats } from "../types/stats";

interface AgentConnectionChartProps {
  agentsByMode: DashboardStats["agents_by_mode"];
}

const COLORS = {
  direct: "#3b82f6",      // blue
  cloudflare: "#f59e0b",  // amber
  domain: "#8b5cf6",      // violet
  relay: "#10b981",       // green
};

export function AgentConnectionChart({ agentsByMode }: AgentConnectionChartProps) {
  const data = [
    { name: "Direct", value: agentsByMode.direct, color: COLORS.direct },
    { name: "Cloudflare", value: agentsByMode.cloudflare, color: COLORS.cloudflare },
    { name: "Domain", value: agentsByMode.domain, color: COLORS.domain },
    { name: "Relay", value: agentsByMode.relay, color: COLORS.relay },
  ].filter((item) => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Agent Connection Types</CardTitle>
          <CardDescription>Distribution of agent connection methods</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No agents registered yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Agent Connection Types</CardTitle>
        <CardDescription>Distribution of agent connection methods</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                outerRadius={60}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
