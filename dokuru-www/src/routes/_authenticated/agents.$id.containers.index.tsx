import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  SquareIcon,
  RotateCw,
  Trash2,
  Container as ContainerIcon,
  ChevronDown,
  Search,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { canUseDockerAgent, dockerApi, dockerCredential, type Container } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { ContainerTabPanel } from "@/components/containers/ContainerTabs";
import { PageHeader } from "@/components/ui/page-header";
import { containerUiKey, useContainerUiStore, type ContainerTab } from "@/stores/use-container-ui-store";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import { useState } from "react";

const EMPTY_EXPANDED_CONTAINERS: Record<string, boolean> = {};

export const Route = createFileRoute("/_authenticated/agents/$id/containers/")({
  component: ContainersPage,
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

function ContainerRowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_6rem_minmax(0,2fr)]">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="hidden h-4 w-32 md:block" />
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContainerRow({
  container,
  agentUrl,
  token,
  agentId,
  onStart,
  onStop,
  onRestart,
  onRemove,
  expanded,
  onExpandedChange,
  activeTab,
  onTabChange,
  startPendingId,
  stopPendingId,
  restartPendingId,
  removePendingId,
  suppressExpandAnimation,
}: {
  container: Container;
  agentUrl: string;
  token: string;
  agentId: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activeTab: ContainerTab;
  onTabChange: (tab: ContainerTab) => void;
  startPendingId: string | undefined;
  stopPendingId: string | undefined;
  restartPendingId: string | undefined;
  removePendingId: string | undefined;
  suppressExpandAnimation: boolean;
}) {
  const isRunning = container.state.toLowerCase() === "running";
  const name = container.names[0]?.replace("/", "") || container.id.slice(0, 12);

  const isThisPending = [startPendingId, stopPendingId, restartPendingId, removePendingId].includes(container.id);
  const isStarting    = startPendingId   === container.id;
  const isStopping    = stopPendingId    === container.id;
  const isRestarting  = restartPendingId === container.id;
  const isRemoving    = removePendingId  === container.id;

  return (
    <TooltipProvider>
      <div className={`group border rounded-lg bg-card hover:shadow-md transition-all duration-200 overflow-hidden ${!isRunning ? "opacity-60 hover:opacity-100" : ""}`}>
        {/* Row header */}
        <div
          className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-4 transition-colors hover:bg-accent/50 sm:flex-nowrap sm:gap-4 sm:px-5"
          onClick={() => onExpandedChange(!expanded)}
        >
          <div className="relative flex items-center justify-center w-8 h-8 shrink-0 rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <ContainerIcon className="h-4 w-4" />
            <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-card ${
              isRunning ? "bg-primary" : "bg-muted-foreground/40"
            }`} />
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-2 sm:min-w-[15rem] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_6rem_minmax(0,2fr)] md:gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-sm truncate">{name}</span>
              <span className="text-xs text-muted-foreground font-mono truncate">{container.id.slice(0, 12)}</span>
            </div>
            <span className="text-sm text-muted-foreground truncate font-mono">{container.image}</span>
            <div>
              <Badge variant="outline" className={`text-xs font-medium w-fit ${stateColor(container.state)}`}>
                {container.state}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground truncate hidden md:block">{container.status}</span>
          </div>

          <span className="shrink-0 text-muted-foreground transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronDown className="h-4 w-4" />
          </span>

          {/* Actions — stop propagation so row click doesn't toggle expand */}
          <div className="order-last ml-11 flex w-[calc(100%-2.75rem)] shrink-0 items-center justify-end gap-1 sm:order-none sm:ml-0 sm:w-auto" onClick={(e) => e.stopPropagation()}>
            {/* Slot 1: stop (running) or start (stopped) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-9 w-9 p-0 text-muted-foreground ${
                    isRunning
                      ? "hover:!bg-transparent hover:text-destructive"
                      : "hover:!bg-transparent hover:text-primary"
                  }`}
                  onClick={() => isRunning ? onStop(container.id) : onStart(container.id)}
                  disabled={isThisPending}
                >
                  {(isStopping || isStarting)
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : isRunning
                      ? <SquareIcon className="h-4 w-4 fill-current" />
                      : <Play className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isRunning ? "Stop container" : "Start container"}</TooltipContent>
            </Tooltip>

            {/* Slot 2: restart (running) or empty spacer (stopped) */}
            {isRunning ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 hover:!bg-transparent hover:text-primary"
                    onClick={() => onRestart(container.id)}
                    disabled={isThisPending}
                  >
                    {isRestarting
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RotateCw className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restart container</TooltipContent>
              </Tooltip>
            ) : (
              <div className="h-9 w-9 shrink-0" />
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 hover:!bg-transparent hover:text-primary"
                  asChild
                >
                  <Link to="/agents/$id/containers/$containerId" params={{ id: agentId, containerId: container.id }}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in new page</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 hover:!bg-transparent hover:text-destructive"
                  onClick={() => { if (confirm(`Remove container "${name}"?`)) onRemove(container.id); }}
                  disabled={isThisPending}
                >
                  {isRemoving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove container</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Inline detail panel */}
        {expanded && (
          <div className={suppressExpandAnimation ? undefined : "animate-in slide-in-from-top-2 duration-200"}>
            <ContainerTabPanel
              container={container}
              agentUrl={agentUrl}
              token={token}
              agentId={agentId}
              activeTab={activeTab}
              onTabChange={onTabChange}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ContainersPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const showAll = useContainerUiStore((state) => state.showAllByAgent[id] ?? true);
  const search = useContainerUiStore((state) => state.searchByAgent[id] ?? "");
  const expandedContainers = useContainerUiStore((state) => state.expandedByAgent[id] ?? EMPTY_EXPANDED_CONTAINERS);
  const activeTabs = useContainerUiStore((state) => state.activeTabs);
  const setShowAll = useContainerUiStore((state) => state.setShowAll);
  const setSearch = useContainerUiStore((state) => state.setSearch);
  const setContainerExpanded = useContainerUiStore((state) => state.setContainerExpanded);
  const setContainerTab = useContainerUiStore((state) => state.setContainerTab);

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id, showAll],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, credential, showAll);
      return res.data;
    },
    enabled: canUseDockerAgent(agent),
    refetchInterval: 5000,
  });
  const scrollMemory = useWindowScrollMemory(`agent:${id}:containers`, !isLoading && !!containers);
  const [localExpandedContainers, setLocalExpandedContainers] = useState<Record<string, boolean>>({});
  const [localActiveTabs, setLocalActiveTabs] = useState<Record<string, ContainerTab>>({});
  const shouldRestoreContainerUi = scrollMemory.restoreFromSidebar;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const handleContainerExpandedChange = (containerId: string, expanded: boolean) => {
    const key = containerUiKey(id, containerId);
    setContainerExpanded(id, containerId, expanded);
    setLocalExpandedContainers((prev) => ({ ...prev, [key]: expanded }));
  };

  const handleContainerTabChange = (containerId: string, tab: ContainerTab) => {
    const key = containerUiKey(id, containerId);
    setContainerTab(id, containerId, tab);
    setLocalActiveTabs((prev) => ({ ...prev, [key]: tab }));
  };

  const startMutation = useMutation({
    mutationFn: (cid: string) => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.startContainer(agent.url, credential, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container started"); },
    onError:   () => toast.error("Failed to start container"),
  });

  const stopMutation = useMutation({
    mutationFn: (cid: string) => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.stopContainer(agent.url, credential, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container stopped"); },
    onError:   () => toast.error("Failed to stop container"),
  });

  const restartMutation = useMutation({
    mutationFn: (cid: string) => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.restartContainer(agent.url, credential, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container restarted"); },
    onError:   () => toast.error("Failed to restart container"),
  });

  const removeMutation = useMutation({
    mutationFn: (cid: string) => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      return dockerApi.removeContainer(agent.url, credential, cid);
    },
    onSuccess: () => { invalidate(); toast.success("Container removed"); },
    onError:   () => toast.error("Failed to remove container"),
  });

  const startPendingId   = startMutation.isPending   ? startMutation.variables   : undefined;
  const stopPendingId    = stopMutation.isPending    ? stopMutation.variables    : undefined;
  const restartPendingId = restartMutation.isPending ? restartMutation.variables : undefined;
  const removePendingId  = removeMutation.isPending  ? removeMutation.variables  : undefined;

  const filtered = (containers ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.names[0] ?? "").toLowerCase().includes(q)
      || c.image.toLowerCase().includes(q)
      || c.state.toLowerCase().includes(q);
  });

  const running = filtered.filter((c) => c.state.toLowerCase() === "running").length;

  return (
    <div className={`mx-auto w-full max-w-7xl ${scrollMemory.isRestoring ? "invisible" : ""}`}>
      <PageHeader
        icon={ContainerIcon}
        title="Containers"
        loading={isLoading}
        stats={[
          { value: running, label: "running", pulse: running > 0 },
          { value: filtered.length, label: "total" },
        ]}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="h-9 w-full bg-muted/40 pl-9 text-sm border-border/60 focus:bg-background sm:w-52"
            placeholder="Search containers…"
            value={search}
            onChange={(e) => setSearch(id, e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant={showAll ? "default" : "outline"}
          className="h-9 px-4"
          onClick={() => setShowAll(id, !showAll)}
        >
          {showAll ? "All" : "Running"}
        </Button>
      </PageHeader>

      <div className="space-y-6">

      {isLoading ? (
        <ContainerRowsSkeleton />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <ContainerIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No containers found</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {search
              ? "No containers match your search criteria."
              : "No Docker containers are running on this agent."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((container) => (
            <ContainerRow
              key={container.id}
              container={container}
              agentUrl={agent?.url ?? ""}
              token={dockerCredential(agent)}
              agentId={id}
              expanded={shouldRestoreContainerUi ? !!expandedContainers[container.id] : !!localExpandedContainers[containerUiKey(id, container.id)]}
              onExpandedChange={(expanded) => handleContainerExpandedChange(container.id, expanded)}
              activeTab={(shouldRestoreContainerUi ? activeTabs : localActiveTabs)[containerUiKey(id, container.id)] ?? "overview"}
              onTabChange={(tab) => handleContainerTabChange(container.id, tab)}
              onStart={(cid) => startMutation.mutate(cid)}
              onStop={(cid) => stopMutation.mutate(cid)}
              onRestart={(cid) => restartMutation.mutate(cid)}
              onRemove={(cid) => removeMutation.mutate(cid)}
              startPendingId={startPendingId}
              stopPendingId={stopPendingId}
              restartPendingId={restartPendingId}
              removePendingId={removePendingId}
              suppressExpandAnimation={scrollMemory.restoreFromSidebar}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
