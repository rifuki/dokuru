import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import type { DashboardStats } from "../types/stats";

interface AuditActivityChartProps {
  activity: DashboardStats["audit_activity"];
}

export function AuditActivityChart({ activity }: AuditActivityChartProps) {
  const chartData = activity.map((item) => ({
    date: format(parseISO(item.date), "EEE"),
    audits: item.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Audit Activity</CardTitle>
        <CardDescription>Audits run over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
              <YAxis className="text-xs fill-muted-foreground" />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                contentStyle={{
                  backgroundColor: "var(--color-background)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                }}
              />
              <Bar dataKey="audits" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
