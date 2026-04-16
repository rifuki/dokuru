import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type DockerInfo, type AuditResponse } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { getAgentToken } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Container, Box, HardDrive, Network, Play, CheckCircle2, XCircle, AlertCircle, Bot, Calendar, Wifi, Cpu, MemoryStick, Monitor, Layers } from "lucide-react";
import { useAgentStore } from "@/stores/use-agent-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/$id")({
    component: AgentDetail,
});

function AgentDetail() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const { deleteAgent } = useAgentStore();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
    const [auditResults, setAuditResults] = useState<AuditResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocker, setIsLoadingDocker] = useState(false);
    const [isRunningAudit, setIsRunningAudit] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchAgent = async () => {
            try {
                const data = await agentApi.getById(id);
                setAgent(data);
                
                // Fetch Docker info from agent directly
                const token = getAgentToken(data.id);
                if (!token) {
                    toast.error("Agent token not found");
                    setIsLoadingDocker(false);
                    return;
                }

                setIsLoadingDocker(true);
                try {
                    const info = await agentDirectApi.getInfo(data.url, token);
                    setDockerInfo(info);
                } catch {
                    toast.error("Failed to connect to agent");
                } finally {
                    setIsLoadingDocker(false);
                }
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
        if (!confirm("Are you sure you want to delete this agent?")) return;

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
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate({ to: "/" })}
                        className="hover:bg-primary/10"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{agent.name}</h2>
                        <p className="text-muted-foreground mt-1">{agent.url}</p>
                    </div>
                </div>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Agent
                </Button>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                <span className="text-xs text-muted-foreground">Operating System</span>
                                <span className="text-sm font-medium text-right">{dockerInfo.os}</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-border/50">
                                <span className="text-xs text-muted-foreground">Architecture</span>
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
                                <div className="flex gap-2 text-xs">
                                    <span className="text-green-600 dark:text-green-400">{dockerInfo.containers.running} up</span>
                                    <span className="text-muted-foreground">{dockerInfo.containers.stopped} down</span>
                                </div>
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
                        size="sm"
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
                                    <p className="text-2xl font-bold">{auditResults.passed}</p>
                                    <p className="text-xs text-muted-foreground">Passed</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10">
                                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                <div>
                                    <p className="text-2xl font-bold">{auditResults.failed}</p>
                                    <p className="text-xs text-muted-foreground">Failed</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10">
                                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                <div>
                                    <p className="text-2xl font-bold">{auditResults.warned}</p>
                                    <p className="text-xs text-muted-foreground">Warnings</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {auditResults.results.map((result) => (
                                <div
                                    key={result.rule_id}
                                    className={`p-3 rounded-lg border ${
                                        result.status === "pass"
                                            ? "bg-green-500/5 border-green-500/20"
                                            : result.status === "fail"
                                            ? "bg-red-500/5 border-red-500/20"
                                            : "bg-yellow-500/5 border-yellow-500/20"
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        {result.status === "pass" ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                                        ) : result.status === "fail" ? (
                                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                                        ) : (
                                            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                        )}
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">{result.title}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {result.rule_id} • {result.message}
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
