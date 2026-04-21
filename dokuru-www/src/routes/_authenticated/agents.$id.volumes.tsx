import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Trash2 } from "lucide-react";
import { dockerApi, type Volume } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/volumes")({
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
      const res = await dockerApi.listVolumes(agent!.url, agent!.token);
      return res.data;
    },
    enabled: !!agent,
  });

  const removeMutation = useMutation({
    mutationFn: (volumeName: string) => dockerApi.removeVolume(agent!.url, agent!.token, volumeName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes", id] });
      toast.success("Volume removed");
    },
    onError: () => toast.error("Failed to remove volume"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => dockerApi.pruneVolumes(agent!.url, agent!.token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes", id] });
      toast.success("Unused volumes pruned");
    },
    onError: () => toast.error("Failed to prune volumes"),
  });

  if (isLoading) return <div className="max-w-7xl mx-auto w-full">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Volumes</h2>
          <p className="text-muted-foreground text-sm">{volumes?.length || 0} volumes found</p>
        </div>
        <Button variant="outline" onClick={() => { if (confirm("Prune unused volumes?")) pruneMutation.mutate(); }} disabled={pruneMutation.isPending}>
          <Trash2 className="h-4 w-4 mr-2" />
          Prune Unused
        </Button>
      </div>

      {!volumes || volumes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No volumes found</h3>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Mountpoint</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {volumes.map((volume: Volume) => (
                <TableRow key={volume.name}>
                  <TableCell className="font-medium">{volume.name}</TableCell>
                  <TableCell>{volume.driver}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{volume.mountpoint}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remove this volume?")) {
                          removeMutation.mutate(volume.name);
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
