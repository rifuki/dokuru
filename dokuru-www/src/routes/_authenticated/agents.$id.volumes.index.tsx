import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { HardDrive, Trash2, Scissors, ExternalLink, FolderOpen } from "lucide-react";
import { dockerApi, type Volume } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { PageHeader } from "@/components/ui/page-header";

export const Route = createFileRoute("/_authenticated/agents/$id/volumes/")({
  component: VolumesPage,
});

function VolumesPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: volumes, isLoading } = useQuery({
    queryKey: ["volumes", id],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listVolumes(agent.url, agent.token);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  const removeMutation = useMutation({
    mutationFn: (volumeName: string) => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.removeVolume(agent.url, agent.token, volumeName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes", id] });
      toast.success("Volume removed");
    },
    onError: () => toast.error("Failed to remove volume"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.pruneVolumes(agent.url, agent.token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes", id] });
      toast.success("Unused volumes pruned");
    },
    onError: () => toast.error("Failed to prune volumes"),
  });

  const handleDeleteSelected = async (names: string[]) => {
    for (const name of names) {
      await removeMutation.mutateAsync(name).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["volumes", id] });
    toast.success(`Removed ${names.length} volume(s)`);
  };

  const columns: ColumnDef<Volume>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-orange-500/10 text-orange-500 shrink-0">
            <HardDrive className="h-4 w-4" />
          </div>
          <Link
            to="/agents/$id/volumes/$volumeName"
            params={{ id, volumeName: row.original.name }}
            className="font-medium text-sm text-primary hover:underline truncate"
          >
            {row.original.name}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "driver",
      header: "Driver",
      cell: ({ getValue }) => (
        <Badge variant="outline" className="font-mono text-xs">
          {getValue() as string}
        </Badge>
      ),
    },
    {
      accessorKey: "mountpoint",
      header: "Mountpoint",
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate max-w-xs">{getValue() as string}</span>
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
                  <Link to="/agents/$id/volumes/$volumeName" params={{ id, volumeName: row.original.name }}>
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
                  onClick={() => { if (confirm("Remove this volume?")) removeMutation.mutate(row.original.name); }}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove volume</TooltipContent>
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
        icon={HardDrive}
        title="Volumes"
        loading={isLoading}
        stats={[
          { value: volumes?.length ?? 0, label: `volume${(volumes?.length ?? 0) !== 1 ? "s" : ""}` },
        ]}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-2"
          onClick={() => { if (confirm("Prune unused volumes?")) pruneMutation.mutate(); }}
          disabled={pruneMutation.isPending || !agent}
        >
          <Scissors className="h-3.5 w-3.5" />
          Prune Unused
        </Button>
      </PageHeader>

      <div className="space-y-6">

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-card animate-pulse border" />)}
        </div>
      ) : !volumes || volumes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <HardDrive className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No volumes found</h3>
          <p className="text-muted-foreground text-sm">No Docker volumes on this agent.</p>
        </div>
      ) : (
        <DataTable
          data={volumes}
          columns={columns}
          rowId="name"
          searchPlaceholder="Search by name or mountpoint…"
          onDeleteSelected={handleDeleteSelected}
          deleteLabel="Remove volumes"
          isDeleting={removeMutation.isPending}
        />
      )}
      </div>
    </div>
  );
}
