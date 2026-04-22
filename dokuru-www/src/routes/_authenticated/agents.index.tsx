import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAgentStore, getAgentToken, type AgentInfoEntry } from "@/stores/use-agent-store";
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
import { Plus, RefreshCw, Container, Box, HardDrive, Search, ChevronDown, ArrowUpDown, Edit, Trash2, Cpu, Server, Eye, EyeOff, Cloud, Globe, Link2, Loader2, WifiOff, AlertTriangle } from "lucide-react";
import { AddAgentModal } from "@/components/agents/AddAgentModal";
import { agentDirectApi, type DockerInfo } from "@/lib/api/agent-direct";
import { agentApi } from "@/lib/api/agent";
import { setAgentToken } from "@/stores/use-agent-store";
import type { Agent } from "@/types/agent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsList,
});

type AgentWithInfo = {
  agent: Agent;
  infoEntry: AgentInfoEntry | undefined;
  wsOnline: boolean | undefined;  // undefined = never connected yet
  isConnecting: boolean;          // WS is in connecting state
  connectionError: string | null; // last WS close reason
};

function AgentCard({ data, onClick, onUpdated }: { data: AgentWithInfo; onClick: () => void; onUpdated: (agent: Agent) => void }) {
  const { agent, infoEntry, wsOnline, isConnecting, connectionError } = data;
  const { deleteAgent } = useAgentStore();
  const info = infoEntry?.info ?? null;
  const infoLoading = infoEntry?.loading ?? true;

  // Tri-state connection:
  //   isConnecting = WS is in the process of connecting (blink blue)
  //   isOnline     = WS successfully connected
  //   isOffline    = WS disconnected/failed
  const isOnline = !isConnecting && wsOnline === true;
  const isOffline = !isConnecting && wsOnline === false;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editUrl, setEditUrl] = useState(agent.url);
  const [editToken, setEditToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async () => {
    await deleteAgent(agent.id);
    setShowDeleteDialog(false);
  };

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(agent.name);
    setEditUrl(agent.url);
    setEditToken("");
    setShowEditDialog(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await agentApi.update(agent.id, {
        name: editName,
        url: editUrl,
        token: editToken || undefined,
      });
      if (editToken) {
        setAgentToken(agent.id, editToken);
      }
      onUpdated(updated);
      setShowEditDialog(false);
      toast.success("Agent updated");
    } catch {
      toast.error("Failed to update agent");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex transition-all">
      <div
        className="flex-1 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onClick}
      >
        <div className="p-4 flex items-center gap-6">
          <div className="w-14 flex items-center justify-center shrink-0 relative">
            <img
              src="/docker.svg"
              alt="Docker"
              className={`w-14 h-14 transition-all duration-300 ${isConnecting ? "animate-pulse" : ""}`}
              style={
                isConnecting
                  ? { filter: "brightness(0) saturate(100%) invert(47%) sepia(93%) saturate(2000%) hue-rotate(194deg) brightness(105%) contrast(101%)" }
                  : isOffline
                  ? { filter: "brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)" }
                  : undefined
              }
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base font-bold text-foreground tracking-tight">{agent.name}</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold uppercase ${
                  isConnecting
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : isOnline
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                {isConnecting
                  ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> CONNECTING</>
                  : isOnline
                  ? <>● UP</>
                  : <>○ DOWN</>
                }
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium border-blue-500/30 bg-blue-500/10 text-blue-400">
                {agent.access_mode === 'cloudflare' && <><Cloud className="h-3 w-3" /> Cloudflare</>}
                {agent.access_mode === 'direct' && <><Globe className="h-3 w-3" /> Direct</>}
                {agent.access_mode === 'domain' && <><Globe className="h-3 w-3" /> Domain</>}
                {agent.access_mode === 'relay' && <><Link2 className="h-3 w-3" /> Relay</>}
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

            {isConnecting && !info ? (
              <div className="flex items-center gap-2 mt-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                <span className="text-[12px] text-blue-400/80">Connecting to agent...</span>
              </div>
            ) : infoLoading && !info ? (
              <div className="flex items-center gap-2 mt-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-miku-primary" />
                <span className="text-[12px] text-muted-foreground/70">Fetching Docker info...</span>
              </div>
            ) : info ? (
              // Show last-known stats, dimmed when WS is temporarily offline.
              <div className={`flex items-center mt-3 text-[12px] font-medium flex-wrap divide-x divide-border transition-opacity ${!isOnline ? "opacity-50" : "text-muted-foreground"}`}>
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
            ) : isOffline ? (
              <div className="flex items-center gap-2 mt-3">
                <WifiOff className="h-3.5 w-3.5 text-red-400/70" />
                <span className="text-[12px] text-red-400/70">
                  {connectionError ?? "Unable to connect"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-3">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400/70" />
                <span className="text-[12px] text-amber-400/70">Docker info unavailable</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-[180px] border-l border-border flex flex-col justify-center gap-2 px-4 py-3 bg-muted/30">
        <button
          className={`flex items-center justify-center gap-2 h-9 w-full rounded text-sm font-semibold transition-all ${
            isConnecting
              ? "bg-blue-500/10 border border-blue-500/30 text-blue-400 cursor-wait"
              : isOnline
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 cursor-pointer"
              : "bg-red-500/10 border border-red-500/30 text-red-400 cursor-not-allowed"
          }`}
          onClick={isOnline ? onClick : undefined}
          disabled={!isOnline || isConnecting}
        >
          {isConnecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"
            }`} />
          )}
          {isConnecting ? "Connecting..." : isOnline ? "Connected" : "Disconnected"}
        </button>
      </div>

      <div className="w-12 border-l border-border flex flex-col items-center justify-start py-4 bg-muted/30">
        <button
          className="w-8 h-8 flex items-center justify-center text-muted-foreground/70 hover:text-foreground rounded hover:bg-muted/50 transition-colors group cursor-pointer"
          title="Edit agent"
          onClick={openEdit}
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

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Agent name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="http://host:port"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-token">Token <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
              <div className="relative">
                <Input
                  id="edit-token"
                  type={showToken ? "text" : "password"}
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  placeholder="New token (optional)"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !editName || !editUrl}>
              {isSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  const { agents, isLoading, fetchAgents, updateAgent, agentInfos, setAgentInfo, setAgentInfoLoading, agentOnlineStatus, agentConnectingStatus, agentConnectionError } = useAgentStore();
  const [localAgents, setLocalAgents] = useState<Agent[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    setLocalAgents(agents);
  }, [agents]);

  const handleAgentUpdated = (updated: Agent) => {
    updateAgent(updated);
  };

  // Initial info fetch — runs once when agents load.
  useEffect(() => {
    if (agents.length === 0) return;

    for (const agent of agents) {
      const cached = agentInfos[agent.id];
      if (cached && !cached.loading) continue;

      const token = agent.token ?? getAgentToken(agent.id);
      if (!token) { setAgentInfo(agent.id, null); continue; }

      setAgentInfoLoading(agent.id, true);
      agentDirectApi.getInfo(agent.url, token)
        .then((info) => setAgentInfo(agent.id, info))
        .catch(() => setAgentInfo(agent.id, null));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // Re-fetch Docker info when an agent comes back online.
  // We do NOT clear info on offline — the card keeps showing last-known stats
  // with reduced opacity so the UI doesn't blank out on every WS blip.
  useEffect(() => {
    for (const agent of agents) {
      const isOnline = agentOnlineStatus[agent.id];
      if (isOnline === true) {
        const token = agent.token ?? getAgentToken(agent.id);
        if (!token) continue;
        agentDirectApi.getInfo(agent.url, token)
          .then((info) => setAgentInfo(agent.id, info))
          .catch(() => { /* keep stale info; WS status badge already shows DOWN */ });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentOnlineStatus]);

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
            {localAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                data={{
                  agent,
                  infoEntry: agentInfos[agent.id],
                  wsOnline: agentOnlineStatus[agent.id],
                  isConnecting: !!agentConnectingStatus[agent.id],
                  connectionError: agentConnectionError[agent.id] ?? null,
                }}
                onClick={() => navigate({ to: `/agents/${agent.id}` })}
                onUpdated={handleAgentUpdated}
              />
            ))}
          </div>
        </div>
      )}

      <AddAgentModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
    </div>
  );
}
