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
} from "lucide-react";
import { dockerApi, type Container } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { useState } from "react";
import { ContainerTabPanel } from "@/components/containers/ContainerTabs";

export const Route = createFileRoute("/_authenticated/agents/$id/containers/")({
  component: ContainersPage,
});

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":   return "bg-green-500/10 text-green-500 border-green-500/20";
    case "exited":    return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":    return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting":return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:          return "bg-muted text-muted-foreground border-muted";
  }
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
  actionPending,
}: {
  container: Container;
  agentUrl: string;
  token: string;
  agentId: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
  actionPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = container.state.toLowerCase() === "running";
  const name = container.names[0]?.replace("/", "") || container.id.slice(0, 12);

  return (
    <TooltipProvider>
      <div className="group border rounded-lg bg-card hover:shadow-md transition-all duration-200 overflow-hidden">
        {/* Row header */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-accent/50 transition-colors select-none"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
            <ContainerIcon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_minmax(0,2fr)] gap-4 items-center">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold text-sm truncate">{name}</span>
              <span className="text-xs text-muted-foreground font-mono truncate">{container.id.slice(0, 12)}</span>
            </div>
            <span className="text-sm text-muted-foreground truncate font-mono">{container.image}</span>
            <Badge variant="outline" className={`text-xs font-medium w-fit ${stateColor(container.state)}`}>
              {container.state}
            </Badge>
            <span className="text-xs text-muted-foreground truncate hidden md:block">{container.status}</span>
          </div>

          {/* ChevronDown expand indicator */}
          <span className="text-muted-foreground transition-transform duration-200 shrink-0" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronDown className="h-4 w-4" />
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isRunning ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-yellow-500/10 hover:text-yellow-500" onClick={() => onStop(container.id)} disabled={actionPending}>
                      <SquareIcon className="h-4 w-4 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Stop container</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-blue-500/10 hover:text-blue-500" onClick={() => onRestart(container.id)} disabled={actionPending}>
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restart container</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-green-500/10 hover:text-green-500" onClick={() => onStart(container.id)} disabled={actionPending}>
                    <Play className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start container</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 w-9 p-0 hover:bg-primary/10 hover:text-primary" asChild>
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
                  className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => { if (confirm(`Remove container "${name}"?`)) onRemove(container.id); }}
                  disabled={actionPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove container</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Inline detail panel */}
        {expanded && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <ContainerTabPanel container={container} agentUrl={agentUrl} token={token} agentId={agentId} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ContainersPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(true);
  const [search, setSearch] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: containers, isLoading } = useQuery({
    queryKey: ["containers", id, showAll],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, agent.token, showAll);
      return res.data;
    },
    enabled: !!agent?.token,
    refetchInterval: 5000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", id] });

  const startMutation   = useMutation({ mutationFn: (cid: string) => { if (!agent?.token) throw new Error(); return dockerApi.startContainer(agent.url, agent.token, cid); }, onSuccess: () => { invalidate(); toast.success("Container started"); }, onError: () => toast.error("Failed to start container") });
  const stopMutation    = useMutation({ mutationFn: (cid: string) => { if (!agent?.token) throw new Error(); return dockerApi.stopContainer(agent.url, agent.token, cid); },  onSuccess: () => { invalidate(); toast.success("Container stopped"); },  onError: () => toast.error("Failed to stop container") });
  const restartMutation = useMutation({ mutationFn: (cid: string) => { if (!agent?.token) throw new Error(); return dockerApi.restartContainer(agent.url, agent.token, cid); }, onSuccess: () => { invalidate(); toast.success("Container restarted"); }, onError: () => toast.error("Failed to restart container") });
  const removeMutation  = useMutation({ mutationFn: (cid: string) => { if (!agent?.token) throw new Error(); return dockerApi.removeContainer(agent.url, agent.token, cid); }, onSuccess: () => { invalidate(); toast.success("Container removed"); },  onError: () => toast.error("Failed to remove container") });

  const anyPending = startMutation.isPending || stopMutation.isPending || restartMutation.isPending || removeMutation.isPending;

  const filtered = (containers ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.names[0] ?? "").toLowerCase().includes(q) || c.image.toLowerCase().includes(q) || c.state.toLowerCase().includes(q);
  });

  const running = filtered.filter((c) => c.state.toLowerCase() === "running").length;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Containers</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {isLoading ? <span>Loading…</span> : (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-medium">{running} running</span>
                </div>
                <span className="text-muted-foreground/50">•</span>
                <span>{filtered.length} total</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-10 w-64 text-sm" placeholder="Search containers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button size="default" variant={showAll ? "default" : "outline"} className="h-10 px-4" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "All" : "Running"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="rounded-lg border bg-card animate-pulse h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <ContainerIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No containers found</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {search ? "No containers match your search criteria." : "No Docker containers are running on this agent."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((container) => (
            <ContainerRow
              key={container.id}
              container={container}
              agentUrl={agent?.url ?? ""}
              token={agent?.token ?? ""}
              agentId={id}
              onStart={(cid) => startMutation.mutate(cid)}
              onStop={(cid) => stopMutation.mutate(cid)}
              onRestart={(cid) => restartMutation.mutate(cid)}
              onRemove={(cid) => removeMutation.mutate(cid)}
              actionPending={anyPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
