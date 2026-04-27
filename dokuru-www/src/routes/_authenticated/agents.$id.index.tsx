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
import { PILLAR_META, type SecurityPillar } from "@/lib/audit-pillars";
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
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    Bot,
    Boxes,
    CheckCircle2,
    Clock3,
    Container as ContainerIcon,
    Edit,
    Eye,
    EyeOff,
    Gauge,
    GitBranch,
    Layers,
    Loader2,
    Network,
    RefreshCw,
    Route as RouteIcon,
    Server,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    SquareStack,
    Trash2,
    Zap,
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

type DashboardTone = "green" | "amber" | "red" | "blue" | "violet" | "cyan" | "zinc";

function dockerCredentialFor(agent: Agent | null | undefined) {
    if (!agent) return "";
    if (agent.access_mode === "relay") return agent.id;
    return getAgentToken(agent.id) ?? agent.token ?? "";
}

function fmtMemory(bytes: number | null | undefined) {
    if (!bytes) return "-";
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function fmtDate(value: string | null | undefined) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
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

function scoreTone(score: number) {
    if (score >= 80) {
        return {
            text: "text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            progress: "[&>div]:bg-emerald-500",
        };
    }
    if (score >= 60) {
        return {
            text: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            progress: "[&>div]:bg-amber-500",
        };
    }
    return {
        text: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-rose-500/20",
        progress: "[&>div]:bg-rose-500",
    };
}

function severityWeight(result: AuditResult) {
    if (result.rule.severity === "High") return 3;
    if (result.rule.severity === "Medium") return 2;
    if (result.rule.severity === "Low") return 1;
    return 0;
}

function statusClass(state: string) {
    const normalized = state.toLowerCase();
    if (normalized === "running") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
    if (normalized === "exited" || normalized === "stopped") return "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
    if (normalized === "paused") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
    if (normalized === "restarting") return "border-blue-500/20 bg-blue-500/10 text-blue-400";
    return "border-border bg-muted/40 text-muted-foreground";
}

function toneClasses(tone: DashboardTone) {
    const map: Record<DashboardTone, { icon: string; bg: string; border: string; text: string; progress: string }> = {
        green: {
            icon: "text-emerald-400",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            text: "text-emerald-400",
            progress: "[&>div]:bg-emerald-500",
        },
        amber: {
            icon: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            text: "text-amber-400",
            progress: "[&>div]:bg-amber-500",
        },
        red: {
            icon: "text-rose-400",
            bg: "bg-rose-500/10",
            border: "border-rose-500/20",
            text: "text-rose-400",
            progress: "[&>div]:bg-rose-500",
        },
        blue: {
            icon: "text-[#2496ED]",
            bg: "bg-[#2496ED]/10",
            border: "border-[#2496ED]/20",
            text: "text-[#2496ED]",
            progress: "[&>div]:bg-[#2496ED]",
        },
        violet: {
            icon: "text-violet-400",
            bg: "bg-violet-500/10",
            border: "border-violet-500/20",
            text: "text-violet-400",
            progress: "[&>div]:bg-violet-500",
        },
        cyan: {
            icon: "text-cyan-400",
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/20",
            text: "text-cyan-400",
            progress: "[&>div]:bg-cyan-500",
        },
        zinc: {
            icon: "text-muted-foreground",
            bg: "bg-muted/40",
            border: "border-border",
            text: "text-foreground",
            progress: "[&>div]:bg-muted-foreground",
        },
    };
    return map[tone];
}

function iconBoxClass(tone: DashboardTone) {
    const toneClass = toneClasses(tone);
    return cn("flex size-10 items-center justify-center rounded-xl border", toneClass.bg, toneClass.border, toneClass.icon);
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
    const previousAudit = sortedAudits[1] ?? null;

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
        setShowToken(false);
        setEditDialogOpen(true);
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
        setIsSaving(true);
        try {
            const updated = await agentApi.update(id, {
                name: editName.trim(),
                url: editUrl.trim(),
                token: editToken.trim() || undefined,
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
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 pb-10">
            <AgentDialogs
                agent={agent}
                deleteDialogOpen={deleteDialogOpen}
                editDialogOpen={editDialogOpen}
                editName={editName}
                editUrl={editUrl}
                editToken={editToken}
                showToken={showToken}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onDeleteDialogChange={setDeleteDialogOpen}
                onEditDialogChange={setEditDialogOpen}
                onEditNameChange={setEditName}
                onEditUrlChange={setEditUrl}
                onEditTokenChange={setEditToken}
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
                    previousAudit={previousAudit}
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
    showToken,
    isSaving,
    isDeleting,
    onDeleteDialogChange,
    onEditDialogChange,
    onEditNameChange,
    onEditUrlChange,
    onEditTokenChange,
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
    showToken: boolean;
    isSaving: boolean;
    isDeleting: boolean;
    onDeleteDialogChange: (open: boolean) => void;
    onEditDialogChange: (open: boolean) => void;
    onEditNameChange: (value: string) => void;
    onEditUrlChange: (value: string) => void;
    onEditTokenChange: (value: string) => void;
    onShowTokenChange: (value: boolean) => void;
    onSave: () => void;
    onDelete: () => void;
}) {
    return (
        <>
            <Dialog open={editDialogOpen} onOpenChange={onEditDialogChange}>
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
                                onChange={(event) => onEditNameChange(event.target.value)}
                                placeholder="Agent name"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-url">URL</Label>
                            <Input
                                id="edit-url"
                                value={editUrl}
                                onChange={(event) => onEditUrlChange(event.target.value)}
                                placeholder="https://agent.example.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-token">
                                Token <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="edit-token"
                                    type={showToken ? "text" : "password"}
                                    value={editToken}
                                    onChange={(event) => onEditTokenChange(event.target.value)}
                                    placeholder="New token (optional)"
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => onShowTokenChange(!showToken)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onEditDialogChange(false)}>Cancel</Button>
                        <Button onClick={onSave} disabled={isSaving || !editName.trim() || !editUrl.trim()}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
    return (
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(36,150,237,0.18),transparent_32%),linear-gradient(135deg,rgba(36,150,237,0.08),transparent_45%)]" />
                <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-6">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className="relative shrink-0">
                            <div className="flex size-14 items-center justify-center rounded-2xl border border-[#2496ED]/25 bg-[#2496ED]/10 text-[#2496ED] shadow-[0_18px_45px_-24px_rgba(36,150,237,0.9)]">
                                <Bot className="h-7 w-7" />
                            </div>
                            <span className={cn("absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-card", isOnline ? "bg-emerald-500" : "bg-zinc-500")}> 
                                {isOnline ? <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 animate-ping" /> : null}
                            </span>
                        </div>

                        <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{agent.name}</h1>
                                <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1 font-semibold", isOnline ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-zinc-500/25 bg-zinc-500/10 text-zinc-400")}>
                                    <span className="size-1.5 rounded-full bg-current" />
                                    {isOnline ? "Online" : "Offline"}
                                </Badge>
                                {dockerInfo?.docker_version ? (
                                    <Badge variant="outline" className="border-[#2496ED]/25 bg-[#2496ED]/10 text-[#2496ED]">
                                        <Zap className="h-3 w-3" /> Docker {dockerInfo.docker_version}
                                    </Badge>
                                ) : null}
                            </div>

                            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-[minmax(0,1.35fr)_auto_auto] md:items-center">
                                <span className="min-w-0 truncate font-mono text-xs">{agent.url}</span>
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                    <GitBranch className="h-3.5 w-3.5" />
                                    {agent.access_mode}
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Added {fmtFullDate(agent.created_at)}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full border bg-background/60 px-3 py-1">Last seen: {relativeTime(agent.last_seen)}</span>
                                <span className="rounded-full border bg-background/60 px-3 py-1">Host: {dockerInfo?.hostname ?? "unknown"}</span>
                                <span className="rounded-full border bg-background/60 px-3 py-1">OS: {dockerInfo?.os ?? "not connected"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
                            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button variant="outline" onClick={onEdit}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                        </Button>
                        <Button variant="destructive" onClick={onDelete}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </div>
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
    previousAudit,
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
    previousAudit: AuditResponse | null;
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
    const latestScore = latestAudit?.summary.score ?? 0;
    const scoreDelta = latestAudit && previousAudit ? latestAudit.summary.score - previousAudit.summary.score : null;
    const failedResults = [...(latestAudit?.results ?? [])]
        .filter((result) => result.status === "Fail")
        .sort((a, b) => severityWeight(b) - severityWeight(a) || a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true }));
    const highRiskFailures = failedResults.filter((result) => result.rule.severity === "High").length;
    const autoFixable = auditReport?.report.remediation.auto_fixable ?? failedResults.filter((result) => result.remediation_kind === "auto").length;
    const quickWins = auditReport?.report.remediation.quick_wins ?? autoFixable;

    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
                <ResourceOverview
                    id={id}
                    dockerInfo={dockerInfo}
                    runningContainers={runningContainers.length}
                    stoppedContainers={stoppedContainers.length}
                    unhealthyContainers={unhealthyContainers.length}
                    stacks={stacks}
                />

                <SecurityOverview
                    id={id}
                    latestAudit={latestAudit}
                    previousAudit={previousAudit}
                    auditReport={auditReport}
                    auditHistoryCount={auditHistoryCount}
                    scoreDelta={scoreDelta}
                    highRiskFailures={highRiskFailures}
                    autoFixable={autoFixable}
                    quickWins={quickWins}
                />

                <WorkloadOverview
                    id={id}
                    dockerInfo={dockerInfo}
                    recentContainers={recentContainers}
                    topStacks={topStacks}
                    isContainersLoading={isContainersLoading}
                    isStacksLoading={isStacksLoading}
                />
            </div>

            <aside className="space-y-5">
                <ActionPanel id={id} agent={agent} latestAudit={latestAudit} />
                <AttentionPanel
                    id={id}
                    failedResults={failedResults}
                    unhealthyContainers={unhealthyContainers}
                    stoppedContainers={stoppedContainers}
                    latestScore={latestScore}
                />
                <HostFacts dockerInfo={dockerInfo} agent={agent} />
            </aside>
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
            title="Operations Overview"
            description="Live Docker inventory and workload health from this agent."
            action={<Button size="sm" variant="outline" asChild><Link to="/agents/$id/containers" params={{ id }}>Open Inventory</Link></Button>}
        >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={ContainerIcon}
                    label="Containers"
                    value={dockerInfo.containers.total}
                    detail={`${runningContainers} running · ${stoppedContainers} stopped`}
                    tone={unhealthyContainers > 0 ? "amber" : "blue"}
                    progress={containerPct}
                    to="/agents/$id/containers"
                    id={id}
                />
                <MetricCard
                    icon={SquareStack}
                    label="Stacks"
                    value={dockerInfo.stacks}
                    detail={stackTotal > 0 ? `${stackRunning}/${stackTotal} stack containers running` : "No compose stacks detected"}
                    tone={stackPct === 100 || stackTotal === 0 ? "cyan" : "amber"}
                    progress={stackTotal > 0 ? stackPct : 0}
                    to="/agents/$id/stacks"
                    id={id}
                />
                <MetricCard
                    icon={Layers}
                    label="Images"
                    value={dockerInfo.images}
                    detail="Local image cache"
                    tone="violet"
                    to="/agents/$id/images"
                    id={id}
                />
                <MetricCard
                    icon={Network}
                    label="Networks"
                    value={dockerInfo.networks}
                    detail={`${dockerInfo.volumes} volumes attached`}
                    tone="green"
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
    to: "/agents/$id/containers" | "/agents/$id/stacks" | "/agents/$id/images" | "/agents/$id/networks";
    id: string;
}) {
    const toneClass = toneClasses(tone);
    return (
        <Link
            to={to}
            params={{ id }}
            className="group rounded-2xl border bg-background/50 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-lg hover:shadow-black/5"
        >
            <div className="flex items-start justify-between gap-3">
                <div className={iconBoxClass(tone)}>
                    <Icon className="h-5 w-5" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
            </div>
            <div className="mt-4">
                <div className="flex items-end gap-2">
                    <span className={cn("text-3xl font-black tabular-nums leading-none", toneClass.text)}>{value}</span>
                    <span className="pb-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
            {typeof progress === "number" ? (
                <Progress value={progress} className={cn("mt-4 h-1.5 bg-muted/50", toneClass.progress)} />
            ) : null}
        </Link>
    );
}

function SecurityOverview({
    id,
    latestAudit,
    previousAudit,
    auditReport,
    auditHistoryCount,
    scoreDelta,
    highRiskFailures,
    autoFixable,
    quickWins,
}: {
    id: string;
    latestAudit: AuditResponse | null;
    previousAudit: AuditResponse | null;
    auditReport: AuditReportResponse | null;
    auditHistoryCount: number;
    scoreDelta: number | null;
    highRiskFailures: number;
    autoFixable: number;
    quickWins: number;
}) {
    if (!latestAudit) {
        return (
            <SectionCard title="Security Posture" description="No CIS benchmark has been captured for this agent yet.">
                <div className="grid gap-4 rounded-2xl border border-dashed bg-muted/10 p-8 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-[#2496ED]/20 bg-[#2496ED]/10 text-[#2496ED]">
                        <ShieldCheck className="h-7 w-7" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">Start with a baseline audit</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Run the CIS Docker Benchmark once to unlock score history, failing rules, and remediation priorities.
                        </p>
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

    const tone = scoreTone(latestAudit.summary.score);
    const band = scoreBand(latestAudit.summary.score);
    const passRate = latestAudit.summary.total > 0 ? Math.round((latestAudit.summary.passed / latestAudit.summary.total) * 100) : 0;
    const report = auditReport?.report;
    const pillars = report?.pillars ?? [];

    return (
        <SectionCard
            title="Security Posture"
            description="Prioritized CIS benchmark status for the latest audit run."
            action={<Button size="sm" asChild><Link to="/agents/$id/audit" params={{ id }}>Run Audit</Link></Button>}
        >
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className={cn("rounded-2xl border p-5", tone.bg, tone.border)}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Score</p>
                            <div className="mt-4 flex items-end gap-2">
                                <span className={cn("text-6xl font-black tabular-nums leading-none", tone.text)}>{latestAudit.summary.score}</span>
                                <span className="pb-1.5 text-xl font-bold text-muted-foreground/50">/100</span>
                            </div>
                        </div>
                        <Badge variant="outline" className={cn("px-2.5 py-1", tone.bg, tone.border, tone.text)}>
                            {SCORE_COPY[band]}
                        </Badge>
                    </div>
                    <Progress value={latestAudit.summary.score} className={cn("mt-5 h-2 bg-background/60", tone.progress)} />
                    <div className="mt-5 grid grid-cols-3 gap-2">
                        <MiniStat label="Passed" value={latestAudit.summary.passed} tone="green" />
                        <MiniStat label="Failed" value={latestAudit.summary.failed} tone="red" />
                        <MiniStat label="Rules" value={latestAudit.summary.total} tone="zinc" />
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-xl border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                        <span>Latest audit</span>
                        <span className="font-mono">{fmtDate(latestAudit.timestamp)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-xl border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                        <span>Score delta</span>
                        <span className={cn("font-mono font-semibold", scoreDelta === null ? "text-muted-foreground" : scoreDelta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {scoreDelta === null ? "No previous run" : `${scoreDelta > 0 ? "+" : ""}${scoreDelta}`}
                        </span>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                        <SignalCard icon={ShieldX} label="High risk" value={highRiskFailures} detail="high severity failures" tone={highRiskFailures > 0 ? "red" : "green"} />
                        <SignalCard icon={Zap} label="Auto-fix" value={autoFixable} detail="supported fixes" tone={autoFixable > 0 ? "blue" : "zinc"} />
                        <SignalCard icon={Gauge} label="Quick wins" value={quickWins} detail="low effort actions" tone={quickWins > 0 ? "green" : "zinc"} />
                        <SignalCard icon={Clock3} label="History" value={auditHistoryCount} detail="stored reports" tone="violet" />
                    </div>

                    <div className="rounded-2xl border bg-background/50 p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold">Security Pillars</h3>
                                <p className="text-xs text-muted-foreground">Worst areas appear clearly for remediation planning.</p>
                            </div>
                            <Badge variant="outline" className="font-mono">{passRate}% pass</Badge>
                        </div>
                        {pillars.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {pillars.map((pillar) => (
                                    <PillarRow key={pillar.key} pillar={pillar} />
                                ))}
                            </div>
                        ) : (
                            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                                <span className="rounded-xl border bg-muted/20 px-3 py-2">Passed {latestAudit.summary.passed}</span>
                                <span className="rounded-xl border bg-muted/20 px-3 py-2">Failed {latestAudit.summary.failed}</span>
                                <span className="rounded-xl border bg-muted/20 px-3 py-2">Previous {previousAudit?.summary.score ?? "-"}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}

function PillarRow({ pillar }: { pillar: AuditReportResponse["report"]["pillars"][number] }) {
    const key = pillar.key as SecurityPillar;
    const meta = PILLAR_META[key];
    const Icon = meta?.icon ?? ShieldCheck;
    const percent = pillar.percent ?? 0;
    const progressTone = percent >= 80 ? "[&>div]:bg-emerald-500" : percent >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-rose-500";

    return (
        <div className="rounded-xl border bg-card/50 p-3">
            <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
                    <Icon className={cn("h-4 w-4", meta?.color)} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold">{meta?.name ?? pillar.label}</p>
                        <span className="font-mono text-xs text-muted-foreground">{pillar.passed}/{pillar.total}</span>
                    </div>
                    <Progress value={percent} className={cn("mt-2 h-1.5 bg-muted/50", progressTone)} />
                </div>
            </div>
        </div>
    );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: DashboardTone }) {
    const toneClass = toneClasses(tone);
    return (
        <div className="rounded-xl border bg-background/60 px-3 py-2 text-center">
            <p className={cn("text-xl font-black tabular-nums", toneClass.text)}>{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        </div>
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
    return (
        <div className="rounded-2xl border bg-background/50 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className={cn("flex size-9 items-center justify-center rounded-xl border", toneClass.bg, toneClass.border, toneClass.icon)}>
                    <Icon className="h-4 w-4" />
                </div>
                <span className={cn("text-2xl font-black tabular-nums", toneClass.text)}>{value}</span>
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
                <div className="rounded-2xl border bg-background/50">
                    <ListHeader icon={ContainerIcon} title="Recent Containers" action={<Link to="/agents/$id/containers" params={{ id }} className="text-xs font-medium text-primary hover:underline">View all</Link>} />
                    <div className="divide-y">
                        {isContainersLoading ? (
                            <LoadingRows count={4} />
                        ) : recentContainers.length > 0 ? (
                            recentContainers.map((container) => (
                                <Link
                                    key={container.id}
                                    to="/agents/$id/containers/$containerId"
                                    params={{ id, containerId: container.id }}
                                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                                >
                                    <span className="flex size-9 items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground">
                                        <ContainerIcon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold">{container.names[0]?.replace("/", "") || container.id.slice(0, 12)}</p>
                                        <p className="truncate font-mono text-xs text-muted-foreground">{container.image}</p>
                                    </div>
                                    <Badge variant="outline" className={cn("capitalize", statusClass(container.state))}>{container.state}</Badge>
                                </Link>
                            ))
                        ) : (
                            <SmallEmpty label="No containers returned by the agent." />
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border bg-background/50">
                    <ListHeader icon={SquareStack} title="Compose Stacks" action={<Link to="/agents/$id/stacks" params={{ id }} className="text-xs font-medium text-primary hover:underline">View stacks</Link>} />
                    <div className="divide-y">
                        {isStacksLoading ? (
                            <LoadingRows count={4} />
                        ) : topStacks.length > 0 ? (
                            topStacks.map((stack) => {
                                const pct = stack.total > 0 ? Math.round((stack.running / stack.total) * 100) : 0;
                                return (
                                    <Link
                                        key={stack.name}
                                        to="/agents/$id/stacks/$stackName"
                                        params={{ id, stackName: stack.name }}
                                        className="block px-4 py-3 transition-colors hover:bg-muted/30"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">{stack.name}</p>
                                                <p className="text-xs text-muted-foreground">{stack.running}/{stack.total} containers running</p>
                                            </div>
                                            <Badge variant="outline" className="font-mono">{pct}%</Badge>
                                        </div>
                                        <Progress value={pct} className={cn("mt-3 h-1.5 bg-muted/50", pct === 100 ? "[&>div]:bg-emerald-500" : pct > 0 ? "[&>div]:bg-amber-500" : "[&>div]:bg-zinc-500")} />
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
        <SectionCard title="Next Actions" description="Common tasks for this agent.">
            <div className="grid gap-2">
                <Button asChild className="justify-between">
                    <Link to="/agents/$id/audit" params={{ id }}>
                        <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Run CIS Audit</span>
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="outline" asChild className="justify-between">
                    <Link to="/agents/$id/containers" params={{ id }}>
                        <span className="inline-flex items-center gap-2"><ContainerIcon className="h-4 w-4" />Manage Containers</span>
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="outline" asChild className="justify-between">
                    <Link to="/agents/$id/audits" params={{ id }}>
                        <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4" />Audit Reports</span>
                        <Badge variant="outline" className="font-mono">{latestAudit ? latestAudit.summary.score : "-"}</Badge>
                    </Link>
                </Button>
            </div>
            <div className="mt-4 rounded-2xl border bg-muted/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Connection</p>
                <div className="mt-3 space-y-2 text-sm">
                    <FactLine label="Mode" value={agent.access_mode} />
                    <FactLine label="Status" value={agent.status} />
                    <FactLine label="Last seen" value={relativeTime(agent.last_seen)} />
                </div>
            </div>
        </SectionCard>
    );
}

function AttentionPanel({
    id,
    failedResults,
    unhealthyContainers,
    stoppedContainers,
    latestScore,
}: {
    id: string;
    failedResults: AuditResult[];
    unhealthyContainers: DockerContainer[];
    stoppedContainers: DockerContainer[];
    latestScore: number;
}) {
    const topFailures = failedResults.slice(0, 4);
    const needsAttention = topFailures.length > 0 || unhealthyContainers.length > 0 || latestScore < 60;

    return (
        <SectionCard title="Attention Queue" description="Things worth fixing first.">
            <div className="space-y-3">
                {!needsAttention ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400">
                        <div className="flex items-center gap-2 font-semibold">
                            <CheckCircle2 className="h-4 w-4" />
                            No urgent security or workload issues.
                        </div>
                    </div>
                ) : null}

                {latestScore > 0 && latestScore < 60 ? (
                    <AttentionItem
                        icon={ShieldAlert}
                        tone="red"
                        title="Security score is critical"
                        description={`Latest audit score is ${latestScore}/100. Prioritize high severity failed rules.`}
                        action={<Link to="/agents/$id/audits" params={{ id }} className="text-xs font-semibold text-primary hover:underline">Open reports</Link>}
                    />
                ) : null}

                {unhealthyContainers.length > 0 ? (
                    <AttentionItem
                        icon={AlertTriangle}
                        tone="amber"
                        title={`${unhealthyContainers.length} unhealthy container${unhealthyContainers.length > 1 ? "s" : ""}`}
                        description={unhealthyContainers.slice(0, 2).map((container) => container.names[0]?.replace("/", "") || container.id.slice(0, 12)).join(", ")}
                        action={<Link to="/agents/$id/containers" params={{ id }} className="text-xs font-semibold text-primary hover:underline">Inspect</Link>}
                    />
                ) : null}

                {topFailures.map((result) => (
                    <AttentionItem
                        key={result.rule.id}
                        icon={result.remediation_kind === "auto" ? Zap : ShieldX}
                        tone={result.rule.severity === "High" ? "red" : result.rule.severity === "Medium" ? "amber" : "zinc"}
                        title={`${result.rule.id} · ${result.rule.title}`}
                        description={`${result.rule.severity} severity · ${result.affected.length} affected · ${result.remediation_kind} remediation`}
                        action={
                            <Link
                                to="/agents/$id/audits/$auditId"
                                params={{ id, auditId: "" }}
                                search={{ ruleId: result.rule.id }}
                                className="hidden"
                            />
                        }
                    />
                ))}

                {stoppedContainers.length > 0 ? (
                    <div className="rounded-2xl border bg-muted/10 p-4 text-xs text-muted-foreground">
                        {stoppedContainers.length} stopped container{stoppedContainers.length > 1 ? "s" : ""} are present. This may be expected, but review if the workload should be active.
                    </div>
                ) : null}
            </div>
        </SectionCard>
    );
}

function AttentionItem({
    icon: Icon,
    tone,
    title,
    description,
    action,
}: {
    icon: React.ComponentType<{ className?: string }>;
    tone: DashboardTone;
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border bg-background/50 p-4">
            <div className="flex gap-3">
                <div className={cn(iconBoxClass(tone), "size-9 rounded-xl")}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">{title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
                    {action ? <div className="mt-2">{action}</div> : null}
                </div>
            </div>
        </div>
    );
}

function HostFacts({ dockerInfo, agent }: { dockerInfo: DockerInfo; agent: Agent }) {
    return (
        <SectionCard title="Host Facts" description="System and Docker engine metadata.">
            <div className="space-y-4">
                <div className="rounded-2xl border bg-background/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Server className="h-4 w-4 text-violet-400" />
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">System</p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <FactLine label="Hostname" value={dockerInfo.hostname ?? "-"} />
                        <FactLine label="OS" value={dockerInfo.os} />
                        <FactLine label="Architecture" value={dockerInfo.architecture} />
                        <FactLine label="Kernel" value={dockerInfo.kernel_version ?? "-"} />
                        <FactLine label="CPU" value={`${dockerInfo.cpu_count} cores`} />
                        <FactLine label="Memory" value={fmtMemory(dockerInfo.memory_total)} />
                    </div>
                </div>

                <div className="rounded-2xl border bg-background/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-[#2496ED]" />
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Docker Engine</p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <FactLine label="Version" value={dockerInfo.docker_version} />
                        <FactLine label="API" value={dockerInfo.api_version ?? "-"} />
                        <FactLine label="Storage" value={dockerInfo.storage_driver ?? "-"} />
                        <FactLine label="Logging" value={dockerInfo.logging_driver ?? "-"} />
                        <FactLine label="Root Dir" value={dockerInfo.docker_root_dir ?? "-"} />
                    </div>
                </div>

                <div className="rounded-2xl border bg-background/50 p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <RouteIcon className="h-4 w-4 text-cyan-400" />
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Agent</p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <FactLine label="Access" value={agent.access_mode} />
                        <FactLine label="Created" value={fmtFullDate(agent.created_at)} />
                        <FactLine label="Updated" value={fmtDate(agent.updated_at)} />
                    </div>
                </div>
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
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-base font-bold tracking-tight">{title}</h2>
                    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
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

function FactLine({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="min-w-0 truncate font-mono text-xs text-foreground/85">{value}</span>
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
        <div className="mx-auto w-full max-w-[1500px] space-y-5">
            <div className="h-40 animate-pulse rounded-3xl border bg-card" />
            <DashboardContentSkeleton />
        </div>
    );
}

function DashboardContentSkeleton() {
    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
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
