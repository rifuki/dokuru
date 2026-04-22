import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Server } from "lucide-react";
import type { DashboardStats } from "../types/stats";

interface AgentConnectionChartProps {
  agentsByMode?: DashboardStats["agents_by_mode"];
  totalAgents?: number;
  loading?: boolean;
}

const MODES = [
  { key: "cloudflare", label: "Cloudflare", color: "hsl(30, 45%, 55%)" },
  { key: "direct",     label: "Direct",     color: "hsl(220, 45%, 55%)" },
  { key: "relay",      label: "Relay",      color: "hsl(142, 40%, 50%)" },
  { key: "domain",     label: "Domain",     color: "hsl(260, 40%, 60%)" },
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="font-medium text-sm">{payload[0]?.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[hsl(220,50%,96%)] dark:bg-[hsl(220,50%,15%)] flex items-center justify-center">
            <Server className="h-4 w-4 text-[hsl(220,50%,55%)]" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Connection Types</CardTitle>
            <CardDescription className="text-xs">Agent distribution</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-[180px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-[hsl(220,50%,55%)]" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : !hasData ? (
          <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Server className="h-10 w-10 opacity-20" />
            <p className="text-sm">No agents yet</p>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            {/* Donut chart */}
            <div className="relative h-[140px] w-[140px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="label"
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-semibold">{totalAgents}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">total</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2">
              {MODES.map((m) => {
                const count = agentsByMode?.[m.key as keyof typeof agentsByMode] ?? 0;
                const pct = totalAgents > 0 ? Math.round((count / totalAgents) * 100) : 0;
                if (count === 0) return null;
                return (
                  <div key={m.key} className="flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2 flex-1">
                      <div 
                        className="h-2.5 w-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125" 
                        style={{ backgroundColor: m.color }} 
                      />
                      <span className="text-sm text-muted-foreground">{m.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{count}</span>
                      <span className="text-xs text-muted-foreground min-w-[2.5rem] text-right">{pct}%</span>
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
