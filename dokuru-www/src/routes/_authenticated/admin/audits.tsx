import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { adminService } from "@/lib/api/services/admin-services";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminAudit } from "@/features/admin/types/stats";
import { AlertTriangle, ClipboardCheck, RefreshCw, Shield, ShieldCheck, ShieldX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audits")({
  component: AdminAuditsPage,
});

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/10">Healthy</Badge>;
  }

  if (score >= 60) {
    return <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/10">Watch</Badge>;
  }

  return <Badge className="bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/10">Critical</Badge>;
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
  value: string | number;
  description: string;
  icon: typeof Shield;
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

const columns: ColumnDef<AdminAudit>[] = [
  {
    accessorKey: "agent_name",
    header: "Agent",
    cell: ({ row }) => (
      <div className="space-y-1">
        <div className="font-medium">{row.original.agent_name}</div>
        <div className="text-xs text-muted-foreground">{row.original.hostname}</div>
      </div>
    ),
  },
  {
    accessorKey: "user_email",
    header: "Owner",
  },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ScoreBadge score={row.original.score} />
        <span className="text-sm text-muted-foreground">{row.original.score}%</span>
      </div>
    ),
  },
  {
    accessorKey: "passed",
    header: "Results",
    cell: ({ row }) => (
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          {row.original.passed}
        </span>
        <span className="inline-flex items-center gap-1 text-red-500">
          <ShieldX className="h-3.5 w-3.5" />
          {row.original.failed}
        </span>
        <span className="text-xs text-muted-foreground">/ {row.original.total_rules}</span>
      </div>
    ),
  },
  {
    accessorKey: "docker_version",
    header: "Docker",
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.docker_version}</span>,
  },
  {
    accessorKey: "ran_at",
    header: "Ran",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(row.original.ran_at), { addSuffix: true })}
      </span>
    ),
  },
];

function AdminAuditsPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminService.getDashboardStats,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "audits"],
    queryFn: adminService.getAdminAudits,
  });

  const audits = data?.audits ?? [];
  const criticalAudits = audits.filter((audit) => audit.score < 60).length;
  const failedChecks = audits.reduce((sum, audit) => sum + audit.failed, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audits</h1>
          <p className="text-muted-foreground">
            Review audit history and identify the riskiest hosts quickly.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Audits"
          value={stats?.total_audits ?? 0}
          description="All saved audit runs"
          icon={ClipboardCheck}
          iconWrapClassName="bg-blue-100 dark:bg-blue-950/30"
          iconClassName="text-blue-600"
        />
        <SummaryCard
          title="Average Score"
          value={`${Math.round(stats?.average_score ?? 0)}%`}
          description="Across recorded audit results"
          icon={Shield}
          iconWrapClassName="bg-emerald-100 dark:bg-emerald-950/30"
          iconClassName="text-emerald-600"
        />
        <SummaryCard
          title="This Month"
          value={stats?.audits_this_month ?? 0}
          description="Audits executed this month"
          icon={RefreshCw}
          iconWrapClassName="bg-amber-100 dark:bg-amber-950/30"
          iconClassName="text-amber-600"
        />
        <SummaryCard
          title="Critical Results"
          value={criticalAudits}
          description={`${failedChecks} failed checks across all records`}
          icon={AlertTriangle}
          iconWrapClassName="bg-red-100 dark:bg-red-950/30"
          iconClassName="text-red-600"
        />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Audit History</h2>
          <p className="text-sm text-muted-foreground">
            Latest runs first. Use this page to compare score, host, and failed checks across agents.
          </p>
        </div>

        {isError ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Failed to load audit history.
          </div>
        ) : isLoading || statsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <DataTable
            data={audits}
            columns={columns}
            rowId="id"
            searchPlaceholder="Search agents, owners, or Docker versions..."
          />
        )}
      </div>
    </div>
  );
}
