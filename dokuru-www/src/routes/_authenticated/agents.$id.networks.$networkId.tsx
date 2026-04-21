import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dockerApi } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Network, Container } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/networks/$networkId")({
  component: NetworkDetailPage,
});

function NetworkDetailPage() {
  const { id, networkId } = Route.useParams();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: network, isLoading } = useQuery({
    queryKey: ["network", id, networkId],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.inspectNetwork(agent.url, agent.token, networkId);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-card rounded-lg" />;
  }

  const containers = (network?.Containers as Record<string, { Name: string; IPv4Address: string }>) || {};

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="min-w-0">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3 min-w-0">
          <Network className="h-8 w-8 shrink-0" />
          <span className="truncate">{network?.Name || networkId}</span>
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Network Details</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-6 rounded-lg border bg-card min-w-0">
          <h3 className="font-semibold text-lg">Network Information</h3>
          <div className="space-y-3 text-sm">
            <div className="min-w-0">
              <span className="text-muted-foreground">ID:</span>
              <p className="font-mono text-xs break-all">{network?.Id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Driver:</span>
              <p className="font-mono">{network?.Driver}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Scope:</span>
              <Badge variant="outline">{network?.Scope}</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6 rounded-lg border bg-card min-w-0">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Container className="h-5 w-5" />
            Containers ({Object.keys(containers).length})
          </h3>
          <div className="space-y-2">
            {Object.entries(containers).map(([cid, info]) => (
              <div key={cid} className="p-3 rounded-lg bg-muted/50 min-w-0">
                <p className="font-mono text-sm truncate">{info.Name}</p>
                <p className="text-xs text-muted-foreground mt-1">{info.IPv4Address}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border bg-card">
        <h3 className="font-semibold text-lg mb-4">Raw JSON</h3>
        <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto overflow-y-auto max-h-96 text-xs font-mono max-w-full">
          {JSON.stringify(network, null, 2)}
        </pre>
      </div>
    </div>
  );
}
