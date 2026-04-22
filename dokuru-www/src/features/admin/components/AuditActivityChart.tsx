import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-lg">
        <p className="font-medium text-sm text-foreground">{payload[0]?.payload?.fullDate}</p>
        <p className="text-xs text-muted-foreground mt-1">
          <span className="text-primary font-semibold">{value}</span> audit{value !== 1 ? "s" : ""}
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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Audit Activity</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Last 7 days</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{total}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <TrendingUp className="h-3 w-3" />
              {avgPerDay}/day avg
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  vertical={false} 
                  stroke="hsl(var(--border))" 
                  opacity={0.5} 
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13, fill: "hsl(var(--foreground))", opacity: 0.7 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13, fill: "hsl(var(--foreground))", opacity: 0.7 }}
                  allowDecimals={false}
                  width={35}
                />
                <Tooltip 
                  content={<CustomTooltip />} 
                  cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }} 
                />
                <Bar 
                  dataKey="audits" 
                  radius={[8, 8, 0, 0]} 
                  maxBarSize={60}
                  animationDuration={600}
                >
                  {chartData.map((entry, index) => {
                    const isMax = entry.audits === maxVal && entry.audits > 0;
                    const isEmpty = entry.audits === 0;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isMax ? "url(#barGradient)" : "hsl(var(--primary))"}
                        opacity={isEmpty ? 0.2 : isMax ? 1 : 0.6}
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
