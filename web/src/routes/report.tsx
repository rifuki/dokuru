import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'

export const Route = createFileRoute('/report')({
  component: ReportPage,
})

function ReportPage() {
  const { report } = useAppStore();

  const handleDownload = () => {
    if (!report) return;
    
    // Convert report to JSON string and trigger download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "dokuru_audit_report.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Executive Report</h2>
          <p className="text-muted-foreground">Exportable security compliance report.</p>
        </div>
        <Button onClick={handleDownload} disabled={!report} className="gap-2">
          <Download className="w-4 h-4" />
          Export JSON
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
             <FileText className="w-5 h-5 text-primary" />
             Report Summary
          </CardTitle>
          <CardDescription>Generated assessment summary for record-keeping and CI/CD logging.</CardDescription>
        </CardHeader>
        <CardContent>
           {!report ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No audit data available. Please run an audit first.</p>
              </div>
           ) : (
              <div className="bg-muted p-4 rounded-md">
                 <pre className="text-xs overflow-auto max-h-[500px]">
                    {JSON.stringify(report, null, 2)}
                 </pre>
              </div>
           )}
        </CardContent>
      </Card>
    </div>
  )
}
