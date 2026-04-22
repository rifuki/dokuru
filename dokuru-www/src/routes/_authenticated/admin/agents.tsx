import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { agentApi } from "@/lib/api/agent";
import { useAgentStore } from "@/stores/use-agent-store";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Server, Activity, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/agents")({
  component: AdminAgentsPage,
});

function AdminAgentsPage() {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: agentApi.list,
  });

  const { agentInfos } = useAgentStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agents Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered agents across your infrastructure.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading agents...
                </TableCell>
              </TableRow>
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No agents registered
                </TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => {
                const info = agentInfo[agent.id];
                const isOnline = info?.wsOnline === true;

                return (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{agent.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {agent.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isOnline ? "default" : "secondary"}>
                        <Activity className="h-3 w-3 mr-1" />
                        {isOnline ? "Online" : "Offline"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(agent.updated_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
