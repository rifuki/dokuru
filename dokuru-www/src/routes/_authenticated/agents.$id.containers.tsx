import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Container, Play, Square, RotateCw, Trash2 } from "lucide-react";
import { dockerApi } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/containers")({
  component: ContainersPage,
});

function ContainersPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id],
    queryFn: () =>
      dockerApi.listContainers(agent!.url, agent!.token, true).then((res: any) => res.data),
    enabled: !!agent,
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: (containerId: string) =>
      dockerApi.startContainer(agent!.url, agent!.token, containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      toast.success("Container started");
    },
    onError: () => toast.error("Failed to start container"),
  });

  const stopMutation = useMutation({
    mutationFn: (containerId: string) =>
      dockerApi.stopContainer(agent!.url, agent!.token, containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      toast.success("Container stopped");
    },
    onError: () => toast.error("Failed to stop container"),
  });

  const restartMutation = useMutation({
    mutationFn: (containerId: string) =>
      dockerApi.restartContainer(agent!.url, agent!.token, containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      toast.success("Container restarted");
    },
    onError: () => toast.error("Failed to restart container"),
  });

  const removeMutation = useMutation({
    mutationFn: (containerId: string) =>
      dockerApi.removeContainer(agent!.url, agent!.token, containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containers", id] });
      toast.success("Container removed");
    },
    onError: () => toast.error("Failed to remove container"),
  });

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case "running":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "exited":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Containers</h2>
          <p className="text-muted-foreground text-sm mt-1">Loading containers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Containers</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {containers?.length || 0} containers found
          </p>
        </div>
      </div>

      {!containers || containers.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <Container className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No containers found</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            No Docker containers are running on this agent.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers.map((container: any) => (
                <TableRow key={container.id}>
                  <TableCell className="font-medium">
                    {container.names[0]?.replace("/", "") || container.id.slice(0, 12)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{container.image}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStateColor(container.state)}>
                      {container.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {container.status}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {container.state.toLowerCase() === "running" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => stopMutation.mutate(container.id)}
                            disabled={stopMutation.isPending}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => restartMutation.mutate(container.id)}
                            disabled={restartMutation.isPending}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startMutation.mutate(container.id)}
                          disabled={startMutation.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this container?")) {
                            removeMutation.mutate(container.id);
                          }
                        }}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
