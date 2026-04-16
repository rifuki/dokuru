import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Server, Box, Cpu, MemoryStick, Container, Image, HardDrive, Network, Layers } from "lucide-react";
import { AddAgentModal } from "@/components/agents/AddAgentModal";
import { agentDirectApi, type DockerInfo } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";

export const Route = createFileRoute("/_authenticated/")({
    component: Dashboard,
});

type AgentWithInfo = {
    agent: Agent;
    info: DockerInfo | null;
    loading: boolean;
};

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
}

function AgentCard({ data, onClick }: { data: AgentWithInfo; onClick: () => void }) {
    const { agent, info, loading } = data;
    const isOnline = agent.status === "online";

    return (
        <div
            className="rounded-xl border bg-card hover:bg-accent/30 transition-colors cursor-pointer overflow-hidden"
            onClick={onClick}
        >
            {/* Card Header */}
            <div className="flex items-start gap-4 p-5 border-b">
                <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Box className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{agent.name}</h3>
                        <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                isOnline
                                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                                    : "bg-gray-500/15 text-gray-500 dark:text-gray-400"
                            }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full bg-current ${isOnline ? "animate-pulse" : ""}`} />
                            {isOnline ? "Up" : "Down"}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{agent.url}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground capitalize">
                            {agent.access_mode}
                        </span>
                        {info && (
                            <>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                    Docker {info.docker_version}
                                </span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">{info.os}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="p-4">
                {loading ? (
                    <div className="flex items-center justify-center py-4">
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
                    </div>
                ) : info ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        <StatItem
                            icon={<Layers className="h-4 w-4" />}
                            label="Stacks"
                            value={info.stacks}
                        />
                        <StatItem
                            icon={<Container className="h-4 w-4" />}
                            label="Containers"
                            value={info.containers.total}
                            detail={
                                <span className="text-green-500 dark:text-green-400">
                                    {info.containers.running} running
                                </span>
                            }
                        />
                        <StatItem
                            icon={<Image className="h-4 w-4" />}
                            label="Images"
                            value={info.images}
                        />
                        <StatItem
                            icon={<HardDrive className="h-4 w-4" />}
                            label="Volumes"
                            value={info.volumes}
                        />
                        <StatItem
                            icon={<Network className="h-4 w-4" />}
                            label="Networks"
                            value={info.networks}
                        />
                        <StatItem
                            icon={<Cpu className="h-4 w-4" />}
                            label="CPU"
                            value={`${info.cpu_count} core${info.cpu_count !== 1 ? "s" : ""}`}
                        />
                        <StatItem
                            icon={<MemoryStick className="h-4 w-4" />}
                            label="RAM"
                            value={formatBytes(info.memory_total)}
                        />
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">
                        Unable to connect to agent
                    </p>
                )}
            </div>
        </div>
    );
}

function StatItem({
    icon,
    label,
    value,
    detail,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    detail?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">{icon}</span>
            <div className="min-w-0">
                <p className="text-sm font-medium leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                {detail && <p className="text-xs mt-0.5">{detail}</p>}
            </div>
        </div>
    );
}

function Dashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();
    const { agents, isLoading, fetchAgents } = useAgentStore();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [agentInfos, setAgentInfos] = useState<Record<string, { info: DockerInfo | null; loading: boolean }>>({});

    useEffect(() => {
        if (user?.role === "admin") {
            navigate({ to: "/admin", replace: true });
        }
    }, [user?.role, navigate]);

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
                agentDirectApi
                    .getInfo(agent.url)
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
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Environments</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        {agents.length} environment{agents.length !== 1 ? "s" : ""} connected
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Agent
                    </Button>
                </div>
            </div>

            {/* Agent List */}
            {isLoading && agents.length === 0 ? (
                <div className="flex justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                </div>
            ) : agents.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center flex flex-col items-center justify-center min-h-[400px]">
                    <Server className="h-14 w-14 text-muted-foreground/40 mb-4" />
                    <h3 className="text-xl font-semibold tracking-tight">No environments</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                        Add your first Docker agent to start managing and auditing environments.
                    </p>
                    <Button className="mt-6" onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Agent
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
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
            )}

            <AddAgentModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
        </div>
    );
}
