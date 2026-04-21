import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  SquareStack,
  Container,
  FolderOpen,
  FileText,
  Search,
  ChevronRight,
  Layers,
  Activity,
} from "lucide-react";
import { dockerApi, type Stack, type StackContainer } from "@/services/docker-api";
import { Input } from "@/components/ui/input";
import { agentApi } from "@/lib/api/agent";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents/$id/stacks/")({
  component: StacksPage,
});

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-green-500/10 text-green-400 border-green-500/30";
    case "exited":     return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    case "paused":     return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "restarting": return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    default:           return "bg-muted text-muted-foreground border-muted";
  }
}

function stateDot(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-green-400";
    case "exited":     return "bg-gray-400";
    case "paused":     return "bg-yellow-400";
    case "restarting": return "bg-blue-400";
    default:           return "bg-muted-foreground";
  }
}

function ContainerRow({
  container,
  agentId,
}: {
  container: StackContainer;
  agentId: string;
}) {
  const isRunning = container.state.toLowerCase() === "running";

  return (
    <Link
      to="/agents/$id/containers/$containerId"
      params={{ id: agentId, containerId: container.id }}
      className="group/row flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
    >
      {/* Status indicator */}
      <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60 shrink-0 group-hover/row:bg-muted transition-colors">
        <Container className="h-3.5 w-3.5 text-muted-foreground" />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
            stateDot(container.state),
            isRunning && "animate-pulse",
          )}
        />
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block group-hover/row:text-foreground transition-colors">
          {container.name}
        </span>
        <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5">
          {container.image}
        </span>
      </div>

      {/* Service badge */}
      {container.service && (
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-muted/60 text-muted-foreground border border-border/50 shrink-0">
          {container.service}
        </span>
      )}

      {/* State badge */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0",
          stateColor(container.state),
        )}
      >
        {container.state}
      </span>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover/row:text-muted-foreground group-hover/row:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

function StackCard({ stack, agentId }: { stack: Stack; agentId: string }) {
  const allRunning = stack.running === stack.total;
  const noneRunning = stack.running === 0;
  const runPct = stack.total > 0 ? (stack.running / stack.total) * 100 : 0;

  const statusLabel = allRunning ? "running" : noneRunning ? "stopped" : "partial";
  const statusClass = allRunning
    ? "bg-green-500/10 text-green-400 border-green-500/30"
    : noneRunning
    ? "bg-gray-500/10 text-gray-400 border-gray-500/30"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  const barClass = allRunning
    ? "bg-green-500"
    : noneRunning
    ? "bg-gray-500"
    : "bg-yellow-500";

  return (
    <div className="group border border-border/60 rounded-2xl bg-card hover:border-border hover:shadow-lg hover:shadow-black/5 transition-all duration-300 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-gradient-to-r from-muted/30 to-transparent border-b border-border/40">
        {/* Icon */}
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/15 transition-colors shrink-0 border border-cyan-500/20">
          <SquareStack className="h-5 w-5" />
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-base tracking-tight">{stack.name}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full border",
                statusClass,
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-current",
                  allRunning && "animate-pulse",
                )}
              />
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              <span>
                <span className="text-foreground font-medium">{stack.running}</span>
                /{stack.total} running
              </span>
            </span>
            {stack.working_dir && (
              <span className="flex items-center gap-1.5 truncate">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="truncate font-mono">{stack.working_dir}</span>
              </span>
            )}
            {stack.config_file && (
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="font-mono">{stack.config_file.split("/").pop()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress ring / count */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-2xl font-bold tabular-nums leading-none">
            {stack.total}
          </span>
          <span className="text-xs text-muted-foreground">containers</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted/40">
        <div
          className={cn("h-full transition-all duration-700", barClass)}
          style={{ width: `${runPct}%` }}
        />
      </div>

      {/* Container rows */}
      <div className="divide-y divide-border/30">
        {stack.containers.map((c) => (
          <ContainerRow key={c.id} container={c} agentId={agentId} />
        ))}
      </div>
    </div>
  );
}

function StacksPage() {
  const { id } = Route.useParams();
  const [search, setSearch] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: stacks, isLoading } = useQuery({
    queryKey: ["stacks", id],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listStacks(agent.url, agent.token);
      return res.data;
    },
    enabled: !!agent?.token,
    refetchInterval: 10000,
  });

  const filtered = (stacks ?? []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.containers.some(
        (c) =>
          c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
      )
    );
  });

  const totalRunning = filtered.reduce((sum, s) => sum + s.running, 0);
  const totalContainers = filtered.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Stacks</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
              Loading stacks…
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground pl-12">
              <span>
                <span className="text-foreground font-semibold">{filtered.length}</span>{" "}
                stack{filtered.length !== 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>
                <span className="text-foreground font-semibold">{totalRunning}</span>
                /{totalContainers} containers running
              </span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 w-60 text-sm bg-muted/40 border-border/60 focus:bg-background"
            placeholder="Search stacks or containers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border bg-card animate-pulse h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/50 bg-muted/10 p-20 text-center">
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center border border-border/50">
              <SquareStack className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-1.5">No stacks found</h3>
          <p className="text-muted-foreground text-sm">
            {search
              ? "No stacks match your search."
              : "No Docker Compose stacks are running on this agent."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((stack) => (
            <StackCard key={stack.name} stack={stack} agentId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
