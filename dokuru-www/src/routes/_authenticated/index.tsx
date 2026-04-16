import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Server } from "lucide-react";
import { AddAgentModal } from "@/components/agents/AddAgentModal";

export const Route = createFileRoute("/_authenticated/")({
    component: Dashboard,
});

function Dashboard() {
    const user = useAuthUser();
    const navigate = useNavigate();
    const { agents, isLoading, fetchAgents } = useAgentStore();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    useEffect(() => {
        if (user?.role === "admin") {
            navigate({ to: "/admin", replace: true });
        }
    }, [user?.role, navigate]);

    useEffect(() => {
        fetchAgents();
    }, [fetchAgents]);

    return (
        <div className="max-w-7xl mx-auto w-full space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Agents</h2>
                    <p className="text-muted-foreground mt-2">
                        Manage your Docker agents and environments
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAgents()}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
                <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                </div>
            ) : agents.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]">
                    <Server className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-xl font-semibold tracking-tight text-foreground/80">
                        No agents configured
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                        Add your first Docker agent to start auditing.
                    </p>
                    <Button className="mt-6" onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Agent
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    {agents.map((agent) => (
                        <div
                            key={agent.id}
                            className="rounded-lg border bg-card p-6 hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => navigate({ to: `/agents/${agent.id}` })}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Server className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{agent.name}</h3>
                                        <p className="text-sm text-muted-foreground">{agent.url}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                            agent.status === "online"
                                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                                : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
                                        }`}
                                    >
                                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                        {agent.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AddAgentModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />
        </div>
    );
}
