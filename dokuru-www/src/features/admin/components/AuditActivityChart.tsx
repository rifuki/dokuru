import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { format, subDays, formatISO } from "date-fns";
import { ShieldCheck } from "lucide-react";
import type { DashboardStats } from "../types/stats";

interface AuditActivityChartProps {
  activity?: DashboardStats["audit_activity"];
  loading?: boolean;
}

// Build a full 7-day dataset, filling in 0 for missing days
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
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium">{payload[0]?.payload?.fullDate}</p>
        <p className="text-muted-foreground">
          <span className="text-blue-500 font-semibold">{payload[0]?.value}</span> audit{payload[0]?.value !== 1 ? "s" : ""}
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

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              Audit Activity
            </CardTitle>
            <CardDescription className="mt-0.5">Security audits run over the last 7 days</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">total this week</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading chart...</div>
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="30%">
                <defs>
                  <linearGradient id="auditBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2496ED" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0891B2" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  allowDecimals={false}
                  width={24}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.3 }} />
                <Bar dataKey="audits" radius={[6, 6, 2, 2]} maxBarSize={48}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.audits === maxVal && entry.audits > 0 ? "url(#auditBar)" : "#2496ED"}
                      opacity={entry.audits === 0 ? 0.15 : entry.audits === maxVal ? 1 : 0.65}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
