import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Network as NetworkIcon, Trash2 } from "lucide-react";
import { dockerApi, type Network } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/networks")({
  component: NetworksPage,
});

function NetworksPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: networks, isLoading } = useQuery({
    queryKey: ["networks", id],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listNetworks(agent!.url, agent!.token);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  const removeMutation = useMutation({
    mutationFn: (networkId: string) => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.removeNetwork(agent.url, agent.token, networkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["networks", id] });
      toast.success("Network removed");
    },
    onError: () => toast.error("Failed to remove network"),
  });

  if (isLoading) return <div className="max-w-7xl mx-auto w-full">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Networks</h2>
        <p className="text-muted-foreground text-sm">{networks?.length || 0} networks found</p>
      </div>

      {!networks || networks.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <NetworkIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No networks found</h3>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {networks.map((network: Network) => (
                <TableRow key={network.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/agents/$id/networks/$networkId"
                      params={{ id, networkId: network.id }}
                      className="text-primary hover:underline"
                    >
                      {network.name}
                    </Link>
                  </TableCell>
                  <TableCell>{network.driver}</TableCell>
                  <TableCell>{network.scope}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remove this network?")) {
                          removeMutation.mutate(network.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
