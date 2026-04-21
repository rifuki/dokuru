import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type DockerInfo, type AuditResponse } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { getAgentToken, setAgentToken } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Trash2, Edit, Eye, EyeOff, Container, Layers, HardDrive,
    Network, Bot, Cpu, MemoryStick, Server, Zap, ShieldCheck,
    ShieldAlert, ShieldX, ChevronRight, RefreshCw, ExternalLink,
    GitBranch, SquareStack,
} from "lucide-react";
import { useAgentStore } from "@/stores/use-agent-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/$id/")({
    component: AgentDetail,
});

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtMemory(bytes: number) {
    const gb = bytes / 1024 / 1024 / 1024;
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function ScoreRing({ score }: { score: number }) {
    const r = 36;
    const circ = 2 * Math.PI * r;
    const fill = (score / 100) * circ;
    const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
    return (
        <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg]">
            <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor"
                strokeWidth="8" className="text-muted/30" />
            <circle cx="48" cy="48" r={r} fill="none" stroke={color}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${fill} ${circ}`}
                style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
    );
}

// ── sub-components ───────────────────────────────────────────────────────────

function StatCard({
    label, value, sub, icon: Icon, color, to, id,
}: {
    label: string; value: number | string; sub?: string;
    icon: React.ElementType; color: string; to: string; id: string;
}) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate({ to, params: { id } })}
            className={`group relative overflow-hidden rounded-xl border bg-card p-5 text-left
                hover:shadow-lg hover:border-${color}-500/40 transition-all duration-200`}
        >
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity
                bg-gradient-to-br from-${color}-500/5 to-transparent`} />
            <div className="relative">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg
                    bg-${color}-500/10 text-${color}-500 mb-4
                    group-hover:bg-${color}-500/20 transition-colors`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="text-3xl font-bold tracking-tight mb-0.5">{value}</div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
                {sub && <div className="text-xs text-muted-foreground/70 mt-1.5">{sub}</div>}
            </div>
            <ChevronRight className={`absolute bottom-4 right-4 h-4 w-4 text-${color}-500/40
                group-hover:text-${color}-500/80 group-hover:translate-x-0.5 transition-all`} />
        </button>
    );
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-4">
            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
            <span className={`text-sm font-medium text-right truncate ${mono ? "font-mono text-xs" : ""}`}>
                {value || <span className="text-muted-foreground/50 italic">—</span>}
            </span>
        </div>
    );
}

// ── main ─────────────────────────────────────────────────────────────────────

function AgentDetail() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const { deleteAgent, updateAgent } = useAgentStore();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocker, setIsLoadingDocker] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editToken, setEditToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const { data: audits } = useQuery({
        queryKey: ["audits", id],
        queryFn: () => agentApi.listAudits(id),
        enabled: !!id,
    });

    const latestAudit: AuditResponse | null = audits?.[audits.length - 1] ?? null;

    const fetchDockerInfo = async (agentUrl: string, agentId: string) => {
        const token = getAgentToken(agentId);
        if (!token) return;
        setIsLoadingDocker(true);
        setDockerInfo(null);
        try {
            const info = await agentDirectApi.getInfo(agentUrl, token);
            setDockerInfo(info);
        } catch { /* silently fail */ } finally {
            setIsLoadingDocker(false);
        }
    };

    useEffect(() => {
        const fetchAgent = async () => {
            try {
                const data = await agentApi.getById(id);
                setAgent(data);
                await fetchDockerInfo(data.url, data.id);
            } catch {
                toast.error("Failed to load agent");
                navigate({ to: "/" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchAgent();
    }, [id, navigate]);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteAgent(id);
            toast.success("Agent deleted");
            navigate({ to: "/" });
        } catch {
            toast.error("Failed to delete agent");
            setIsDeleting(false);
        }
    };

    const openEdit = () => {
        if (!agent) return;
        setEditName(agent.name);
        setEditUrl(agent.url);
        setEditToken("");
        setShowToken(false);
        setEditDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updated = await agentApi.update(id, {
                name: editName,
                url: editUrl,
                token: editToken || undefined,
            });
            if (editToken) setAgentToken(id, editToken);
            setAgent(updated);
            updateAgent(updated);
            setEditDialogOpen(false);
            toast.success("Agent updated");
            await fetchDockerInfo(updated.url, updated.id);
        } catch {
            toast.error("Failed to update agent");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    if (!agent) return null;

    const isOnline = !isLoadingDocker && dockerInfo !== null;

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">

            {/* ── Dialogs ─────────────────────────────────────────────────── */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Agent</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Agent name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-url">URL</Label>
                            <Input id="edit-url" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="http://host:port" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-token">Token <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
                            <div className="relative">
                                <Input
                                    id="edit-token"
                                    type={showToken ? "text" : "password"}
                                    value={editToken}
                                    onChange={e => setEditToken(e.target.value)}
                                    placeholder="New token (optional)"
                                    className="pr-10"
                                />
                                <button type="button" onClick={() => setShowToken(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSaving || !editName || !editUrl}>
                            {isSaving ? "Saving…" : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{agent.name}"? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Hero Banner ──────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl border bg-card">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 -translate-y-1/2 translate-x-1/4 blur-3xl" />
                <div className="relative px-7 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Bot className="h-7 w-7 text-primary" />
                            </div>
                            {/* status dot */}
                            <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center ${isOnline ? "bg-green-500" : "bg-gray-400"}`}>
                                {isOnline && <span className="w-2 h-2 rounded-full bg-green-400 animate-ping absolute" />}
                            </span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-2xl font-bold tracking-tight">{agent.name}</h2>
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                    isOnline
                                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                                        : "bg-muted text-muted-foreground border-border"
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${isOnline ? "animate-pulse" : ""}`} />
                                    {isOnline ? "online" : "offline"}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{agent.url}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <GitBranch className="h-3 w-3" />
                                    {agent.access_mode}
                                </span>
                                <span>·</span>
                                <span>Created {new Date(agent.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                                {dockerInfo?.docker_version && (
                                    <>
                                        <span>·</span>
                                        <span className="flex items-center gap-1">
                                            <Zap className="h-3 w-3" />
                                            Docker {dockerInfo.docker_version}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => fetchDockerInfo(agent.url, agent.id)} disabled={isLoadingDocker} className="gap-1.5">
                            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDocker ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5">
                            <Edit className="h-3.5 w-3.5" />
                            Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={isDeleting} className="gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Loading skeleton ─────────────────────────────────────────── */}
            {isLoadingDocker ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-32 rounded-xl border bg-card animate-pulse" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="h-64 rounded-xl border bg-card animate-pulse" />
                        <div className="h-64 rounded-xl border bg-card animate-pulse" />
                    </div>
                </div>
            ) : !dockerInfo ? (
                /* ── Offline state ──────────────────────────────────────────── */
                <div className="rounded-xl border-2 border-dashed bg-muted/20 p-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                        <Server className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Agent unreachable</h3>
                    <p className="text-muted-foreground text-sm mb-4">Make sure the agent is running and accessible.</p>
                    <Button variant="outline" size="sm" onClick={() => fetchDockerInfo(agent.url, agent.id)} className="gap-2">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry Connection
                    </Button>
                </div>
            ) : (
                <>
                    {/* ── Resource Stats ──────────────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <StatCard id={id} to="/agents/$id/containers" label="Containers" icon={Container} color="blue"
                            value={dockerInfo.containers.total}
                            sub={`${dockerInfo.containers.running} running · ${dockerInfo.containers.stopped} stopped`} />
                        <StatCard id={id} to="/agents/$id/images" label="Images" icon={Layers} color="purple"
                            value={dockerInfo.images} />
                        <StatCard id={id} to="/agents/$id/volumes" label="Volumes" icon={HardDrive} color="orange"
                            value={dockerInfo.volumes} />
                        <StatCard id={id} to="/agents/$id/networks" label="Networks" icon={Network} color="green"
                            value={dockerInfo.networks} />
                        <StatCard id={id} to="/agents/$id/stacks" label="Stacks" icon={SquareStack} color="cyan"
                            value={dockerInfo.stacks} />
                    </div>

                    {/* ── System Info + Security ───────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                        {/* Host & Engine — 3 cols */}
                        <div className="lg:col-span-3 rounded-xl border bg-card overflow-hidden">
                            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                                {/* Host */}
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                                            <Server className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <h3 className="text-sm font-semibold">Host</h3>
                                    </div>
                                    <InfoRow label="Hostname" value={dockerInfo.hostname} mono />
                                    <InfoRow label="OS" value={`${dockerInfo.os} · ${dockerInfo.architecture}`} />
                                    <InfoRow label="Kernel" value={dockerInfo.kernel_version} mono />
                                    <div className="flex items-center justify-between py-2.5 border-b border-border/40 gap-4">
                                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5">
                                            <Cpu className="h-3 w-3" /> CPU
                                        </span>
                                        <span className="text-sm font-medium">{dockerInfo.cpu_count} cores</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2.5 gap-4">
                                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5">
                                            <MemoryStick className="h-3 w-3" /> Memory
                                        </span>
                                        <span className="text-sm font-medium">{fmtMemory(dockerInfo.memory_total)}</span>
                                    </div>
                                </div>

                                {/* Engine */}
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                                            <Zap className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <h3 className="text-sm font-semibold">Engine</h3>
                                    </div>
                                    <InfoRow label="Docker Version" value={dockerInfo.docker_version} mono />
                                    <InfoRow label="API Version" value={dockerInfo.api_version} mono />
                                    <InfoRow label="Root Directory" value={dockerInfo.docker_root_dir} mono />
                                    <InfoRow label="Storage Driver" value={dockerInfo.storage_driver} mono />
                                    <InfoRow label="Logging Driver" value={dockerInfo.logging_driver} mono />
                                </div>
                            </div>
                        </div>

                        {/* Security Posture — 2 cols */}
                        <div className="lg:col-span-2 rounded-xl border bg-card overflow-hidden flex flex-col">
                            <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
                                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <h3 className="text-sm font-semibold">Security Posture</h3>
                            </div>

                            {latestAudit ? (
                                <div className="p-5 flex flex-col gap-4 flex-1">
                                    {/* Score ring */}
                                    <div className="flex items-center gap-5">
                                        <div className="relative shrink-0">
                                            <ScoreRing score={Math.round(latestAudit.summary.score)} />
                                            <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                                                <span className="text-2xl font-bold leading-none">{Math.round(latestAudit.summary.score)}</span>
                                                <span className="text-xs text-muted-foreground">/100</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                                                <span className="text-sm font-semibold text-green-500">{latestAudit.summary.passed} passed</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <ShieldX className="h-4 w-4 text-red-500 shrink-0" />
                                                <span className="text-sm font-semibold text-red-500">{latestAudit.summary.failed} failed</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="text-xs text-muted-foreground">{latestAudit.summary.total} checks total</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Score bar */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Pass rate</span>
                                            <span>{latestAudit.summary.passed}/{latestAudit.summary.total}</span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700"
                                                style={{ width: `${(latestAudit.summary.passed / latestAudit.summary.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        Last audit: {new Date(latestAudit.timestamp).toLocaleString("en-US", {
                                            month: "short", day: "numeric", year: "numeric",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
                                    </p>

                                    <div className="flex gap-2 mt-auto">
                                        <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
                                            <Link to="/agents/$id/audits" params={{ id }}>
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                View Reports
                                            </Link>
                                        </Button>
                                        <Button size="sm" className="flex-1 gap-1.5" asChild>
                                            <Link to="/agents/$id/audit" params={{ id }}>
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                Run Audit
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
                                    <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                                        <ShieldAlert className="h-7 w-7 text-muted-foreground/50" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold">No audits yet</p>
                                        <p className="text-xs text-muted-foreground mt-1">Run a CIS Docker Benchmark audit to see your security posture.</p>
                                    </div>
                                    <Button size="sm" className="gap-1.5 mt-1" asChild>
                                        <Link to="/agents/$id/audit" params={{ id }}>
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            Run First Audit
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
