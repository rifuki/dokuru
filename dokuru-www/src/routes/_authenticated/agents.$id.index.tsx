import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Trash2, Edit, Eye, EyeOff, Container, Box, HardDrive, Network, Play, CheckCircle2, XCircle, AlertCircle, Bot, Calendar, Wifi, Cpu, MemoryStick, Monitor, Layers } from "lucide-react";
import { useAgentStore } from "@/stores/use-agent-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/$id/")({
    component: AgentDetail,
});

function AgentDetail() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const { deleteAgent, updateAgent } = useAgentStore();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
    const [auditResults, setAuditResults] = useState<AuditResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocker, setIsLoadingDocker] = useState(false);
    const [isRunningAudit, setIsRunningAudit] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editToken, setEditToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchDockerInfo = async (agentUrl: string, agentId: string) => {
        const token = getAgentToken(agentId);
        if (!token) {
            toast.error("Agent token not found");
            return;
        }
        setIsLoadingDocker(true);
        setDockerInfo(null);
        try {
            const info = await agentDirectApi.getInfo(agentUrl, token);
            setDockerInfo(info);
        } catch {
            // silently fail — UI shows offline state
        } finally {
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
            toast.success("Agent deleted successfully");
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
            // Re-fetch docker info in case URL or token changed
            await fetchDockerInfo(updated.url, updated.id);
        } catch {
            toast.error("Failed to update agent");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRunAudit = async () => {
        if (!agent) return;

        const token = getAgentToken(agent.id);
        if (!token) {
            toast.error("Agent token not found");
            return;
        }

        setIsRunningAudit(true);
        try {
            const results = await agentDirectApi.runAudit(agent.url, token);
            setAuditResults(results);
            toast.success("Audit completed successfully");
        } catch {
            toast.error("Failed to run audit");
        } finally {
            setIsRunningAudit(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    if (!agent) return null;

    return (
        <div className="max-w-7xl mx-auto w-full space-y-8">
            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Agent</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Agent name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-url">URL</Label>
                            <Input id="edit-url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="http://host:port" />
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
                                <button type="button" onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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

            {/* Delete Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete agent "{agent.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{agent.name}</h2>
                    <p className="text-muted-foreground mt-1">{agent.url}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={openEdit}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Agent
                    </Button>
                    <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={isDeleting}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Agent
                    </Button>
                </div>
            </div>

            {/* Agent Info Card */}
            <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">Agent Information</h3>
                        <p className="text-xs text-muted-foreground">Connection details and status</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="flex items-start gap-2">
                        <Wifi className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Status</p>
                            <span
                                className={`inline-flex items-center gap-1 text-xs font-medium ${
                                    dockerInfo ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
                                }`}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {dockerInfo ? "online" : "offline"}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Network className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Access Mode</p>
                            <p className="text-sm font-medium capitalize truncate">{agent.access_mode}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Created</p>
                            <p className="text-sm font-medium truncate">{new Date(agent.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Docker Version</p>
                            <p className="text-sm font-medium font-mono truncate">{dockerInfo?.docker_version || "N/A"}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Docker Info */}
            {isLoadingDocker ? (
                <div className="rounded-lg border bg-card p-12 text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto" />
                    <p className="text-sm text-muted-foreground mt-4">
                        Connecting to agent...
                    </p>
                </div>
            ) : dockerInfo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* System Info */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-primary" />
                            System Information
                        </h3>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between py-2 border-b border-border/50">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Monitor className="h-3 w-3" />
                                    Operating System
                                </span>
                                <span className="text-sm font-medium text-right">{dockerInfo.os}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/50">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Cpu className="h-3 w-3" />
                                    Architecture
                                </span>
                                <span className="text-sm font-medium text-right">{dockerInfo.architecture}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/50">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Cpu className="h-3 w-3" />
                                    CPU Cores
                                </span>
                                <span className="text-sm font-medium text-right">{dockerInfo.cpu_count}</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <MemoryStick className="h-3 w-3" />
                                    Total Memory
                                </span>
                                <span className="text-sm font-medium text-right">
                                    {(dockerInfo.memory_total / 1024 / 1024 / 1024).toFixed(1)} GB
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Docker Resources */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary" />
                            Docker Resources
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col">
                                <div className="flex items-center gap-2 mb-2">
                                    <Container className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs text-muted-foreground">Containers</span>
                                </div>
                                <p className="text-2xl font-bold mb-1">{dockerInfo.containers.total}</p>
                                <p className="text-xs">
                                    <span className="text-green-600 dark:text-green-400">{dockerInfo.containers.running} up</span>
                                    {" · "}
                                    <span className="text-muted-foreground">{dockerInfo.containers.stopped} down</span>
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col">
                                <div className="flex items-center gap-2 mb-2">
                                    <Box className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs text-muted-foreground">Images</span>
                                </div>
                                <p className="text-2xl font-bold">{dockerInfo.images}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col">
                                <div className="flex items-center gap-2 mb-2">
                                    <HardDrive className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs text-muted-foreground">Volumes</span>
                                </div>
                                <p className="text-2xl font-bold">{dockerInfo.volumes}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col">
                                <div className="flex items-center gap-2 mb-2">
                                    <Network className="h-4 w-4 text-primary shrink-0" />
                                    <span className="text-xs text-muted-foreground">Networks</span>
                                </div>
                                <p className="text-2xl font-bold">{dockerInfo.networks}</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-dashed bg-card/50 p-12 text-center">
                    <h3 className="text-lg font-semibold text-foreground/80">
                        Unable to connect to agent
                    </h3>
                    <p className="text-muted-foreground mt-2">
                        Make sure the agent is running and accessible
                    </p>
                </div>
            )}

            {/* Audit Section */}
            <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Security Audit</h3>
                    <Button
                        onClick={handleRunAudit}
                        disabled={isRunningAudit || !dockerInfo}
                    >
                        <Play className={`h-4 w-4 mr-2 ${isRunningAudit ? 'animate-spin' : ''}`} />
                        {isRunningAudit ? "Running..." : "Run Audit"}
                    </Button>
                </div>

                {auditResults ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10">
                                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                <div>
                                    <p className="text-2xl font-bold">{auditResults.summary.passed}</p>
                                    <p className="text-xs text-muted-foreground">Passed</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10">
                                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                <div>
                                    <p className="text-2xl font-bold">{auditResults.summary.failed}</p>
                                    <p className="text-xs text-muted-foreground">Failed</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10">
                                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                <div>
                                    <p className="text-2xl font-bold">{auditResults.summary.failed}</p>
                                    <p className="text-xs text-muted-foreground">Warnings</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {auditResults.results.map((result) => (
                                <div
                                    key={result.rule.id}
                                    className={`p-3 rounded-lg border ${
                                        result.status === "Pass"
                                            ? "bg-green-500/5 border-green-500/20"
                                            : result.status === "Fail"
                                            ? "bg-red-500/5 border-red-500/20"
                                            : "bg-yellow-500/5 border-yellow-500/20"
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        {result.status === "Pass" ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                                        ) : result.status === "Fail" ? (
                                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                        )}
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">{result.rule.title}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {result.rule.id} • {result.message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        Click "Run Audit" to start CIS Docker Benchmark security audit
                    </p>
                )}
            </div>
        </div>
    );
}
