import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Container, Image, HardDrive, Network, Search, ChevronDown, ArrowUpDown, Edit, Trash2 } from "lucide-react";
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

function AgentCard({ data, onClick }: { data: AgentWithInfo; onClick: () => void }) {
    const { agent, info, loading } = data;
    const { deleteAgent } = useAgentStore();
    const isOnline = agent.status === "online";

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Delete agent "${agent.name}"?`)) return;
        await deleteAgent(agent.id);
    };

    return (
        <div className="flex transition-all">
            <div
                className="flex-1 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={onClick}
            >
                <div className="p-4 flex items-center gap-6">
                    <div className="w-14 flex items-center justify-center shrink-0">
                        <img src="/docker.svg" alt="Docker" className="w-14 h-14" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-base font-bold text-white tracking-tight">{agent.name}</span>
                            <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold uppercase ${
                                    isOnline
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                        : "border-gray-500/30 bg-gray-500/10 text-gray-400"
                                }`}
                            >
                                {isOnline ? "●" : "○"} {isOnline ? "UP" : "DOWN"}
                            </span>
                            {info && (
                                <span className="text-[12px] text-slate-300 font-mono font-medium">
                                    Docker {info.docker_version}
                                </span>
                            )}
                            <span className="text-[12px] text-slate-400 font-mono">{agent.url}</span>
                        </div>

                        {loading ? (
                            <div className="flex items-center gap-2 mt-3">
                                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-[#3BA5EF]" />
                                <span className="text-[12px] text-slate-400">Loading...</span>
                            </div>
                        ) : info ? (
                            <div className="flex items-center mt-3 text-[12px] font-medium text-slate-300 flex-wrap divide-x divide-white/[0.08]">
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
                                    <Image className="w-3.5 h-3.5" />
                                    <span>{info.images} images</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-3">
                                    <HardDrive className="w-3.5 h-3.5" />
                                    <span>{info.volumes} volumes</span>
                                </div>
                                <div className="flex items-center gap-1.5 pl-3">
                                    <Network className="w-3.5 h-3.5" />
                                    <span>{info.networks} networks</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-[12px] text-slate-500 mt-3">Unable to connect</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="w-[180px] border-l border-white/5 flex flex-col justify-center gap-2 px-4 py-3 bg-black/10">
                <button
                    className={`flex items-center justify-center gap-2 h-9 w-full rounded text-sm font-semibold transition-all cursor-pointer ${
                        isOnline
                            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20"
                            : "bg-[#1E4A8A]/40 border border-[#3BA5EF]/20 text-[#3BA5EF] hover:bg-[#1E4A8A]/60"
                    }`}
                    onClick={onClick}
                >
                    <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-[#3BA5EF]"}`}></span>
                    {isOnline ? "Connected" : "Connect"}
                </button>
            </div>

            <div className="w-12 border-l border-white/5 flex flex-col items-center justify-start py-4 bg-black/10">
                <button
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors group cursor-pointer"
                    title="Edit agent"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Edit className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
                <button
                    onClick={handleDelete}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors group cursor-pointer"
                    title="Delete agent"
                >
                    <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
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

            {/* Agent List with Filter Bar */}
            {isLoading && agents.length === 0 ? (
                <div className="flex justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                </div>
            ) : agents.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center flex flex-col items-center justify-center min-h-[400px]">
                    <img src="/docker.svg" alt="Docker" className="w-14 h-14 opacity-40 mb-4" />
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
                <div className="bg-[#23282D] border border-white/5 rounded-md overflow-hidden">
                    {/* Filter Bar */}
                    <div className="p-4 border-b border-white/5">
                        <div className="flex items-center gap-3 flex-wrap">
                            <button className="px-3 py-1.5 bg-[#1A1E23] border border-white/10 rounded text-sm text-slate-300 hover:bg-white/[0.02] flex items-center gap-2">
                                Connection
                                <ChevronDown className="w-4 h-4" />
                            </button>
                            <button className="px-3 py-1.5 bg-[#1A1E23] border border-white/10 rounded text-sm text-slate-300 hover:bg-white/[0.02] flex items-center gap-2">
                                Status
                                <ChevronDown className="w-4 h-4" />
                            </button>
                            <button className="px-3 py-1.5 bg-[#1A1E23] border border-white/10 rounded text-sm text-slate-300 hover:bg-white/[0.02] flex items-center gap-2">
                                Agent Version
                                <ChevronDown className="w-4 h-4" />
                            </button>
                            <button className="px-3 py-1.5 text-sm text-[#3BA5EF] hover:text-[#3BA5EF]/80">
                                Clear all
                            </button>
                            <div className="flex-1 min-w-[300px] relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Search by name, status, URL..."
                                    className="w-full pl-10 pr-4 py-1.5 bg-[#1A1E23] border border-white/10 rounded text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-[#3BA5EF]/50"
                                />
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                <span className="text-sm text-slate-400">Sort By</span>
                                <button className="px-3 py-1.5 bg-[#1A1E23] border border-white/10 rounded text-sm text-slate-300 hover:bg-white/[0.02] flex items-center gap-2">
                                    Name
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                                <button className="p-1.5 bg-[#1A1E23] border border-white/10 rounded text-slate-300 hover:bg-white/[0.02]">
                                    <ArrowUpDown className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Agent Cards */}
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
