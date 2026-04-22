import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Network as NetworkIcon, Trash2, ExternalLink, Globe } from "lucide-react";
import { dockerApi, type Network } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { PageHeader } from "@/components/ui/page-header";

export const Route = createFileRoute("/_authenticated/agents/$id/networks/")({
  component: NetworksPage,
});

function driverColor(driver: string) {
  switch (driver) {
    case "bridge":  return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "host":    return "bg-green-500/10 text-green-500 border-green-500/20";
    case "overlay": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "macvlan": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "none":    return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default:        return "bg-muted text-muted-foreground border-border";
  }
}

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["networks", id] });
      toast.success("Network removed");
    },
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
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
            <NetworkIcon className="h-4 w-4" />
          </div>
          <Link
            to="/agents/$id/networks/$networkId"
            params={{ id, networkId: row.original.id }}
            className="font-medium text-sm text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "id",
      header: "Network ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          {(getValue() as string).slice(0, 12)}
        </span>
      ),
    },
    {
      accessorKey: "driver",
      header: "Driver",
      cell: ({ getValue }) => (
        <Badge variant="outline" className={`font-mono text-xs ${driverColor(getValue() as string)}`}>
          {getValue() as string}
        </Badge>
      ),
    },
    {
      accessorKey: "scope",
      header: "Scope",
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{getValue() as string}</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <TooltipProvider>
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary" asChild>
                  <Link to="/agents/$id/networks/$networkId" params={{ id, networkId: row.original.id }}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm" variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => { if (confirm("Remove this network?")) removeMutation.mutate(row.original.id); }}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove network</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
      enableSorting: false,
      size: 80,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        icon={NetworkIcon}
        title="Networks"
        loading={isLoading}
        stats={[
          { value: networks?.length ?? 0, label: `network${(networks?.length ?? 0) !== 1 ? "s" : ""}` },
        ]}
      />

      <div className="space-y-6">

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-card animate-pulse border" />)}
        </div>
      ) : !networks || networks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <NetworkIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No networks found</h3>
          <p className="text-muted-foreground text-sm">No Docker networks on this agent.</p>
        </div>
      ) : (
        <DataTable
          data={networks}
          columns={columns}
          rowId="id"
          searchPlaceholder="Search by name or driver…"
          onDeleteSelected={handleDeleteSelected}
          deleteLabel="Remove networks"
          isDeleting={removeMutation.isPending}
        />
      )}
      </div>
    </div>
  );
}
