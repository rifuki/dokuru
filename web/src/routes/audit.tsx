import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Shield, Play } from 'lucide-react'
import { useAppStore } from '@/store'

export const Route = createFileRoute('/audit')({
  component: AuditPage,
})

function AuditPage() {
  const { report, isLoading, fetchAudit } = useAppStore();

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live Audit</h2>
          <p className="text-muted-foreground">Run a fresh security audit against your container environment.</p>
        </div>
        <Button onClick={fetchAudit} disabled={isLoading} className="gap-2">
          {isLoading ? (
            <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isLoading ? "Auditing..." : "Run New Audit"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Audit Results
          </CardTitle>
          <CardDescription>
            Detailed breakdown of CIS Docker Benchmark v1.8.0 recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!report && !isLoading && (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
              <Shield className="w-12 h-12 mb-4 opacity-20" />
              <p>No audit data available. Click "Run New Audit" to begin.</p>
            </div>
          )}
          
          {isLoading && !report && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          )}

          {report && (
            <div className="space-y-4">
              {report.results.map((r, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-card transition-colors hover:bg-muted/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">Rule {r.rule_id}</span>
                      <Badge variant={r.status === 'Pass' ? 'default' : r.status === 'Fail' ? 'destructive' : 'secondary'}
                             className={r.status === 'Pass' ? 'bg-green-500 hover:bg-green-600' : ''}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.details}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
