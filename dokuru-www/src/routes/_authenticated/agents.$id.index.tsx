import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { agentApi } from "@/lib/api/agent";
import {
    agentDirectApi,
    type AuditReportResponse,
    type AuditResponse,
    type AuditResult,
    type DockerInfo,
} from "@/lib/api/agent-direct";
import { PILLAR_META, getRulePillar, type SecurityPillar } from "@/lib/audit-pillars";
import {
    dockerApi,
    type Container as DockerContainer,
    type Stack,
} from "@/services/docker-api";
import type { Agent } from "@/types/agent";
import { getAgentToken, setAgentToken, useAgentStore } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
    EditAgentModal,
} from "@/components/agents/EditAgentModal";
import {
    normalizeAgentAccessMode,
    type AgentAccessMode,
} from "@/components/agents/AgentConnectionMode";
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    Clock3,
    Container as ContainerIcon,
    Edit,
    GitBranch,
    HardDrive,
    Layers,
    Loader2,
    Network,
    RefreshCw,
    Server,
    ShieldCheck,
    SquareStack,
    Trash2,
    Zap,
    Monitor,
    Microchip,
    MemoryStick,
    Cpu,
    Box,
    Folder,
    Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents/$id/")({
    component: AgentDashboard,
});

const SCORE_COPY = {
    healthy: "Healthy posture",
    warning: "Needs attention",
    critical: "Critical exposure",
} as const;

type DashboardTone = "amber" | "red" | "blue" | "zinc";

function dockerCredentialFor(agent: Agent | null | undefined) {
    if (!agent) return "";
    if (agent.access_mode === "relay") return agent.id;
    return agent.token ?? getAgentToken(agent.id) ?? "";
}

function fmtMemory(bytes: number | null | undefined) {
    if (!bytes) return "-";
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}



function fmtFullDate(value: string | null | undefined) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function relativeTime(value: string | null | undefined) {
    if (!value) return "Never seen";
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return value;
    const seconds = Math.max(1, Math.round((Date.now() - time) / 1000));
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ["year", 31_536_000],
        ["month", 2_592_000],
        ["day", 86_400],
        ["hour", 3_600],
        ["minute", 60],
    ];
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    for (const [unit, unitSeconds] of units) {
        if (seconds >= unitSeconds) {
            return formatter.format(-Math.floor(seconds / unitSeconds), unit);
        }
    }
    return formatter.format(-seconds, "second");
}

function auditSortDesc(a: AuditResponse, b: AuditResponse) {
    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
}

function scoreBand(score: number): keyof typeof SCORE_COPY {
    if (score >= 80) return "healthy";
    if (score >= 60) return "warning";
    return "critical";
}



function severityWeight(result: AuditResult) {
    if (result.rule.severity === "High") return 3;
    if (result.rule.severity === "Medium") return 2;
    if (result.rule.severity === "Low") return 1;
    return 0;
}

function statusClass(state: string) {
    const normalized = state.toLowerCase();
    if (normalized === "running") return "border-primary/25 bg-primary/10 text-primary";
    if (normalized === "exited" || normalized === "stopped") return "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
    if (normalized === "paused") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
    if (normalized === "restarting") return "border-blue-500/20 bg-blue-500/10 text-blue-400";
    return "border-border bg-muted/40 text-muted-foreground";
}

function toneClasses(tone: DashboardTone) {
    const map: Record<DashboardTone, { icon: string; bg: string; border: string; text: string; progress: string }> = {
        amber: { icon: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-500", progress: "[&>div]:bg-amber-500" },
        red: { icon: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-500", progress: "[&>div]:bg-rose-500" },
        blue: { icon: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-500", progress: "[&>div]:bg-blue-500" },
        zinc: { icon: "text-muted-foreground", bg: "bg-muted/10", border: "border-border", text: "text-foreground", progress: "[&>div]:bg-muted-foreground" },
    };
    return map[tone];
}



function AgentDashboard() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { deleteAgent, updateAgent } = useAgentStore();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editToken, setEditToken] = useState("");
    const [editAccessMode, setEditAccessMode] = useState<AgentAccessMode>("direct");
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const agentQuery = useQuery({
        queryKey: ["agent", id],
        queryFn: () => agentApi.getById(id),
    });

    const agent = agentQuery.data ?? null;
    const credential = dockerCredentialFor(agent);

    const dockerInfoQuery = useQuery({
        queryKey: ["agent-dashboard", id, "docker-info", agent?.url, credential],
        queryFn: () => {
            if (!agent || !credential) throw new Error("Agent token not available");
            return agentDirectApi.getInfo(agent.url, credential);
        },
        enabled: !!agent && !!credential,
        retry: false,
        refetchInterval: 20_000,
    });

    const auditsQuery = useQuery({
        queryKey: ["audits", id],
        queryFn: () => agentApi.listAudits(id),
        enabled: !!id,
    });

    const sortedAudits = [...(auditsQuery.data ?? [])].sort(auditSortDesc);
    const latestAudit = sortedAudits[0] ?? null;

    const reportQuery = useQuery({
        queryKey: ["audit-report", id, latestAudit?.id],
        queryFn: () => agentApi.getAuditReport(id, latestAudit!.id!),
        enabled: !!latestAudit?.id,
        retry: false,
    });

    const containersQuery = useQuery({
        queryKey: ["agent-dashboard", id, "containers", credential],
        queryFn: async () => {
            if (!agent || !credential) throw new Error("Agent token not available");
            const response = await dockerApi.listContainers(agent.url, credential, true);
            return response.data;
        },
        enabled: !!agent && !!credential && !!dockerInfoQuery.data,
        retry: false,
        refetchInterval: 15_000,
    });

    const stacksQuery = useQuery({
        queryKey: ["agent-dashboard", id, "stacks", credential],
        queryFn: async () => {
            if (!agent || !credential) throw new Error("Agent token not available");
            const response = await dockerApi.listStacks(agent.url, credential);
            return response.data;
        },
        enabled: !!agent && !!credential && !!dockerInfoQuery.data,
        retry: false,
        refetchInterval: 20_000,
    });

    const dockerInfo = dockerInfoQuery.data ?? null;
    const containers = containersQuery.data ?? [];
    const stacks = stacksQuery.data ?? [];
    const isOnline = !!dockerInfo;
    const isInitialLoading = agentQuery.isLoading || (dockerInfoQuery.isLoading && !dockerInfoQuery.isError);
    const isRefreshing = agentQuery.isFetching || dockerInfoQuery.isFetching || auditsQuery.isFetching || containersQuery.isFetching || stacksQuery.isFetching;

    const openEdit = () => {
        if (!agent) return;
        setEditName(agent.name);
        setEditUrl(agent.url);
        setEditToken("");
        setEditAccessMode(normalizeAgentAccessMode(agent.access_mode));
        setShowToken(false);
        setEditDialogOpen(true);
    };

    const handleEditAccessModeChange = (mode: AgentAccessMode) => {
        setEditAccessMode(mode);
        setEditUrl((current) => (mode !== "relay" && current === "relay" ? "" : current));
    };

    const refreshAll = async () => {
        await Promise.allSettled([
            agentQuery.refetch(),
            dockerInfoQuery.refetch(),
            auditsQuery.refetch(),
            containersQuery.refetch(),
            stacksQuery.refetch(),
            reportQuery.refetch(),
        ]);
    };

    const handleSave = async () => {
        if (!agent) return;
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
            const updated = await agentApi.update(id, {
                name,
                url,
                token: editToken.trim() || undefined,
                access_mode: editAccessMode,
            });
            if (editToken.trim()) setAgentToken(id, editToken.trim());
            updateAgent(updated);
            queryClient.setQueryData(["agent", id], updated);
            setEditDialogOpen(false);
            toast.success("Agent updated");
            await refreshAll();
        } catch {
            toast.error("Failed to update agent");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteAgent(id);
            toast.success("Agent deleted");
            navigate({ to: "/agents" });
        } catch {
            toast.error("Failed to delete agent");
            setIsDeleting(false);
        }
    };

    if (agentQuery.isLoading) {
        return <DashboardSkeleton />;
    }

    if (agentQuery.isError || !agent) {
        return (
            <EmptyState
                icon={Server}
                title="Agent not found"
                description="The selected agent does not exist or you no longer have access to it."
                action={<Button asChild><Link to="/agents">Back to Agents</Link></Button>}
            />
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 pb-10">
            <AgentDialogs
                agent={agent}
                deleteDialogOpen={deleteDialogOpen}
                editDialogOpen={editDialogOpen}
                editName={editName}
                editUrl={editUrl}
                editToken={editToken}
                editAccessMode={editAccessMode}
                showToken={showToken}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onDeleteDialogChange={setDeleteDialogOpen}
                onEditDialogChange={setEditDialogOpen}
                onEditNameChange={setEditName}
                onEditUrlChange={setEditUrl}
                onEditTokenChange={setEditToken}
                onEditAccessModeChange={handleEditAccessModeChange}
                onShowTokenChange={setShowToken}
                onSave={handleSave}
                onDelete={handleDelete}
            />

            <AgentHero
                agent={agent}
                dockerInfo={dockerInfo}
                isOnline={isOnline}
                isRefreshing={isRefreshing}
                onRefresh={() => void refreshAll()}
                onEdit={openEdit}
                onDelete={() => setDeleteDialogOpen(true)}
            />

            {isInitialLoading ? (
                <DashboardContentSkeleton />
            ) : !dockerInfo ? (
                <OfflinePanel agent={agent} hasCredential={!!credential} onRetry={() => void refreshAll()} />
            ) : (
                <DashboardContent
                    id={id}
                    agent={agent}
                    dockerInfo={dockerInfo}
                    latestAudit={latestAudit}
                    auditReport={reportQuery.data ?? null}
                    auditHistoryCount={sortedAudits.length}
                    containers={containers}
                    stacks={stacks}
                    isContainersLoading={containersQuery.isLoading}
                    isStacksLoading={stacksQuery.isLoading}
                />
            )}
        </div>
    );
}

function AgentDialogs({
    agent,
    deleteDialogOpen,
    editDialogOpen,
    editName,
    editUrl,
    editToken,
    editAccessMode,
    showToken,
    isSaving,
    isDeleting,
    onDeleteDialogChange,
    onEditDialogChange,
    onEditNameChange,
    onEditUrlChange,
    onEditTokenChange,
    onEditAccessModeChange,
    onShowTokenChange,
    onSave,
    onDelete,
}: {
    agent: Agent;
    deleteDialogOpen: boolean;
    editDialogOpen: boolean;
    editName: string;
    editUrl: string;
    editToken: string;
    editAccessMode: AgentAccessMode;
    showToken: boolean;
    isSaving: boolean;
    isDeleting: boolean;
    onDeleteDialogChange: (open: boolean) => void;
    onEditDialogChange: (open: boolean) => void;
    onEditNameChange: (value: string) => void;
    onEditUrlChange: (value: string) => void;
    onEditTokenChange: (value: string) => void;
    onEditAccessModeChange: (value: AgentAccessMode) => void;
    onShowTokenChange: (value: boolean) => void;
    onSave: () => void;
    onDelete: () => void;
}) {
    return (
        <>
            <EditAgentModal
                open={editDialogOpen}
                onOpenChange={onEditDialogChange}
                name={editName}
                url={editUrl}
                token={editToken}
                accessMode={editAccessMode}
                showToken={showToken}
                isSaving={isSaving}
                onNameChange={onEditNameChange}
                onUrlChange={onEditUrlChange}
                onTokenChange={onEditTokenChange}
                onAccessModeChange={onEditAccessModeChange}
                onShowTokenChange={onShowTokenChange}
                onSave={onSave}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{agent.name}"? Audit history for this agent will also be removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={onDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Delete Agent
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function AgentHero({
    agent,
    dockerInfo,
    isOnline,
    isRefreshing,
    onRefresh,
    onEdit,
    onDelete,
}: {
    agent: Agent;
    dockerInfo: DockerInfo | null;
    isOnline: boolean;
    isRefreshing: boolean;
    onRefresh: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const statusRing = isOnline ? "border-primary/30 bg-primary/10 text-primary" : "border-muted-foreground/30 bg-muted/10 text-muted-foreground";

    return (
        <section className="rounded-[19px] border border-border bg-card px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 gap-4">
                    <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-border bg-background text-primary">
                        <Server className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="truncate text-2xl font-semibold tracking-tight">{agent.name}</h1>
                            <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusRing)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-primary" : "bg-muted-foreground")} />
                                <span>{isOnline ? "Online" : "Offline"}</span>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                            <span className="min-w-0 max-w-full truncate font-mono text-xs md:max-w-[520px]">{agent.url}</span>
                            <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{agent.access_mode}</span>
                            {dockerInfo?.docker_version && (
                                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />Docker {dockerInfo.docker_version}</span>
                            )}
                            <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Added {fmtFullDate(agent.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
                    <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing} className="h-8 hover:!bg-transparent">
                        <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button size="sm" variant="outline" onClick={onEdit} className="h-8 hover:!bg-transparent">
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={onDelete} className="h-8 border-destructive/35 text-destructive hover:!bg-transparent hover:text-destructive">
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                    </Button>
                </div>
            </div>
        </section>
    );
}

function DashboardContent({
    id,
    agent,
    dockerInfo,
    latestAudit,
    auditReport,
    auditHistoryCount,
    containers,
    stacks,
    isContainersLoading,
    isStacksLoading,
}: {
    id: string;
    agent: Agent;
    dockerInfo: DockerInfo;
    latestAudit: AuditResponse | null;
    auditReport: AuditReportResponse | null;
    auditHistoryCount: number;
    containers: DockerContainer[];
    stacks: Stack[];
    isContainersLoading: boolean;
    isStacksLoading: boolean;
}) {
    const runningContainers = containers.filter((container) => container.state.toLowerCase() === "running");
    const stoppedContainers = containers.filter((container) => container.state.toLowerCase() !== "running");
    const unhealthyContainers = containers.filter((container) => container.status.toLowerCase().includes("unhealthy"));
    const recentContainers = [...containers].sort((a, b) => b.created - a.created).slice(0, 5);
    const topStacks = [...stacks].sort((a, b) => b.total - a.total).slice(0, 4);
    const failedResults = [...(latestAudit?.results ?? [])]
        .filter((result) => result.status === "Fail")
        .sort((a, b) => severityWeight(b) - severityWeight(a) || a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true }));
    const highRiskFailures = failedResults.filter((result) => result.rule.severity === "High").length;
    const autoFixable = auditReport?.report.remediation.auto_fixable ?? failedResults.filter((result) => result.remediation_kind === "auto").length;
    const quickWins = auditReport?.report.remediation.quick_wins ?? autoFixable;

    return (
        <div className="space-y-5">
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                    <SecurityOverview
                        id={id}
                        latestAudit={latestAudit}
                        auditReport={auditReport}
                        auditHistoryCount={auditHistoryCount}
                        highRiskFailures={highRiskFailures}
                        autoFixable={autoFixable}
                        quickWins={quickWins}
                    />

                    <ResourceOverview
                        id={id}
                        dockerInfo={dockerInfo}
                        runningContainers={runningContainers.length}
                        stoppedContainers={stoppedContainers.length}
                        unhealthyContainers={unhealthyContainers.length}
                        stacks={stacks}
                    />
                </div>

                <aside className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-1 2xl:self-start">
                    <ActionPanel id={id} agent={agent} latestAudit={latestAudit} />
                    <HostFacts dockerInfo={dockerInfo} />
                </aside>
            </div>

            <div className="space-y-5">
                {latestAudit && failedResults.length > 0 ? (
                    <FailingRules
                        id={id}
                        failedResults={failedResults}
                        autoFixable={autoFixable}
                        latestAuditId={latestAudit.id}
                    />
                ) : null}

                <WorkloadOverview
                    id={id}
                    dockerInfo={dockerInfo}
                    recentContainers={recentContainers}
                    topStacks={topStacks}
                    isContainersLoading={isContainersLoading}
                    isStacksLoading={isStacksLoading}
                />
            </div>
        </div>
    );
}

function ResourceOverview({
    id,
    dockerInfo,
    runningContainers,
    stoppedContainers,
    unhealthyContainers,
    stacks,
}: {
    id: string;
    dockerInfo: DockerInfo;
    runningContainers: number;
    stoppedContainers: number;
    unhealthyContainers: number;
    stacks: Stack[];
}) {
    const stackRunning = stacks.reduce((sum, stack) => sum + stack.running, 0);
    const stackTotal = stacks.reduce((sum, stack) => sum + stack.total, 0);
    const containerPct = dockerInfo.containers.total > 0 ? Math.round((runningContainers / dockerInfo.containers.total) * 100) : 0;
    const stackPct = stackTotal > 0 ? Math.round((stackRunning / stackTotal) * 100) : 0;

    return (
        <SectionCard
            title="Docker Inventory"
            description="Containers, images, networks, and storage reported by this agent."
            action={<Button size="sm" variant="outline" asChild><Link to="/agents/$id/containers" params={{ id }}>Open Inventory</Link></Button>}
        >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    icon={ContainerIcon}
                    label="Containers"
                    value={dockerInfo.containers.total}
                    detail={`${runningContainers} running · ${stoppedContainers} stopped`}
                    tone={unhealthyContainers > 0 ? "red" : "blue"}
                    progress={containerPct}
                    to="/agents/$id/containers"
                    id={id}
                />
                <MetricCard
                    icon={SquareStack}
                    label="Stacks"
                    value={dockerInfo.stacks}
                    detail={stackTotal > 0 ? `${stackRunning}/${stackTotal} stack containers running` : "No compose stacks detected"}
                    tone="blue"
                    progress={stackTotal > 0 ? stackPct : 0}
                    to="/agents/$id/stacks"
                    id={id}
                />
                <MetricCard
                    icon={Layers}
                    label="Images"
                    value={dockerInfo.images}
                    detail="Local image cache"
                    tone="blue"
                    to="/agents/$id/images"
                    id={id}
                />
                <MetricCard
                    icon={HardDrive}
                    label="Volumes"
                    value={dockerInfo.volumes}
                    detail="Persistent Docker storage"
                    tone="blue"
                    to="/agents/$id/volumes"
                    id={id}
                />
                <MetricCard
                    icon={Network}
                    label="Networks"
                    value={dockerInfo.networks}
                    detail="Docker network surfaces"
                    tone="blue"
                    to="/agents/$id/networks"
                    id={id}
                />
            </div>
        </SectionCard>
    );
}

function MetricCard({
    icon: Icon,
    label,
    value,
    detail,
    tone,
    progress,
    to,
    id,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    detail: string;
    tone: DashboardTone;
    progress?: number;
    to: "/agents/$id/containers" | "/agents/$id/stacks" | "/agents/$id/images" | "/agents/$id/networks" | "/agents/$id/volumes";
    id: string;
}) {
    const toneClass = toneClasses(tone);
    return (
        <Link
            to={to}
            params={{ id }}
            className="group flex flex-col justify-between rounded-lg border bg-background p-3 transition-colors hover:border-primary/50"
        >
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{label}</span>
                <Icon className={cn("h-4 w-4", toneClass.text)} />
            </div>
            <div className="mt-2">
                <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
                <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
            </div>
            {typeof progress === "number" ? (
                <Progress value={progress} className={cn("mt-4 h-1.5", toneClass.progress)} />
            ) : null}
        </Link>
    );
}

function SecurityOverview({
    id,
    latestAudit,
    auditReport,
    auditHistoryCount,
    highRiskFailures,
    autoFixable,
    quickWins,
}: {
    id: string;
    latestAudit: AuditResponse | null;
    auditReport: AuditReportResponse | null;
    auditHistoryCount: number;
    highRiskFailures: number;
    autoFixable: number;
    quickWins: number;
}) {
    if (!latestAudit) {
        return (
            <SectionCard title="Security Posture" description="No CIS benchmark has been captured for this agent yet.">
                <div className="flex items-center justify-between rounded-lg border border-dashed bg-muted/10 p-6">
                    <div>
                        <h3 className="text-base font-semibold">Start with a baseline audit</h3>
                        <p className="text-sm text-muted-foreground">Run the CIS Docker Benchmark once to unlock score history, failing rules, and remediation priorities.</p>
                    </div>
                    <Button asChild>
                        <Link to="/agents/$id/audit" params={{ id }}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Run Audit
                        </Link>
                    </Button>
                </div>
            </SectionCard>
        );
    }

    const band = scoreBand(latestAudit.summary.score);
    const passRate = latestAudit.summary.total > 0 ? Math.round((latestAudit.summary.passed / latestAudit.summary.total) * 100) : 0;
    const report = auditReport?.report;
    const pillars = report?.pillars ?? [];

    return (
        <SectionCard
            title="Security Overview"
            description="Latest CIS Docker Benchmark result and remediation priority."
            action={<Button size="sm" asChild><Link to="/agents/$id/audit" params={{ id }}>Run Audit</Link></Button>}
        >
            <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className={cn(
                    "flex min-h-[285px] flex-col justify-between rounded-[22px] border bg-background/55 p-5 shadow-sm dark:bg-white/[0.025]",
                    SCORE_COPY[band] === "Healthy posture" ? "border-primary/30" :
                    SCORE_COPY[band] === "Needs attention" ? "border-amber-500/35" : "border-rose-500/35"
                )}>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">CIS Benchmark</span>
                        <Badge variant="outline" className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                            SCORE_COPY[band] === "Healthy posture" ? "text-primary border-primary/25 bg-primary/5" :
                            SCORE_COPY[band] === "Needs attention" ? "text-amber-500 border-amber-500/20 bg-amber-500/5" : "text-rose-500 border-rose-500/20 bg-rose-500/5"
                        )}>
                            {SCORE_COPY[band]}
                        </Badge>
                    </div>
                    <div className="mt-6 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tabular-nums tracking-tight">{latestAudit.summary.score}</span>
                        <span className="text-lg font-medium text-muted-foreground">/100</span>
                    </div>
                    <Progress value={latestAudit.summary.score} className={cn(
                        "mt-5 h-1.5 bg-muted/50",
                        SCORE_COPY[band] === "Healthy posture" ? "[&>div]:bg-primary" :
                        SCORE_COPY[band] === "Needs attention" ? "[&>div]:bg-amber-500" : "[&>div]:bg-rose-500"
                    )} />
                    <div className="mt-5 grid grid-cols-3 divide-x divide-border border-t border-border pt-4 text-center">
                        <div className="flex flex-col gap-1 pr-3">
                            <span className="text-xl font-semibold text-primary">{latestAudit.summary.passed}</span>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Passed</p>
                        </div>
                        <div className="flex flex-col gap-1 px-3">
                            <span className="text-xl font-semibold text-rose-500">{latestAudit.summary.failed}</span>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Failed</p>
                        </div>
                        <div className="flex flex-col gap-1 pl-3">
                            <span className="text-xl font-semibold">{latestAudit.summary.total}</span>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total</p>
                        </div>
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <SignalCard icon={AlertTriangle} label="High risk" value={highRiskFailures} detail="failed" tone={highRiskFailures > 0 ? "red" : "zinc"} />
                        <SignalCard icon={Zap} label="Auto-fix" value={autoFixable} detail="available" tone={autoFixable > 0 ? "blue" : "zinc"} />
                        <SignalCard icon={ShieldCheck} label="Quick wins" value={quickWins} detail="actions" tone={quickWins > 0 ? "blue" : "zinc"} />
                        <SignalCard icon={Clock3} label="History" value={auditHistoryCount} detail="reports" tone="zinc" />
                    </div>

                    <div className="rounded-[22px] border bg-background/55 p-4 shadow-sm dark:bg-white/[0.025]">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold tracking-tight">Security pillars</h3>
                            <Badge variant="outline" className="rounded-full border-border/70 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground">
                                {passRate}% avg
                            </Badge>
                        </div>
                        {pillars.length > 0 ? (
                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                {pillars.map((pillar) => (
                                    <PillarRow key={pillar.key} pillar={pillar} />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}

function SignalCard({
    icon: Icon,
    label,
    value,
    detail,
    tone,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    detail: string;
    tone: DashboardTone;
}) {
    const toneClass = toneClasses(tone);
    const isNeutral = tone === "zinc";

    return (
        <div className="group rounded-[18px] border bg-background/55 p-4 shadow-sm transition-colors hover:border-primary/25 dark:bg-white/[0.025]">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
                <Icon className={cn("h-4 w-4", isNeutral ? "text-muted-foreground" : toneClass.text)} />
            </div>
            <div className="mt-5 flex items-baseline gap-2">
                <span className={cn("text-3xl font-semibold leading-none tracking-tight tabular-nums", isNeutral ? "text-foreground" : toneClass.text)}>{value}</span>
                <span className="text-sm font-medium text-muted-foreground">{detail}</span>
            </div>
        </div>
    );
}

function PillarRow({ pillar }: { pillar: AuditReportResponse["report"]["pillars"][number] }) {
    const key = pillar.key as SecurityPillar;
    const meta = PILLAR_META[key];
    const Icon = meta?.icon ?? ShieldCheck;
    const percent = pillar.percent ?? 0;
    const percentClass = percent >= 80 ? "text-primary" : percent >= 60 ? "text-amber-500" : "text-rose-500";
    const progressClass = percent >= 80 ? "[&>div]:bg-primary" : percent >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-rose-500";

    return (
        <div className="rounded-[16px] border bg-card/70 p-3.5 transition-colors hover:border-primary/25 hover:bg-muted/20">
            <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/70 bg-background text-primary">
                        <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{meta?.name ?? pillar.label}</p>
                        <p className="text-[11px] text-muted-foreground">{pillar.passed}/{pillar.total} checks passed</p>
                    </div>
                </div>
                <span className={cn("font-mono text-sm font-semibold", percentClass)}>
                    {percent}%
                </span>
            </div>
            <Progress value={percent} className={cn(
                "mt-3 h-1 bg-muted/45",
                progressClass
            )} />
        </div>
    );
}

function WorkloadOverview({
    id,
    dockerInfo,
    recentContainers,
    topStacks,
    isContainersLoading,
    isStacksLoading,
}: {
    id: string;
    dockerInfo: DockerInfo;
    recentContainers: DockerContainer[];
    topStacks: Stack[];
    isContainersLoading: boolean;
    isStacksLoading: boolean;
}) {
    return (
        <SectionCard title="Workload Snapshot" description="Recent containers and biggest compose stacks on this Docker host.">
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-xl border bg-card">
                    <ListHeader icon={ContainerIcon} title="Recent Containers" action={<Link to="/agents/$id/containers" params={{ id }} className="text-xs font-medium text-primary hover:underline">View all</Link>} />
                    <div className="divide-y divide-border/40">
                        {isContainersLoading ? (
                            <LoadingRows count={4} />
                        ) : recentContainers.length > 0 ? (
                            recentContainers.map((container) => (
                                <Link
                                    key={container.id}
                                    to="/agents/$id/containers/$containerId"
                                    params={{ id, containerId: container.id }}
                                    className="group flex flex-col gap-2 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
                                >
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="flex size-8 items-center justify-center rounded-md border border-border/50 bg-muted/30 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors">
                                            <ContainerIcon className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0 sm:hidden">
                                            <p className="truncate text-sm font-semibold">{container.names[0]?.replace("/", "") || container.id.slice(0, 12)}</p>
                                        </div>
                                    </div>
                                    <div className="hidden min-w-0 flex-1 sm:block">
                                        <p className="truncate text-sm font-semibold transition-colors group-hover:text-primary">{container.names[0]?.replace("/", "") || container.id.slice(0, 12)}</p>
                                        <p className="truncate font-mono text-[10px] text-muted-foreground">{container.image}</p>
                                    </div>
                                    <Badge variant="outline" className={cn("inline-flex w-fit text-[10px] sm:ml-auto", statusClass(container.state))}>{container.state}</Badge>
                                </Link>
                            ))
                        ) : (
                            <SmallEmpty label="No containers returned by the agent." />
                        )}
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border bg-card">
                    <ListHeader icon={SquareStack} title="Compose Stacks" action={<Link to="/agents/$id/stacks" params={{ id }} className="text-xs font-medium text-primary hover:underline">View stacks</Link>} />
                    <div className="divide-y divide-border/40">
                        {isStacksLoading ? (
                            <LoadingRows count={4} />
                        ) : topStacks.length > 0 ? (
                            topStacks.map((stack) => {
                                const pct = stack.total > 0 ? Math.round((stack.running / stack.total) * 100) : 0;
                                return (
                                    <Link
                                        key={stack.name}
                                        to="/agents/$id/stacks"
                                        params={{ id }}
                                        className="group block p-3 transition-colors hover:bg-muted/30"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold transition-colors group-hover:text-primary">{stack.name}</p>
                                                <p className="text-[11px] text-muted-foreground">{stack.running}/{stack.total} containers running</p>
                                            </div>
                                            <Badge variant="outline" className="font-mono text-[10px] border-border/50 bg-muted/10">{pct}%</Badge>
                                        </div>
                                        <Progress value={pct} className={cn("mt-3 h-1 bg-muted/30", pct === 100 ? "[&>div]:bg-primary" : pct > 0 ? "[&>div]:bg-amber-500" : "[&>div]:bg-zinc-500")} />
                                    </Link>
                                );
                            })
                        ) : (
                            <SmallEmpty label={dockerInfo.stacks > 0 ? "Stack details are not available yet." : "No compose stacks detected."} />
                        )}
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}

function ActionPanel({ id, agent, latestAudit }: { id: string; agent: Agent; latestAudit: AuditResponse | null }) {
    return (
        <SectionCard title="Control Dock" description="Fast actions for this host.">
            <div className="grid gap-2">
                <Button className="w-full justify-between shadow-sm" asChild>
                    <Link to="/agents/$id/audit" params={{ id }}>
                        <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Run CIS Audit</span>
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                </Button>
                
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                    <Button variant="outline" className="w-full justify-between hover:bg-muted/50" asChild>
                        <Link to="/agents/$id/containers" params={{ id }}>
                            <span className="inline-flex items-center gap-2"><ContainerIcon className="h-4 w-4 text-muted-foreground" />Manage Containers</span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-between hover:bg-muted/50" asChild>
                        <Link to="/agents/$id/audits" params={{ id }}>
                            <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" />Audit Reports</span>
                            <Badge variant="outline" className="font-mono text-[10px] bg-muted/10">{latestAudit ? latestAudit.summary.score : "-"}</Badge>
                        </Link>
                    </Button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-2">
                    <Button variant="outline" className="flex h-auto w-full flex-col items-center gap-2 py-3 hover:bg-muted/50 group" asChild>
                        <Link to="/agents/$id/images" params={{ id }}>
                            <Layers className="h-5 w-5 text-muted-foreground transition-transform group-hover:scale-110" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Images</span>
                        </Link>
                    </Button>
                    <Button variant="outline" className="flex h-auto w-full flex-col items-center gap-2 py-3 hover:bg-muted/50 group" asChild>
                        <Link to="/agents/$id/volumes" params={{ id }}>
                            <HardDrive className="h-5 w-5 text-muted-foreground transition-transform group-hover:scale-110" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Volumes</span>
                        </Link>
                    </Button>
                    <Button variant="outline" className="flex h-auto w-full flex-col items-center gap-2 py-3 hover:bg-muted/50 group" asChild>
                        <Link to="/agents/$id/networks" params={{ id }}>
                            <Network className="h-5 w-5 text-muted-foreground transition-transform group-hover:scale-110" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Networks</span>
                        </Link>
                    </Button>
                    <Button variant="outline" className="flex h-auto w-full flex-col items-center gap-2 py-3 hover:bg-muted/50 group" asChild>
                        <Link to="/agents/$id/shell" params={{ id }}>
                            <Terminal className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">VPS Shell</span>
                        </Link>
                    </Button>
                </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-muted/20 p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Connection Status</span>
                <div className="flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Mode</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{agent.access_mode}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{agent.status}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Last Seen</span>
                        <span className="font-mono text-xs font-semibold">{relativeTime(agent.last_seen)}</span>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}

function FailingRules({
    id,
    failedResults,
    autoFixable,
    latestAuditId,
}: {
    id: string;
    failedResults: AuditResult[];
    autoFixable: number;
    latestAuditId?: string;
}) {
    const visibleResults = failedResults.slice(0, 10);
    const highCount = failedResults.filter((result) => result.rule.severity === "High").length;
    const mediumCount = failedResults.filter((result) => result.rule.severity === "Medium").length;
    const lowCount = failedResults.filter((result) => result.rule.severity === "Low").length;

    return (
        <SectionCard
            title="Risk Queue"
            description={`Top ${visibleResults.length} failing CIS rules, ranked by severity.`}
            action={
                <Badge variant="outline" className="px-2 py-1">
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    {autoFixable} auto-fixable
                </Badge>
            }
        >
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-500">{highCount} High Risks</Badge>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">{mediumCount} Medium Risks</Badge>
                <Badge variant="outline" className="text-muted-foreground border-border/50">{lowCount} Low Risks</Badge>
            </div>

            <div className="grid gap-2">
                {visibleResults.map((result) => (
                    <FailingRuleRow
                        key={result.rule.id}
                        id={id}
                        latestAuditId={latestAuditId}
                        result={result}
                    />
                ))}
            </div>

            {failedResults.length > visibleResults.length ? (
                <div className="mt-3 text-center">
                    {latestAuditId ? (
                        <Link
                            to="/agents/$id/audits/$auditId"
                            params={{ id, auditId: latestAuditId }}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            View all {failedResults.length} failing rules →
                        </Link>
                    ) : (
                        <Link
                            to="/agents/$id/audits"
                            params={{ id }}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            View all reports →
                        </Link>
                    )}
                </div>
            ) : null}
        </SectionCard>
    );
}

function FailingRuleRow({
    id,
    latestAuditId,
    result,
}: {
    id: string;
    latestAuditId?: string;
    result: AuditResult;
}) {
    const pillar = getRulePillar(result.rule.id);
    const pillarMeta = PILLAR_META[pillar];
    const PillarIcon = pillarMeta.icon;
    const severityClass = result.rule.severity === "High"
        ? "border-rose-500/50 bg-rose-500/5"
        : result.rule.severity === "Medium"
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-muted/50 bg-muted/5";
            
    const textSeverityClass = result.rule.severity === "High"
        ? "text-rose-500"
        : result.rule.severity === "Medium"
            ? "text-amber-500"
            : "text-muted-foreground";

    const remediationLabel = result.remediation_kind === "auto" ? "Auto-fix" : result.remediation_kind;
    const rowClassName = "group relative block overflow-hidden rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:bg-muted/30";
    const content = (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className={cn("absolute inset-y-0 left-0 w-1", severityClass.replace("bg-", "").replace("border-", "bg-").split(" ")[0])} />
            <div className="ml-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold">{result.rule.id}</span>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-semibold border-none rounded-sm", severityClass, textSeverityClass)}>{result.rule.severity}</Badge>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground capitalize border-border/50 bg-muted/10">{remediationLabel}</Badge>
                </div>
                <h3 className="mt-1 pb-1 text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                    {result.rule.title}
                </h3>
            </div>
            
            <div className="flex shrink-0 flex-wrap items-center gap-4 text-[11px] md:flex-col md:items-end md:gap-1.5">
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <PillarIcon className="h-3.5 w-3.5" />
                    <span>{pillarMeta.name}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono font-medium text-muted-foreground">
                    <AlertTriangle className={cn("h-3.5 w-3.5", result.affected.length > 0 ? "text-amber-500" : "opacity-30")} />
                    {result.affected.length > 0 ? `${result.affected.length} affected` : "No entity"}
                </div>
            </div>
        </div>
    );

    return latestAuditId ? (
        <Link
            to="/agents/$id/audits/$auditId"
            params={{ id, auditId: latestAuditId }}
            search={{ ruleId: result.rule.id }}
            className={rowClassName}
            aria-label={`Open rule ${result.rule.id}`}
        >
            {content}
        </Link>
    ) : (
        <Link
            to="/agents/$id/audits"
            params={{ id }}
            className={rowClassName}
            aria-label="Open audit reports"
        >
            {content}
        </Link>
    );
}

function HostFacts({ dockerInfo }: { dockerInfo: DockerInfo }) {
    const infoRows = [
        { label: "OS", value: dockerInfo.os ?? "-", icon: Monitor },
        { label: "Kernel", value: dockerInfo.kernel_version ?? "-", icon: GitBranch },
        { label: "Arch", value: dockerInfo.architecture ?? "-", icon: Microchip },
        { label: "CPU", value: `${dockerInfo.cpu_count} cores`, icon: Cpu },
        { label: "RAM", value: fmtMemory(dockerInfo.memory_total), icon: MemoryStick },
        { label: "Docker", value: `v${dockerInfo.docker_version.replace(/^v/, "")}`, icon: Box },
        { label: "API", value: dockerInfo.api_version ?? "-", icon: Network },
        { label: "Storage", value: dockerInfo.storage_driver ?? "-", icon: HardDrive },
        { label: "Root Dir", value: dockerInfo.docker_root_dir ?? "-", icon: Folder },
    ];

    return (
        <SectionCard title="Host Facts">
            <div className="grid grid-cols-2 gap-y-3 lg:grid-cols-1">
                {infoRows.map((row) => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between text-sm transition-colors hover:bg-muted/30 p-2 -mx-2 rounded-lg">
                            <span className="text-muted-foreground flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                {row.label}
                            </span>
                            <span className="font-mono text-xs font-medium">{row.value}</span>
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}

function SectionCard({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="relative overflow-hidden rounded-2xl border bg-card p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-bold tracking-tight">{title}</h2>
                    {description ? <p className="text-sm font-medium text-muted-foreground">{description}</p> : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            {children}
        </section>
    );
}

function ListHeader({ icon: Icon, title, action }: { icon: React.ComponentType<{ className?: string }>; title: string; action?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{title}</p>
            </div>
            {action}
        </div>
    );
}

function LoadingRows({ count }: { count: number }) {
    return (
        <div className="space-y-0">
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3">
                    <div className="size-9 animate-pulse rounded-xl bg-muted" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function SmallEmpty({ label }: { label: string }) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{label}</div>;
}

function OfflinePanel({ agent, hasCredential, onRetry }: { agent: Agent; hasCredential: boolean; onRetry: () => void }) {
    return (
        <div className="rounded-3xl border border-dashed bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-muted/30 text-muted-foreground">
                <Server className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-xl font-bold">Agent unreachable</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                {hasCredential
                    ? `Dokuru could not reach ${agent.name}. Confirm the agent service is running and the URL is reachable from this browser.`
                    : "This direct-mode agent needs a local token before Dokuru can query Docker data."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button onClick={onRetry}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry Connection
                </Button>
                <Button variant="outline" asChild>
                    <Link to="/agents">Back to Agents</Link>
                </Button>
            </div>
        </div>
    );
}

function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="mx-auto max-w-xl rounded-3xl border bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-muted/30 text-muted-foreground">
                <Icon className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            {action ? <div className="mt-6">{action}</div> : null}
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="mx-auto w-full max-w-[1680px] space-y-5">
            <div className="h-40 animate-pulse rounded-3xl border bg-card" />
            <DashboardContentSkeleton />
        </div>
    );
}

function DashboardContentSkeleton() {
    return (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
                <div className="h-56 animate-pulse rounded-3xl border bg-card" />
                <div className="h-80 animate-pulse rounded-3xl border bg-card" />
                <div className="h-72 animate-pulse rounded-3xl border bg-card" />
            </div>
            <div className="space-y-5">
                <div className="h-56 animate-pulse rounded-3xl border bg-card" />
                <div className="h-80 animate-pulse rounded-3xl border bg-card" />
            </div>
        </div>
    );
}
