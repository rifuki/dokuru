import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { format, subDays, formatISO } from "date-fns";
import { ShieldCheck, TrendingUp } from "lucide-react";
import type { DashboardStats } from "../types/stats";

interface AuditActivityChartProps {
  activity?: DashboardStats["audit_activity"];
  loading?: boolean;
}

// Build full 7-day dataset
function buildChartData(activity: DashboardStats["audit_activity"] = []) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    const key = formatISO(d, { representation: "date" });
    const found = activity.find((a) => a.date === key);
    return {
      date: format(d, "EEE"),
      fullDate: format(d, "MMM d"),
      audits: found?.count ?? 0,
    };
  });
  return days;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { fullDate: string } }> }) => {
  if (active && payload && payload.length) {
    const value = payload[0]?.value ?? 0;
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="font-medium text-sm">{payload[0]?.payload?.fullDate}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="text-[hsl(220,50%,55%)] font-semibold">{value}</span> audit{value !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }
  return null;
};

export function AuditActivityChart({ activity, loading }: AuditActivityChartProps) {
  const chartData = buildChartData(activity);
  const total = chartData.reduce((s, d) => s + d.audits, 0);
  const maxVal = Math.max(...chartData.map((d) => d.audits), 1);
  const avgPerDay = (total / 7).toFixed(1);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[hsl(220,50%,96%)] dark:bg-[hsl(220,50%,15%)] flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-[hsl(220,50%,55%)]" />
              </div>
              Audit Activity
            </CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </div>
          <div className="text-right space-y-1">
            <p className="text-2xl font-semibold">{total}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              {avgPerDay} avg/day
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-[hsl(220,50%,55%)]" />
              <p className="text-sm text-muted-foreground">Loading chart...</p>
            </div>
          </div>
        ) : (
          <div className="h-[200px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="25%">
                <defs>
                  <linearGradient id="auditGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(220, 50%, 60%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(220, 50%, 50%)" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  vertical={false} 
                  stroke="hsl(var(--border))" 
                  opacity={0.3} 
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip 
                  content={<CustomTooltip />} 
                  cursor={{ fill: "hsl(220, 50%, 50%)", opacity: 0.1, radius: 4 }} 
                />
                <Bar 
                  dataKey="audits" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={56}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, index) => {
                    const isMax = entry.audits === maxVal && entry.audits > 0;
                    const isEmpty = entry.audits === 0;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isMax ? "url(#auditGradient)" : "hsl(220, 45%, 55%)"}
                        opacity={isEmpty ? 0.15 : isMax ? 1 : 0.6}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
