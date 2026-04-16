import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Plus, RefreshCw, Container, Box, HardDrive, Search, ChevronDown, ArrowUpDown, Edit, Trash2, Cpu, Server, } from "lucide-react";
import { AddAgentModal } from "@/components/agents/AddAgentModal";
import { agentDirectApi, type DockerInfo } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsList,
});

type AgentWithInfo = {
  agent: Agent;
  info: DockerInfo | null;
  loading: boolean;
};

function AgentCard({ data, onClick }: { data: AgentWithInfo; onClick: () => void }) {
  const { agent, info, loading } = data;
  const { deleteAgent } = useAgentStore();
  const isOnline = !loading && info !== null;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    await deleteAgent(agent.id);
    setShowDeleteDialog(false);
  };

  return (
    <div className="flex transition-all">
      <div
        className="flex-1 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onClick}
      >
        <div className="p-4 flex items-center gap-6">
          <div className="w-14 flex items-center justify-center shrink-0">
            <img src="/docker.svg" alt="Docker" className="w-14 h-14" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base font-bold text-foreground tracking-tight">{agent.name}</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold uppercase ${isOnline
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-gray-500/30 bg-gray-500/10 text-gray-400"
                  }`}
              >
                {isOnline ? "●" : "○"} {isOnline ? "UP" : "DOWN"}
              </span>
              {info && (
                <span className="text-[12px] text-muted-foreground font-mono font-medium">
                  Docker {info.docker_version}
                </span>
              )}
              <span className="text-[12px] text-muted-foreground/70 font-mono">
                {agent.url.replace(/^https?:\/\//, '')}
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 mt-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-miku-primary" />
                <span className="text-[12px] text-muted-foreground/70">Loading...</span>
              </div>
            ) : info ? (
              <div className="flex items-center mt-3 text-[12px] font-medium text-muted-foreground flex-wrap divide-x divide-border">
                <div className="flex items-center gap-1.5 pr-3">
                  <Container className="w-3.5 h-3.5" />
                  <span>{info.containers.total} containers</span>
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {info.containers.running}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded bg-rose-400"></span>
                      {info.containers.stopped}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{info.volumes} volumes</span>
                </div>
                <div className="flex items-center gap-1.5 px-3">
                  <Box className="w-3.5 h-3.5" />
                  <span>{info.images} images</span>
                </div>
                <div className="flex items-center gap-1.5 px-3">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{info.cpu_count} CPU</span>
                </div>
                <div className="flex items-center gap-1.5 pl-3">
                  <Server className="w-3.5 h-3.5" />
                  <span>{(info.memory_total / 1024 / 1024 / 1024).toFixed(0)} GB RAM</span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground/50 mt-3">Unable to connect</p>
            )}
          </div>
        </div>
      </div>

      <div className="w-[180px] border-l border-border flex flex-col justify-center gap-2 px-4 py-3 bg-muted/30">
        <button
          className={`flex items-center justify-center gap-2 h-9 w-full rounded text-sm font-semibold transition-all ${
            loading
              ? "bg-blue-500/10 border border-blue-500/30 text-blue-400 cursor-wait"
              : isOnline
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 cursor-pointer"
              : "bg-gray-500/10 border border-gray-500/30 text-gray-400 cursor-not-allowed"
          }`}
          onClick={isOnline ? onClick : undefined}
          disabled={!isOnline || loading}
        >
          <span className={`w-2 h-2 rounded-full ${
            loading ? "bg-blue-400 animate-pulse" : isOnline ? "bg-emerald-400 animate-pulse" : "bg-gray-400"
          }`}></span>
          {loading ? "Connecting..." : isOnline ? "Connected" : "Disconnected"}
        </button>
      </div>

      <div className="w-12 border-l border-border flex flex-col items-center justify-start py-4 bg-muted/30">
        <button
          className="w-8 h-8 flex items-center justify-center text-muted-foreground/70 hover:text-foreground rounded hover:bg-muted/50 transition-colors group cursor-pointer"
          title="Edit agent"
          onClick={(e) => e.stopPropagation()}
        >
          <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteDialog(true);
          }}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground/70 hover:text-rose-400 rounded hover:bg-muted/50 transition-colors group cursor-pointer"
          title="Delete agent"
        >
          <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete agent "{agent.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AgentsList() {
  const navigate = useNavigate();
  const { agents, isLoading, fetchAgents } = useAgentStore();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [agentInfos, setAgentInfos] = useState<Record<string, { info: DockerInfo | null; loading: boolean }>>({});

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (agents.length === 0) return;

    const loadingState: Record<string, { info: DockerInfo | null; loading: boolean }> = {};
    for (const agent of agents) {
      loadingState[agent.id] = { info: null, loading: true };
    }

    queueMicrotask(() => {
      setAgentInfos(loadingState);

      for (const agent of agents) {
        const token = getAgentToken(agent.id);
        if (!token) {
          setAgentInfos((prev) => ({
            ...prev,
            [agent.id]: { info: null, loading: false },
          }));
          continue;
        }

        agentDirectApi
          .getInfo(agent.url, token)
          .then((info) => {
            setAgentInfos((prev) => ({
              ...prev,
              [agent.id]: { info, loading: false },
            }));
          })
          .catch(() => {
            setAgentInfos((prev) => ({
              ...prev,
              [agent.id]: { info: null, loading: false },
            }));
          });
      }
    });
  }, [agents]);

  const handleRefresh = () => {
    fetchAgents();
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agents</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            Add Agent
          </Button>
        </div>
      </div>

      {isLoading && agents.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center flex flex-col items-center justify-center min-h-[400px]">
          <img src="/docker.svg" alt="Docker" className="w-14 h-14 opacity-40 mb-4" />
          <h3 className="text-xl font-semibold tracking-tight">No agents</h3>
          <p className="text-muted-foreground mt-2 max-w-sm text-sm">
            Add your first Docker agent to start managing and auditing.
          </p>
          <Button className="mt-6" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3 flex-wrap">
              <button className="px-3 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground hover:bg-muted/50 flex items-center gap-2">
                Connection
                <ChevronDown className="w-4 h-4" />
              </button>
              <button className="px-3 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground hover:bg-muted/50 flex items-center gap-2">
                Status
                <ChevronDown className="w-4 h-4" />
              </button>
              <button className="px-3 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground hover:bg-muted/50 flex items-center gap-2">
                Agent Version
                <ChevronDown className="w-4 h-4" />
              </button>
              <button className="px-3 py-1.5 text-sm text-miku-primary hover:text-miku-primary/80">
                Clear all
              </button>
              <div className="flex-1 min-w-[300px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Search by name, status, URL..."
                  className="w-full pl-10 pr-4 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-miku-primary/50"
                />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground/70">Sort By</span>
                <button className="px-3 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground hover:bg-muted/50 flex items-center gap-2">
                  Name
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button className="p-1.5 bg-muted/50 border border-border rounded text-muted-foreground hover:bg-muted/50">
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                data={{
                  agent,
                  info: agentInfos[agent.id]?.info ?? null,
                  loading: agentInfos[agent.id]?.loading ?? true,
                }}
                onClick={() => navigate({ to: `/agents/${agent.id}` })}
              />
            ))}
          </div>
        </div>
      )}

      <AddAgentModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
