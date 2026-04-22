import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { agentApi } from "@/lib/api/agent";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/audits")({
  component: AdminAuditsPage,
});

function AdminAuditsPage() {
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: agentApi.list,
  });

  const { data: allAudits = [], isLoading: auditsLoading } = useQuery({
    queryKey: ["admin-audits", agents.map(a => a.id)],
    queryFn: async () => {
      const results = await Promise.all(
        agents.map(async (agent) => {
          try {
            const audits = await agentApi.listAudits(agent.id);
            return audits.map(audit => ({ ...audit, agentId: agent.id, agentName: agent.name }));
          } catch {
            return [];
          }
        })
      );
      return results.flat().sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },
    enabled: agents.length > 0,
  });

  const isLoading = agentsLoading || auditsLoading;

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge variant="default" className="bg-green-500">Pass</Badge>;
    if (score >= 60) return <Badge variant="default" className="bg-yellow-500">Warning</Badge>;
    return <Badge variant="destructive">Fail</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audits</h1>
        <p className="text-muted-foreground">
          View all security audit results across all agents
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Passed</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading audits...
                </TableCell>
              </TableRow>
            ) : allAudits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No audits found
                </TableCell>
              </TableRow>
            ) : (
              allAudits.map((audit) => (
                <TableRow key={`${audit.agentId}-${audit.id}`}>
                  <TableCell className="font-medium">{audit.agentName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getScoreBadge(audit.summary.score)}
                      <span className="text-sm text-muted-foreground">{audit.summary.score}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-green-600">
                      {audit.summary.passed}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-red-600">
                      {audit.summary.failed}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(audit.timestamp), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link to="/agents/$id/audits/$auditId" params={{ id: audit.agentId, auditId: audit.id! }}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
