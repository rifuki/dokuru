import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dockerApi, type Container } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container as ContainerIcon, ArrowLeft, Play, SquareIcon, RotateCw, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { ContainerTabPanel } from "@/components/containers/ContainerTabs";

export const Route = createFileRoute("/_authenticated/agents/$id/containers/$containerId")({
  component: ContainerDetailPage,
});

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-green-500/10 text-green-500 border-green-500/20";
    case "exited":     return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":     return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:           return "bg-muted text-muted-foreground border-muted";
  }
}

function ContainerDetailPage() {
  const { id, containerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  // Fetch the specific container from the list
  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id, true],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, agent.token, true);
      return res.data;
    },
    enabled: !!agent?.token,
    refetchInterval: 5000,
  });

  const container: Container | undefined = containers?.find((c) => c.id === containerId);
  const isRunning = container?.state.toLowerCase() === "running";
  const name = container?.names[0]?.replace("/", "") || containerId.slice(0, 12);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const startMutation = useMutation({
    mutationFn: () => { if (!agent?.token) throw new Error(); return dockerApi.startContainer(agent.url, agent.token, containerId); },
    onSuccess: () => { invalidate(); toast.success("Container started"); },
    onError: () => toast.error("Failed to start container"),
  });
  const stopMutation = useMutation({
    mutationFn: () => { if (!agent?.token) throw new Error(); return dockerApi.stopContainer(agent.url, agent.token, containerId); },
    onSuccess: () => { invalidate(); toast.success("Container stopped"); },
    onError: () => toast.error("Failed to stop container"),
  });
  const restartMutation = useMutation({
    mutationFn: () => { if (!agent?.token) throw new Error(); return dockerApi.restartContainer(agent.url, agent.token, containerId); },
    onSuccess: () => { invalidate(); toast.success("Container restarted"); },
    onError: () => toast.error("Failed to restart container"),
  });
  const removeMutation = useMutation({
    mutationFn: () => { if (!agent?.token) throw new Error(); return dockerApi.removeContainer(agent.url, agent.token, containerId); },
    onSuccess: () => {
      invalidate();
      toast.success("Container removed");
      navigate({ to: "/agents/$id/containers", params: { id } });
    },
    onError: () => toast.error("Failed to remove container"),
  });

  const anyPending = startMutation.isPending || stopMutation.isPending || restartMutation.isPending || removeMutation.isPending;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <div className="animate-pulse h-12 bg-card rounded-lg" />
        <div className="animate-pulse h-32 bg-card rounded-lg" />
      </div>
    );
  }

  if (!container) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <ContainerIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">Container not found</h3>
          <p className="text-muted-foreground mt-2 text-sm">The container may have been removed.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/agents/$id/containers" params={{ id }}>Back to Containers</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="flex items-center gap-4 min-w-0">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/agents/$id/containers" params={{ id }}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
              <ContainerIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-bold tracking-tight truncate">{name}</h2>
                <Badge variant="outline" className={`text-xs font-medium shrink-0 ${stateColor(container.state)}`}>
                  {container.state}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{container.id.slice(0, 12)} · {container.image}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <>
              <Button size="sm" variant="outline" className="hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/30" onClick={() => stopMutation.mutate()} disabled={anyPending}>
                <SquareIcon className="h-4 w-4 mr-1.5 fill-current" />
                Stop
              </Button>
              <Button size="sm" variant="outline" className="hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30" onClick={() => restartMutation.mutate()} disabled={anyPending}>
                <RotateCw className="h-4 w-4 mr-1.5" />
                Restart
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/30" onClick={() => startMutation.mutate()} disabled={anyPending}>
              <Play className="h-4 w-4 mr-1.5" />
              Start
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            onClick={() => { if (confirm(`Remove container "${name}"?`)) removeMutation.mutate(); }}
            disabled={anyPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Remove
          </Button>
        </div>
      </div>

      {/* Tab panel */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <ContainerTabPanel
          container={container}
          agentUrl={agent?.url ?? ""}
          token={agent?.token ?? ""}
          agentId={id}
        />
      </div>
    </div>
  );
}
