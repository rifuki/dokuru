import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wrench, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { useState } from 'react'

export const Route = createFileRoute('/fix')({
  component: FixPage,
})

function FixPage() {
  const { report, applyFix } = useAppStore();
  const [fixingId, setFixingId] = useState<string | null>(null);

  // Group by failed specifically for fixing
  const failedRules = report?.results.filter((r) => r.status === 'Fail') || [];

  const handleFix = async (ruleId: string) => {
    setFixingId(ruleId);
    await applyFix(ruleId);
    setFixingId(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Auto Fix</h2>
        <p className="text-muted-foreground">Review and remediate failing security configurations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Remediation Hub
          </CardTitle>
          <CardDescription>
            {failedRules.length} vulnerabilities found that can be automatically or manually remediated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!report && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Please run an audit first to find issues to fix.</p>
            </div>
          )}
          
          {report && failedRules.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
              <h3 className="text-xl font-bold text-green-500">All Clear!</h3>
              <p className="text-muted-foreground mt-2">No failing rules found. Your environment is secure.</p>
            </div>
          )}

          {failedRules.length > 0 && (
            <div className="space-y-4">
              {failedRules.map((r, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                  <div className="flex-1 mb-4 sm:mb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-destructive">Rule {r.rule_id}</span>
                      <Badge variant="destructive">Needs Fix</Badge>
                    </div>
                    <p className="text-sm text-foreground/80">{r.details}</p>
                  </div>
                  <Button 
                    variant="default" 
                    className="shrink-0"
                    onClick={() => handleFix(r.rule_id)}
                    disabled={fixingId === r.rule_id}
                  >
                    {fixingId === r.rule_id ? "Fixing..." : "Apply Fix"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
