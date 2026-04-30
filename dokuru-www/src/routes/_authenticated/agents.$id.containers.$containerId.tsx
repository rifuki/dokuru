import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { canUseDockerAgent, dockerApi, dockerCredential, type Container, type Stack } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container as ContainerIcon, ArrowLeft, Play, SquareIcon, RotateCw, Trash2, Layers } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { ContainerTabPanel } from "@/components/containers/ContainerTabs";

type ContainerDetailSearch = {
  from?: "audit" | "containers";
  auditId?: string;
  ruleId?: string;
};

export const Route = createFileRoute("/_authenticated/agents/$id/containers/$containerId")({
  validateSearch: (search: Record<string, unknown>): ContainerDetailSearch => ({
    from: search.from === "audit" || search.from === "containers" ? search.from : undefined,
    auditId: typeof search.auditId === "string" ? search.auditId : undefined,
    ruleId: typeof search.ruleId === "string" ? search.ruleId : undefined,
  }),
  component: ContainerDetailPage,
});

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-primary/10 text-primary border-primary/25";
    case "exited":     return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":     return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:           return "bg-muted text-muted-foreground border-muted";
  }
}

function findContainerStack(stacks: Stack[] | undefined, containerId: string) {
  for (const stack of stacks ?? []) {
    const container = stack.containers.find((item) => item.id === containerId);
    if (container) return { stack: stack.name, service: container.service || undefined };
  }
  return undefined;
}

function ContainerDetailPage() {
  const { id, containerId } = Route.useParams();
  const { from, auditId, ruleId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasAuditBack = from === "audit" && !!auditId;
  const backLabel = hasAuditBack ? "Back to Audit Rule" : "Back to Containers";

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  // Fetch the specific container from the list
  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id, true],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, credential, true);
      return res.data;
    },
    enabled: canUseDockerAgent(agent),
    refetchInterval: 5000,
  });

  const { data: stacks } = useQuery({
    queryKey: ["stacks", id],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.listStacks(agent.url, credential);
      return res.data;
    },
    enabled: canUseDockerAgent(agent),
    refetchInterval: 10000,
  });

  const container: Container | undefined = containers?.find((c) => c.id === containerId);
  const isRunning = container?.state.toLowerCase() === "running";
  const name = container?.names[0]?.replace("/", "") || containerId.slice(0, 12);
  const stackInfo = findContainerStack(stacks, containerId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const startMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.startContainer(agent.url, credential, containerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container started"); },
    onError: () => toast.error("Failed to start container"),
  });
  const stopMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.stopContainer(agent.url, credential, containerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container stopped"); },
    onError: () => toast.error("Failed to stop container"),
  });
  const restartMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.restartContainer(agent.url, credential, containerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container restarted"); },
    onError: () => toast.error("Failed to restart container"),
  });
  const removeMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.removeContainer(agent.url, credential, containerId);
    },
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
            {hasAuditBack ? (
              <Link to="/agents/$id/audits/$auditId" params={{ id, auditId }} search={{ ruleId }}>
                {backLabel}
              </Link>
            ) : (
              <Link to="/agents/$id/containers" params={{ id }}>{backLabel}</Link>
            )}
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
            {hasAuditBack ? (
              <Link to="/agents/$id/audits/$auditId" params={{ id, auditId }} search={{ ruleId }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                {backLabel}
              </Link>
            ) : (
              <Link to="/agents/$id/containers" params={{ id }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                {backLabel}
              </Link>
            )}
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
                {stackInfo && (
                  <Link
                    to="/agents/$id/stacks"
                    params={{ id }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-mono text-primary hover:bg-primary/15"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {stackInfo.stack}
                    {stackInfo.service && <span className="text-primary/70">/{stackInfo.service}</span>}
                  </Link>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{container.id.slice(0, 12)} · {container.image}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <>
              <Button size="sm" variant="outline" className="hover:!bg-transparent hover:text-destructive hover:border-destructive/30" onClick={() => stopMutation.mutate()} disabled={anyPending}>
                <SquareIcon className="h-4 w-4 mr-1.5 fill-current" />
                Stop
              </Button>
              <Button size="sm" variant="outline" className="hover:!bg-transparent hover:text-primary hover:border-primary/30" onClick={() => restartMutation.mutate()} disabled={anyPending}>
                <RotateCw className="h-4 w-4 mr-1.5" />
                Restart
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="hover:!bg-transparent hover:text-primary hover:border-primary/30" onClick={() => startMutation.mutate()} disabled={anyPending}>
              <Play className="h-4 w-4 mr-1.5" />
              Start
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="hover:!bg-transparent hover:text-destructive hover:border-destructive/30"
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
          token={dockerCredential(agent)}
          agentId={id}
        />
      </div>
    </div>
  );
}
