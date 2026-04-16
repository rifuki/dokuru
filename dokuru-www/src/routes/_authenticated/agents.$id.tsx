import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type DockerInfo } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Trash2, Container, Image, HardDrive, Network } from "lucide-react";
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
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDocker, setIsLoadingDocker] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchAgent = async () => {
            try {
                const data = await agentApi.getById(id);
                setAgent(data);
                
                // Fetch Docker info from agent directly
                setIsLoadingDocker(true);
                try {
                    const info = await agentDirectApi.getInfo(data.url);
                    setDockerInfo(info);
                } catch {
                    toast.error("Failed to connect to agent");
                }
                setIsLoadingDocker(false);
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
            <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Server className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold">Agent Information</h3>
                        <p className="text-sm text-muted-foreground">
                            Connection details and status
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Status</p>
                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mt-1 ${
                                agent.status === "online"
                                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                    : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                            }`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {agent.status}
                        </span>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Access Mode</p>
                        <p className="text-sm mt-1 capitalize">{agent.access_mode}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Created</p>
                        <p className="text-sm mt-1">
                            {new Date(agent.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Last Seen</p>
                        <p className="text-sm mt-1">
                            {agent.last_seen
                                ? new Date(agent.last_seen).toLocaleString()
                                : "Never"}
                        </p>
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
                <div className="rounded-lg border bg-card p-6">
                    <h3 className="text-lg font-semibold mb-4">Docker Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <Container className="h-8 w-8 text-primary" />
                            <div>
                                <p className="text-2xl font-bold">{dockerInfo.containers.total}</p>
                                <p className="text-xs text-muted-foreground">Containers</p>
                                <p className="text-xs text-green-600 dark:text-green-400">
                                    {dockerInfo.containers.running} running
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <Image className="h-8 w-8 text-primary" />
                            <div>
                                <p className="text-2xl font-bold">{dockerInfo.images}</p>
                                <p className="text-xs text-muted-foreground">Images</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <HardDrive className="h-8 w-8 text-primary" />
                            <div>
                                <p className="text-2xl font-bold">{dockerInfo.volumes}</p>
                                <p className="text-xs text-muted-foreground">Volumes</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                            <Network className="h-8 w-8 text-primary" />
                            <div>
                                <p className="text-2xl font-bold">{dockerInfo.networks}</p>
                                <p className="text-xs text-muted-foreground">Networks</p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                            Docker Version: <span className="font-mono">{dockerInfo.version}</span>
                        </p>
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
        </div>
    );
}
