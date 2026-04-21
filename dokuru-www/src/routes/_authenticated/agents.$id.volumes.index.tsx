import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { HardDrive, Trash2, Scissors } from "lucide-react";
import { dockerApi, type Volume } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["volumes", id] }); toast.success("Volume removed"); },
    onError: () => toast.error("Failed to remove volume"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.pruneVolumes(agent.url, agent.token);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["volumes", id] }); toast.success("Unused volumes pruned"); },
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
        <Link
          to="/agents/$id/volumes/$volumeName"
          params={{ id, volumeName: row.original.name }}
          className="text-primary hover:underline font-medium text-sm"
        >
          {row.original.name}
        </Link>
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
      accessorKey: "mountpoint",
      header: "Mountpoint",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground truncate block max-w-xs">{getValue() as string}</span>
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
            onClick={() => { if (confirm("Remove this volume?")) removeMutation.mutate(row.original.name); }}
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Volumes</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isLoading ? "Loading…" : `${volumes?.length ?? 0} volumes found`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { if (agent && confirm("Prune unused volumes?")) pruneMutation.mutate(); }}
          disabled={pruneMutation.isPending || !agent}
        >
          <Scissors className="h-4 w-4 mr-2" />
          Prune Unused
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-card animate-pulse border" />)}</div>
      ) : !volumes || volumes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No volumes found</h3>
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
  );
}
