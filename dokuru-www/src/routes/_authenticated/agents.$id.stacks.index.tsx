import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SquareStack, Container, FolderOpen, FileText, Search } from "lucide-react";
import { dockerApi, type Stack } from "@/services/docker-api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { agentApi } from "@/lib/api/agent";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/agents/$id/stacks/")({
  component: StacksPage,
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

function StackCard({ stack }: { stack: Stack }) {
  const allRunning = stack.running === stack.total;
  const noneRunning = stack.running === 0;

  return (
    <div className="group border rounded-xl bg-card hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-border/50">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500/20 transition-colors shrink-0">
          <SquareStack className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base truncate">{stack.name}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
              allRunning
                ? "bg-green-500/10 text-green-500 border-green-500/20"
                : noneRunning
                ? "bg-gray-500/10 text-gray-500 border-gray-500/20"
                : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full bg-current ${allRunning ? "animate-pulse" : ""}`} />
              {allRunning ? "running" : noneRunning ? "stopped" : "partial"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Container className="h-3 w-3" />
              {stack.running}/{stack.total} containers
            </span>
            {stack.working_dir && (
              <span className="flex items-center gap-1 truncate">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="truncate font-mono">{stack.working_dir}</span>
              </span>
            )}
            {stack.config_file && (
              <span className="flex items-center gap-1 truncate">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate font-mono text-xs">{stack.config_file.split("/").pop()}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Container list */}
      <div className="divide-y divide-border/30">
        {stack.containers.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted/50 shrink-0">
              <Container className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-center">
              <span className="text-sm font-medium truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground font-mono truncate">{c.image}</span>
              <Badge variant="outline" className={`text-xs w-fit ${stateColor(c.state)}`}>
                {c.state}
              </Badge>
            </div>
            {c.service && (
              <Badge variant="secondary" className="text-xs font-mono shrink-0 hidden sm:flex">
                {c.service}
              </Badge>
            )}
          </div>
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
    return s.name.toLowerCase().includes(q) ||
      s.containers.some(c => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q));
  });

  const totalRunning = filtered.reduce((sum, s) => sum + s.running, 0);
  const totalContainers = filtered.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Stacks</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {isLoading ? <span>Loading…</span> : (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-cyan-500/70" />
                  <span className="font-medium">{filtered.length} stack{filtered.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-muted-foreground/50">•</span>
                <span>{totalRunning}/{totalContainers} containers running</span>
              </>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10 w-64 text-sm"
            placeholder="Search stacks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="rounded-xl border bg-card animate-pulse h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <SquareStack className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No stacks found</h3>
          <p className="text-muted-foreground text-sm">
            {search
              ? "No stacks match your search."
              : "No Docker Compose stacks are running on this agent."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((stack) => (
            <StackCard key={stack.name} stack={stack} />
          ))}
        </div>
      )}
    </div>
  );
}
