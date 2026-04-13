import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Shield, Activity, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { useHealth } from '@/features/health/hooks/use-health'
import { useAudit } from '@/features/audit/hooks/use-audit'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: health } = useHealth();
  const { data: report } = useAudit(true); // enabled if you want automatic refresh on dashboard load, but maybe false works too if we just want cached. Let's say true.

  const score = report?.score || 0;
  const passedCount = report?.passed || 0;
  const failedCount = report?.failed || 0;
  const totalCount = report?.total_rules || 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your Docker environment security posture.</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${health?.docker_connected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
          <span className="text-sm font-medium">
            {health?.docker_connected ? `Docker Engine v${health.docker_version}` : 'Docker Disconnected'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-card to-card/50 border-primary/20 shadow-sm relative overflow-hidden">
          <div className="absolute right-[-20px] top-[-20px] opacity-10">
            <Shield className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="font-medium">Overall Score</CardDescription>
            <CardTitle className="text-5xl">{score}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={score} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-2">Target CIS Benchmark v1.8.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Passed Rules</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{passedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">out of {totalCount} total rules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vulnerabilities</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{failedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requiring immediate action</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest checks performed on the daemon.</CardDescription>
        </CardHeader>
        <CardContent>
          {report ? (
             <div className="space-y-4">
                {report.results.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center p-3 border rounded-lg bg-card/50 transition-colors hover:bg-muted/50">
                    <div className={`w-2 h-full rounded-full mr-4 ${r.status === 'Pass' ? 'bg-green-500' : r.status === 'Fail' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Rule {r.rule_id}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{r.details}</p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
              <Activity className="w-8 h-8 mb-2 opacity-50 animate-pulse" />
              <p>Loading audit data...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
