import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";

import { HostShellTerminal } from "@/components/agents/HostShellTerminal";
import { Button } from "@/components/ui/button";
import { agentApi } from "@/lib/api/agent";
import { dockerCredential } from "@/services/docker-api";
import { HOST_SHELL_ENABLED } from "@/lib/host-shell";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";

export const Route = createFileRoute("/_authenticated/agents/$id/shell")({
  component: AgentHostShellPage,
});

function AgentHostShellPage() {
  const { id } = Route.useParams();
  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });
  useWindowScrollMemory(`agent:${id}:shell`, !isLoading || !HOST_SHELL_ENABLED);

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

  const token = dockerCredential(agent) || undefined;

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <HostShellTerminal
        agentId={agent.id}
        agentUrl={agent.url}
        accessMode={agent.access_mode}
        token={token}
      />
    </div>
  );
}
