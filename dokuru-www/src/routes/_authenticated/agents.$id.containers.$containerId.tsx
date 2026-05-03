import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { canUseDockerAgent, dockerApi, dockerCredential, type Container } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Container as ContainerIcon, ArrowLeft, Play, SquareIcon, RotateCw, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { ContainerTabPanel } from "@/components/containers/ContainerTabs";
import { useState } from "react";
import { containerUiKey, useContainerUiStore } from "@/stores/use-container-ui-store";

type ContainerDetailSearch = {
  from?: "audit" | "containers";
  auditId?: string;
  ruleId?: string;
  containerName?: string;
};

export const Route = createFileRoute("/_authenticated/agents/$id/containers/$containerId")({
  validateSearch: (search: Record<string, unknown>): ContainerDetailSearch => ({
    from: search.from === "audit" || search.from === "containers" ? search.from : undefined,
    auditId: typeof search.auditId === "string" ? search.auditId : undefined,
    ruleId: typeof search.ruleId === "string" ? search.ruleId : undefined,
    containerName: typeof search.containerName === "string" ? search.containerName : undefined,
  }),
  component: ContainerDetailPage,
});

function normalizeContainerLookup(value: string) {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

function findRoutedContainer(containers: Container[] | undefined, containerId: string, containerName?: string) {
  const normalizedId = normalizeContainerLookup(containerId);
  const normalizedName = containerName ? normalizeContainerLookup(containerName) : "";
  if (!containers || !normalizedId) return undefined;

  return containers.find((container) => {
    const id = container.id.toLowerCase();
    if (id === normalizedId || (normalizedId.length >= 12 && id.startsWith(normalizedId))) return true;
    return container.names.some((name) => {
      const normalized = normalizeContainerLookup(name);
      return normalized === normalizedId || (!!normalizedName && normalized === normalizedName);
    });
  });
}

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-primary/10 text-primary border-primary/25";
    case "exited":     return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":     return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:           return "bg-muted text-muted-foreground border-muted";
  }
}

function ContainerDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-72 max-w-[60vw]" />
          </div>
        </div>
        <div className="hidden gap-2 md:flex">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex gap-3 border-b bg-muted/30 px-5 pt-3">
          <Skeleton className="h-11 w-28 rounded-t-lg" />
          <Skeleton className="h-11 w-24 rounded-t-lg" />
          <Skeleton className="h-11 w-24 rounded-t-lg" />
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <Skeleton className="h-48 rounded-[19px]" />
          <Skeleton className="h-48 rounded-[19px]" />
          <Skeleton className="h-36 rounded-[19px] md:col-span-2" />
        </div>
      </div>
    </div>
  );
}

function ContainerDetailPage() {
  const { id, containerId } = Route.useParams();
  const { from, auditId, ruleId, containerName } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasAuditBack = from === "audit" && !!auditId;
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

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

  const container = findRoutedContainer(containers, containerId, containerName);
  const resolvedContainerId = container?.id ?? containerId;
  const activeTab = useContainerUiStore((state) => state.activeTabs[containerUiKey(id, resolvedContainerId)] ?? "overview");
  const setContainerTab = useContainerUiStore((state) => state.setContainerTab);
  const isRunning = container?.state.toLowerCase() === "running";
  const name = container?.names[0]?.replace("/", "") || containerId.slice(0, 12);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const startMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.startContainer(agent.url, credential, resolvedContainerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container started"); },
    onError: () => toast.error("Failed to start container"),
  });
  const stopMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.stopContainer(agent.url, credential, resolvedContainerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container stopped"); },
    onError: () => toast.error("Failed to stop container"),
  });
  const restartMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.restartContainer(agent.url, credential, resolvedContainerId);
    },
    onSuccess: () => { invalidate(); toast.success("Container restarted"); },
    onError: () => toast.error("Failed to restart container"),
  });
  const removeMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.removeContainer(agent.url, credential, resolvedContainerId);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Container removed");
      navigate({ to: "/agents/$id/containers", params: { id } });
    },
    onError: () => toast.error("Failed to remove container"),
    onSettled: () => setRemoveDialogOpen(false),
  });

  const anyPending = startMutation.isPending || stopMutation.isPending || restartMutation.isPending || removeMutation.isPending;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (hasAuditBack) {
      navigate({ to: "/agents/$id/audits/$auditId", params: { id, auditId: auditId! }, search: { ruleId } });
      return;
    }
    navigate({ to: "/agents/$id/containers", params: { id } });
  };

  if (isLoading) {
    return <ContainerDetailSkeleton />;
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
                Back
              </Link>
            ) : (
              <Link to="/agents/$id/containers" params={{ id }}>Back</Link>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Container</AlertDialogTitle>
          <AlertDialogDescription>
            Remove container "{name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            {removeMutation.isPending ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="flex items-center gap-4 min-w-0">
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
        <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
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
            variant="destructive"
            onClick={() => setRemoveDialogOpen(true)}
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
          activeTab={activeTab}
          onTabChange={(tab) => setContainerTab(id, container.id, tab)}
        />
      </div>
    </div>
    </>
  );
}
