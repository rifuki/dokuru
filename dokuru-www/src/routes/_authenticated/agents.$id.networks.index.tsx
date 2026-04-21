import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Network as NetworkIcon, Trash2 } from "lucide-react";
import { dockerApi, type Network } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/networks/")({
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
      const res = await dockerApi.listNetworks(agent.url, agent.token);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  const removeMutation = useMutation({
    mutationFn: (networkId: string) => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.removeNetwork(agent.url, agent.token, networkId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["networks", id] }); toast.success("Network removed"); },
    onError: () => toast.error("Failed to remove network"),
  });

  const handleDeleteSelected = async (ids: string[]) => {
    for (const nid of ids) {
      await removeMutation.mutateAsync(nid).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["networks", id] });
    toast.success(`Removed ${ids.length} network(s)`);
  };

  const columns: ColumnDef<Network>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to="/agents/$id/networks/$networkId"
          params={{ id, networkId: row.original.id }}
          className="text-primary hover:underline font-medium text-sm"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "id",
      header: "Network ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">{(getValue() as string).slice(0, 12)}</span>
      ),
    },
    {
      accessorKey: "driver",
      header: "Driver",
      cell: ({ getValue }) => (
        <Badge variant="outline" className="font-mono text-xs">{getValue() as string}</Badge>
      ),
    },
    {
      accessorKey: "scope",
      header: "Scope",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground capitalize">{getValue() as string}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { if (confirm("Remove this network?")) removeMutation.mutate(row.original.id); }}
            disabled={removeMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      enableSorting: false,
      size: 48,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Networks</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {isLoading ? "Loading…" : `${networks?.length ?? 0} networks found`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-card animate-pulse border" />)}</div>
      ) : !networks || networks.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <NetworkIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No networks found</h3>
        </div>
      ) : (
        <DataTable
          data={networks}
          columns={columns}
          rowId="id"
          searchPlaceholder="Search by name, driver…"
          onDeleteSelected={handleDeleteSelected}
          deleteLabel="Remove networks"
          isDeleting={removeMutation.isPending}
        />
      )}
    </div>
  );
}
