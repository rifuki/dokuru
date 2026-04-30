import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
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
import { Plus, RefreshCw, Container, Box, HardDrive, Search, ChevronDown, Edit, Trash2, Cpu, Server, Cloud, Globe, Link2, Loader2, WifiOff, AlertTriangle, ArrowUp, ArrowDown, ArrowUpRight, X, Check, Copy } from "lucide-react";
import { AddAgentModal } from "@/components/agents/AddAgentModal";
import { EditAgentModal } from "@/components/agents/EditAgentModal";
import {
  normalizeAgentAccessMode,
  type AgentAccessMode,
} from "@/components/agents/AgentConnectionMode";
import { AgentSetupDialog, AGENT_INSTALL_COMMAND } from "@/components/agents/AgentSetupGuide";
import { agentDirectApi } from "@/lib/api/agent-direct";
import { agentApi } from "@/lib/api/agent";
import { dockerCredential } from "@/services/docker-api";
import { setAgentToken } from "@/stores/use-agent-store";
import type { Agent } from "@/types/agent";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type ConnectionFilter = "all" | "cloudflare" | "direct" | "domain" | "relay";
type StatusFilter     = "all" | "online" | "connecting" | "offline";
type SortField        = "name" | "status" | "connection";
type SortDir          = "asc" | "desc";

export const Route = createFileRoute("/_authenticated/agents/")({
  component: AgentsPage,
});

function AgentsPage() {
  const navigate = useNavigate();
  const user = useAuthUser();

  useEffect(() => {
    if (user?.role === "admin") {
      void navigate({ to: "/admin", replace: true });
    }
  }, [user?.role, navigate]);

  if (user?.role === "admin") return null;

  return <AgentsList />;
}

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
  const isStatusPending = !isConnecting && wsOnline === undefined;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editUrl, setEditUrl] = useState(agent.url);
  const [editToken, setEditToken] = useState("");
  const [editAccessMode, setEditAccessMode] = useState<AgentAccessMode>(normalizeAgentAccessMode(agent.access_mode));
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
    setEditAccessMode(normalizeAgentAccessMode(agent.access_mode));
    setShowToken(false);
    setShowEditDialog(true);
  };

  const handleEditAccessModeChange = (mode: AgentAccessMode) => {
    setEditAccessMode(mode);
    setEditUrl((current) => (mode !== "relay" && current === "relay" ? "" : current));
  };

  const handleSave = async () => {
    const name = editName.trim();
    const url = editAccessMode === "relay" ? "relay" : editUrl.trim();

    if (!name) {
      toast.error("Agent name is required");
      return;
    }

    if (editAccessMode !== "relay" && !url) {
      toast.error("Agent URL is required");
      return;
    }

    if (editAccessMode === "cloudflare" && !url.startsWith("https://")) {
      toast.error("Cloudflare Tunnel URL must use HTTPS");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await agentApi.update(agent.id, {
        name,
        url,
        token: editToken.trim() || undefined,
        access_mode: editAccessMode,
      });
      const newToken = editToken.trim();
      if (newToken) {
        setAgentToken(agent.id, newToken);
      }
      // Carry the new token (or existing one) into the store object so
      // useAgentConnections can detect the change and reconnect immediately.
      const agentWithToken = newToken
        ? { ...updated, token: newToken }
        : { ...updated, token: agent.token ?? getAgentToken(agent.id) ?? undefined };
      onUpdated(agentWithToken);
      setShowEditDialog(false);
      toast.success("Agent updated");
    } catch {
      toast.error("Failed to update agent");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="group rounded-[14px] border border-border bg-card p-4 shadow-sm transition-colors">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex w-14 items-center justify-center shrink-0 relative">
            <img
              src="/docker.svg"
              alt="Docker"
              className={`w-14 h-14 transition-all duration-300 ${isConnecting ? "animate-pulse" : ""}`}
              style={
                isConnecting
                  ? { filter: "brightness(0) saturate(100%) invert(47%) sepia(93%) saturate(2000%) hue-rotate(194deg) brightness(105%) contrast(101%)" }
                  : isOffline
                  ? { filter: "brightness(0) saturate(100%) invert(47%) sepia(22%) saturate(1388%) hue-rotate(312deg) brightness(94%) contrast(88%)" }
                  : undefined
              }
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base font-semibold text-foreground tracking-tight">{agent.name}</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold uppercase ${
                  isConnecting
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : isOnline
                    ? "border-primary/35 bg-primary/10 text-primary"
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
              <span className="min-w-0 max-w-full truncate text-[12px] text-muted-foreground/70 font-mono lg:max-w-[520px]">
                {agent.url.replace(/^https?:\/\//, '')}
              </span>
            </div>

            {isConnecting && !info ? (
              <div className="flex items-center gap-2 mt-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                <span className="text-[12px] text-blue-400/80">Connecting to agent...</span>
              </div>
            ) : (infoLoading || isOnline || isStatusPending) && !info && !isOffline ? (
              <div className="flex items-center gap-2 mt-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-miku-primary" />
                <span className="text-[12px] text-muted-foreground/70">
                  {isOnline ? "Loading Docker info..." : "Checking agent status..."}
                </span>
              </div>
            ) : info && isOnline ? (
              // Only show stats when agent is online
              <div className="flex items-center mt-3 text-[12px] font-medium flex-wrap divide-x divide-border text-muted-foreground">
                <div className="flex items-center gap-1.5 pr-3">
                  <Container className="w-3.5 h-3.5" />
                  <span>{info.containers.total} containers</span>
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary rounded px-1.5 py-0.5 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
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
              <div className="mt-3 inline-flex w-fit items-center gap-2 rounded-[6px] border border-amber-600/25 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Docker info unavailable</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start lg:self-center" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant={isOnline && !isConnecting ? "default" : "outline"}
            className="h-9 rounded-[10px] px-3.5 text-sm font-semibold shadow-none"
            onClick={onClick}
          >
            {isConnecting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="mr-2 h-3.5 w-3.5" />
            )}
            Dashboard
          </Button>

          <div className="flex items-center rounded-[10px] border bg-background/60 p-1 shadow-sm dark:bg-white/[0.025]">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              title="Edit agent"
              aria-label={`Edit ${agent.name}`}
              onClick={openEdit}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-[7px] text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete agent"
              aria-label={`Delete ${agent.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <EditAgentModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        name={editName}
        url={editUrl}
        token={editToken}
        accessMode={editAccessMode}
        showToken={showToken}
        isSaving={isSaving}
        onNameChange={setEditName}
        onUrlChange={setEditUrl}
        onTokenChange={setEditToken}
        onAccessModeChange={handleEditAccessModeChange}
        onShowTokenChange={setShowToken}
        onSave={handleSave}
      />

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
            <AlertDialogAction onClick={handleDelete} variant="destructive">
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [installCommandCopied, setInstallCommandCopied] = useState(false);

  // Filter & sort state
  const [search, setSearch]               = useState("");
  const [connFilter, setConnFilter]       = useState<ConnectionFilter>("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [versionFilter, setVersionFilter] = useState<string>("all");
  const [sortField, setSortField]         = useState<SortField>("name");
  const [sortDir, setSortDir]             = useState<SortDir>("asc");

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleAgentUpdated = (updated: Agent) => { updateAgent(updated); };

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_INSTALL_COMMAND);
      setInstallCommandCopied(true);
      toast.success("Install command copied");
      window.setTimeout(() => setInstallCommandCopied(false), 1800);
    } catch {
      toast.error("Failed to copy install command");
    }
  };

  // Initial Docker info fetch — runs once when agents load.
  useEffect(() => {
    if (agents.length === 0) return;
    for (const agent of agents) {
      const cached = agentInfos[agent.id];
      if (cached && !cached.loading) continue;
      const token = agent.access_mode === "relay" ? dockerCredential(agent) : agent.token ?? getAgentToken(agent.id);
      if (!token) { setAgentInfo(agent.id, null); continue; }
      setAgentInfoLoading(agent.id, true);
      agentDirectApi.getInfo(agent.url, token)
        .then((info) => setAgentInfo(agent.id, info))
        .catch(() => setAgentInfoLoading(agent.id, false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // Re-fetch Docker info when an agent comes back online.
  useEffect(() => {
    for (const agent of agents) {
      if (agentOnlineStatus[agent.id] === true) {
        const token = agent.access_mode === "relay" ? dockerCredential(agent) : agent.token ?? getAgentToken(agent.id);
        if (!token) continue;
        setAgentInfoLoading(agent.id, true);
        agentDirectApi.getInfo(agent.url, token)
          .then((info) => setAgentInfo(agent.id, info))
          .catch(() => setAgentInfoLoading(agent.id, false));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentOnlineStatus]);

  // Collect available Docker versions for the version filter dropdown.
  const availableVersions = Array.from(
    new Set(
      agents
        .map((a) => agentInfos[a.id]?.info?.docker_version)
        .filter((v): v is string => !!v),
    ),
  ).sort();

  const hasFilters = search !== "" || connFilter !== "all" || statusFilter !== "all" || versionFilter !== "all";

  const clearAll = () => {
    setSearch("");
    setConnFilter("all");
    setStatusFilter("all");
    setVersionFilter("all");
    setPage(1);
  };

  // Reset to page 1 whenever filters change
  const applySearch = (v: string) => { setSearch(v); setPage(1); };
  const applyConn   = (v: ConnectionFilter) => { setConnFilter(v); setPage(1); };
  const applyStatus = (v: StatusFilter) => { setStatusFilter(v); setPage(1); };
  const applyVer    = (v: string) => { setVersionFilter(v); setPage(1); };

  // Build filtered + sorted list.
  const displayAgents = agents
    .filter((agent) => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        const inName = agent.name.toLowerCase().includes(q);
        const inUrl  = agent.url.toLowerCase().includes(q);
        const inMode = agent.access_mode?.toLowerCase().includes(q) ?? false;
        const inVer  = (agentInfos[agent.id]?.info?.docker_version ?? "").toLowerCase().includes(q);
        const isOnl  = agentOnlineStatus[agent.id] === true;
        const inStat = (isOnl ? "up online connected" : "down offline disconnected").includes(q);
        if (!inName && !inUrl && !inMode && !inVer && !inStat) return false;
      }
      // Connection filter
      if (connFilter !== "all" && agent.access_mode !== connFilter) return false;
      // Status filter
      if (statusFilter !== "all") {
        const connecting = !!agentConnectingStatus[agent.id];
        const online     = !connecting && agentOnlineStatus[agent.id] === true;
        const offline    = !connecting && agentOnlineStatus[agent.id] === false;
        if (statusFilter === "online"     && !online)     return false;
        if (statusFilter === "connecting" && !connecting) return false;
        if (statusFilter === "offline"    && !offline)    return false;
      }
      // Version filter
      if (versionFilter !== "all") {
        if ((agentInfos[agent.id]?.info?.docker_version ?? "") !== versionFilter) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === "status") {
        const score = (id: string) =>
          agentConnectingStatus[id] ? 1 : agentOnlineStatus[id] === true ? 0 : 2;
        cmp = score(a.id) - score(b.id);
      } else if (sortField === "connection") {
        cmp = (a.access_mode ?? "").localeCompare(b.access_mode ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const sortLabels: Record<SortField, string> = { name: "Name", status: "Status", connection: "Connection" };

  // Pagination derived values
  const totalPages  = Math.max(1, Math.ceil(displayAgents.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pagedAgents = displayAgents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agents</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {displayAgents.length} of {agents.length} agent{agents.length !== 1 ? "s" : ""}
            {hasFilters && " (filtered)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => fetchAgents()}
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
        <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card/40 shadow-sm">
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background/70">
              <img src="/docker.svg" alt="Docker" className="h-10 w-10 opacity-80" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold tracking-tight">No agents connected</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Add a Docker host to start managing containers, images, networks, and security audits from Dokuru.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setIsAddModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Agent
              </Button>
              <Button variant="outline" onClick={() => setIsSetupGuideOpen(true)}>
                Setup Guide
              </Button>
            </div>
          </div>

          <div className="border-t border-border bg-background/35 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Need to install the agent first?</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Run this on the Docker host, then paste the generated URL and token into Add Agent.
                </p>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs shadow-inner xl:w-[560px]">
                <span className="select-none text-primary">$</span>
                <div className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <code className="block w-max whitespace-nowrap pr-2 text-foreground/90">
                    {AGENT_INSTALL_COMMAND}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void copyInstallCommand()}
                  className="h-7 w-7 shrink-0 text-primary hover:bg-primary/10 hover:text-primary"
                  title="Copy install command"
                >
                  {installCommandCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
          {/* Filter bar */}
          <div className="border-b border-border bg-muted/20 p-4">
            <div className="flex items-center gap-3 flex-wrap">

              {/* Connection filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`px-3 py-1.5 border rounded text-sm flex items-center gap-2 transition-colors ${
                    connFilter !== "all"
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                  }`}>
                    Connection
                    {connFilter !== "all" && <span className="font-semibold">· {connFilter}</span>}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {(["all", "cloudflare", "direct", "domain", "relay"] as ConnectionFilter[]).map((v) => (
                    <DropdownMenuCheckboxItem
                      key={v}
                      checked={connFilter === v}
                      onCheckedChange={() => applyConn(v)}
                    >
                      {v === "all" ? "All connections" : v.charAt(0).toUpperCase() + v.slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Status filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`px-3 py-1.5 border rounded text-sm flex items-center gap-2 transition-colors ${
                    statusFilter !== "all"
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                  }`}>
                    Status
                    {statusFilter !== "all" && <span className="font-semibold">· {statusFilter}</span>}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {(["all", "online", "connecting", "offline"] as StatusFilter[]).map((v) => (
                    <DropdownMenuCheckboxItem
                      key={v}
                      checked={statusFilter === v}
                      onCheckedChange={() => applyStatus(v)}
                    >
                      {v === "all" ? "All statuses" : v.charAt(0).toUpperCase() + v.slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Agent Version filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`px-3 py-1.5 border rounded text-sm flex items-center gap-2 transition-colors ${
                    versionFilter !== "all"
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                  }`}>
                    Agent Version
                    {versionFilter !== "all" && <span className="font-semibold">· {versionFilter}</span>}
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuCheckboxItem
                    checked={versionFilter === "all"}
                    onCheckedChange={() => applyVer("all")}
                  >
                    All versions
                  </DropdownMenuCheckboxItem>
                  {availableVersions.length > 0 && <DropdownMenuSeparator />}
                  {availableVersions.map((v) => (
                    <DropdownMenuCheckboxItem
                      key={v}
                      checked={versionFilter === v}
                      onCheckedChange={() => applyVer(v)}
                    >
                      Docker {v}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {availableVersions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No version data yet</div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear all */}
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-sm text-miku-primary hover:text-miku-primary/80 flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}

              {/* Search */}
              <div className="flex-1 min-w-[260px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => applySearch(e.target.value)}
                  placeholder="Search by name, status, URL..."
                  className="w-full pl-10 pr-8 py-1.5 bg-muted/50 border border-border rounded text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-miku-primary/50"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-muted-foreground/70">Sort By</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="px-3 py-1.5 bg-muted/50 border border-border rounded text-sm text-muted-foreground hover:bg-muted flex items-center gap-2">
                      {sortLabels[sortField]}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuRadioGroup value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                      <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="connection">Connection</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                  className="p-1.5 bg-muted/50 border border-border rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title={sortDir === "asc" ? "Ascending" : "Descending"}
                >
                  {sortDir === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Agent list */}
          <div className="space-y-3 p-4">
            {displayAgents.length === 0 ? (
              <div className="py-12 text-center">
                <Search className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No agents match your filters.</p>
                <button onClick={clearAll} className="mt-2 text-sm text-miku-primary hover:underline flex items-center gap-1 mx-auto">
                  <X className="w-3 h-3" /> Clear filters
                </button>
              </div>
            ) : pagedAgents.map((agent) => (
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, displayAgents.length)} of {displayAgents.length} agents
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1 text-xs rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 py-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                          safePage === p
                            ? "bg-primary text-primary-foreground border-primary font-semibold"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-2.5 py-1 text-xs rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                  className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AddAgentModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onOpenSetupGuide={() => setIsSetupGuideOpen(true)}
      />
      <AgentSetupDialog
        open={isSetupGuideOpen}
        onOpenChange={setIsSetupGuideOpen}
        onStartAddAgent={isAddModalOpen ? undefined : () => {
          setIsSetupGuideOpen(false);
          setIsAddModalOpen(true);
        }}
      />
    </div>
  );
}
