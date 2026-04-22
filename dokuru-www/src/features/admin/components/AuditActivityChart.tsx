import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import { format, subDays, formatISO } from "date-fns";
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
  const avgPerDay = (total / 7).toFixed(1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Audit Activity</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">{total}</p>
            <p className="text-xs text-muted-foreground">{avgPerDay}/day</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <div className="h-[180px] flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
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
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip 
                  content={<CustomTooltip />} 
                  cursor={{ fill: "hsl(var(--primary))", opacity: 0.05 }} 
                />
                <Bar 
                  dataKey="audits" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={40}
                  fill="hsl(217 91% 60%)"
                  className="fill-blue-500"
                  animationDuration={500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
