import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { adminService } from "@/lib/api/services/admin-services";
import {
  type AdminAgentResolvedStatus,
  hasRecentHeartbeat,
  useAdminAgentStatuses,
} from "@/features/admin/hooks/use-admin-agent-statuses";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminAgent } from "@/features/admin/types/stats";
import { Bot, Clock3, Link2, RadioTower, RefreshCw, Server, UserRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/agents")({
  component: AdminAgentsPage,
});

function resolveAgentStatus(agent: AdminAgent, liveStatus?: AdminAgentResolvedStatus) {
  if (liveStatus) {
    return liveStatus;
  }

  return agent.last_seen ? ("stale" as const) : ("never" as const);
}

function ConnectionBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    direct: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    cloudflare: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    domain: "bg-violet-500/10 text-violet-500 border-violet-500/30",
    relay: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  };

  return (
    <Badge variant="outline" className={styles[mode] ?? "bg-muted text-muted-foreground border-border"}>
      {mode}
    </Badge>
  );
}

function StatusBadge({ status }: { status: AdminAgentResolvedStatus }) {
  if (status === "online") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
        Online
      </Badge>
    );
  }

  if (status === "stale") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
        Stale
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      {status === "never" ? "Never seen" : "Offline"}
    </Badge>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName,
  iconWrapClassName,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof Bot;
  iconClassName: string;
  iconWrapClassName: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${iconWrapClassName}`}>
          <Icon className={`h-5 w-5 ${iconClassName}`} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AdminAgentsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: adminService.getAdminAgents,
  });

  const agents = data?.agents ?? [];

  const {
    statuses: liveStatuses,
    counts,
    isFetching: isCheckingStatuses,
    refetch: refetchStatuses,
  } = useAdminAgentStatuses(agents);
  const totalAgents = data?.total ?? 0;
  const reachableAgents = counts.online;
  const recentHeartbeatAgents = counts.recentHeartbeat;
  const staleAgents = counts.stale + counts.offline;

  const columns: ColumnDef<AdminAgent>[] = [
    {
      accessorKey: "name",
      header: "Agent",
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div className="space-y-1">
            <div className="font-medium">{agent.name}</div>
            <div className="text-xs text-muted-foreground font-mono break-all">{agent.url}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "user_email",
      header: "Owner",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{row.original.user_email}</span>
        </div>
      ),
    },
    {
      accessorKey: "access_mode",
      header: "Connection",
      cell: ({ row }) => <ConnectionBadge mode={row.original.access_mode} />,
    },
    {
      id: "status",
      accessorFn: (row) => resolveAgentStatus(row, liveStatuses[row.id]),
      header: "Reachable",
      cell: ({ row }) => <StatusBadge status={resolveAgentStatus(row.original, liveStatuses[row.original.id])} />,
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
        </span>
      ),
    },
    {
      id: "lastSeenAt",
      accessorFn: (row) => row.last_seen ?? "",
      header: "Last Heartbeat",
      cell: ({ row }) => {
        const agent = row.original;
        const resolvedStatus = resolveAgentStatus(agent, liveStatuses[agent.id]);

        if (hasRecentHeartbeat(agent.last_seen)) {
          return <span className="text-sm text-emerald-500">Recent</span>;
        }

        if (!agent.last_seen) {
          return <span className="text-sm text-muted-foreground">Never</span>;
        }

        return (
          <div className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true })}
          </div>
        );
      },
    },
  ];

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchStatuses()]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Monitor every registered agent across all user accounts with live reachability checks.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reachable = browser can hit the agent now. Heartbeat = server last saw the agent recently.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={isFetching || isCheckingStatuses}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching || isCheckingStatuses ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Agents"
          value={totalAgents}
          description="Registered across all users"
          icon={Bot}
          iconWrapClassName="bg-blue-100 dark:bg-blue-950/30"
          iconClassName="text-blue-600"
        />
        <SummaryCard
          title="Reachable Now"
          value={reachableAgents}
          description="Live health check or active relay presence"
          icon={RadioTower}
          iconWrapClassName="bg-emerald-100 dark:bg-emerald-950/30"
          iconClassName="text-emerald-600"
        />
        <SummaryCard
          title="Recent Heartbeat"
          value={recentHeartbeatAgents}
          description="Server heartbeat in the last 5 minutes"
          icon={Link2}
          iconWrapClassName="bg-amber-100 dark:bg-amber-950/30"
          iconClassName="text-amber-600"
        />
        <SummaryCard
          title="Needs Attention"
          value={staleAgents}
          description="Previously seen, but not reachable now"
          icon={Clock3}
          iconWrapClassName="bg-violet-100 dark:bg-violet-950/30"
          iconClassName="text-violet-600"
        />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Fleet Inventory</h2>
            <p className="text-sm text-muted-foreground">
              Search by agent name, owner email, connection mode, or URL.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground md:flex">
            <Server className="h-3.5 w-3.5" />
            Admin inventory view
          </div>
        </div>

        {isError ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Failed to load agent inventory.
          </div>
        ) : isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <DataTable
            data={agents}
            columns={columns}
            rowId="id"
            searchPlaceholder="Search agents, owners, or connection modes..."
          />
        )}
      </div>
    </div>
  );
}
