import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Lock, Terminal } from "lucide-react";

import { HostShellTerminal } from "@/components/agents/HostShellTerminal";
import { Button } from "@/components/ui/button";
import { agentApi } from "@/lib/api/agent";
import { HOST_SHELL_ENABLED } from "@/lib/host-shell";
import { getAgentToken } from "@/stores/use-agent-store";

export const Route = createFileRoute("/_authenticated/agents/$id/shell")({
  component: AgentHostShellPage,
});

function AgentHostShellPage() {
  const { id } = Route.useParams();
  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  if (!HOST_SHELL_ENABLED) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-bold">VPS Shell Disabled</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Host shell is a dev/demo feature. Enable it with `VITE_ENABLE_HOST_SHELL=true` or run the frontend in dev mode.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/agents/$id" params={{ id }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Agent
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !agent) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border bg-card" />
        <div className="h-[68vh] animate-pulse rounded-2xl border bg-card" />
      </div>
    );
  }

  const token = getAgentToken(agent.id) ?? agent.token ?? undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">Dev/Demo Mode</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">VPS Shell</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                This opens a real interactive shell on <span className="font-semibold text-foreground">{agent.name}</span>. Use it only for trusted demos because commands run on the agent host.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/agents/$id" params={{ id }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3">
        <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-muted-foreground">
          <Terminal className="h-4 w-4 text-[#2496ED]" />
          Remote host terminal via dokuru-agent
        </div>
        <HostShellTerminal
          agentId={agent.id}
          agentUrl={agent.url}
          accessMode={agent.access_mode}
          token={token}
        />
      </div>
    </div>
  );
}
