import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Bot } from "lucide-react";
import type { DashboardStats } from "../types/stats";

interface AgentConnectionChartProps {
  agentsByMode?: DashboardStats["agents_by_mode"];
  totalAgents?: number;
  loading?: boolean;
}

const MODES = [
  { key: "cloudflare", label: "Cloudflare",  color: "#f59e0b", bg: "bg-amber-500/15 text-amber-500" },
  { key: "direct",     label: "Direct",      color: "#2496ED", bg: "bg-blue-500/15 text-blue-500" },
  { key: "relay",      label: "Relay",       color: "#10b981", bg: "bg-emerald-500/15 text-emerald-500" },
  { key: "domain",     label: "Domain",      color: "#8b5cf6", bg: "bg-purple-500/15 text-purple-500" },
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium">{payload[0]?.name}</p>
        <p className="text-muted-foreground">
          <span className="font-semibold" style={{ color: payload[0]?.payload?.color }}>{payload[0]?.value}</span> agent{payload[0]?.value !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
};

export function AgentConnectionChart({ agentsByMode, totalAgents = 0, loading }: AgentConnectionChartProps) {
  const data = MODES
    .map((m) => ({
      ...m,
      value: agentsByMode?.[m.key as keyof typeof agentsByMode] ?? 0,
    }))
    .filter((d) => d.value > 0);

  const hasData = data.length > 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-500" />
          Agent Connection Types
        </CardTitle>
        <CardDescription>Distribution by connection method</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : !hasData ? (
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Bot className="h-10 w-10 opacity-20" />
            <p className="text-sm">No agents registered yet</p>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Donut chart */}
            <div className="relative h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="label"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold">{totalAgents}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">agents</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2.5">
              {MODES.map((m) => {
                const count = agentsByMode?.[m.key as keyof typeof agentsByMode] ?? 0;
                const pct = totalAgents > 0 ? Math.round((count / totalAgents) * 100) : 0;
                return (
                  <div key={m.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-semibold">{count}</span>
                      {count > 0 && <span className="text-muted-foreground text-xs">{pct}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
