import { Clock, Container, Cpu, Download, Eye, Loader2, Server, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { cn } from "@/lib/utils";

type AuditSummaryCardProps = {
  audit: AuditResponse;
  onOpen: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  className?: string;
};

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      label: "Healthy",
      accent: "#10b981",
      soft: "rgba(16, 185, 129, 0.1)",
    };
  }

  if (score >= 60) {
    return {
      label: "Attention",
      accent: "#f59e0b",
      soft: "rgba(245, 158, 11, 0.1)",
    };
  }

  return {
    label: "Critical",
    accent: "#f43f5e",
    soft: "rgba(244, 63, 94, 0.1)",
  };
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AuditSummaryCard({ audit, onOpen, onExport, onDelete, isDeleting, className }: AuditSummaryCardProps) {
  const tone = scoreTone(audit.summary.score);
  const actionGridClass = onDelete ? "grid-cols-3" : onExport ? "grid-cols-2" : "grid-cols-1";

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-[18px] border border-border bg-card/90 shadow-sm transition-colors hover:border-primary/25 dark:bg-white/[0.025]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-stretch lg:p-5">
        <div className="grid min-w-0 gap-4 md:grid-cols-[168px_minmax(0,1fr)] md:items-stretch">
          <div className="rounded-[14px] border border-border bg-background/45 p-4 dark:bg-black/10">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Score</span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ color: tone.accent, backgroundColor: tone.soft }}
              >
                {tone.label}
              </span>
            </div>
            <div className="mt-4 flex items-end gap-1.5">
              <span className="text-5xl font-black leading-none tracking-tight text-foreground tabular-nums md:text-4xl">
                {audit.summary.score}
              </span>
              <span className="pb-1 text-sm font-semibold text-muted-foreground/55">/100</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${audit.summary.score}%`, backgroundColor: tone.accent }}
              />
            </div>
          </div>

          <div className="min-w-0 rounded-[14px] border border-border bg-background/25 p-4 dark:bg-black/[0.06]">
            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-base font-semibold text-foreground">{fmtDate(audit.timestamp)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground xl:grid-cols-3">
                  <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 dark:bg-black/10">
                    <Server className="h-4 w-4 shrink-0" />
                    <span className="truncate">{audit.hostname}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 dark:bg-black/10">
                    <Cpu className="h-4 w-4 shrink-0" />
                    <span className="truncate">Docker {audit.docker_version}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 dark:bg-black/10">
                    <Container className="h-4 w-4 shrink-0" />
                    <span className="truncate">{audit.total_containers} containers</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-border/80 bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-2xl font-black leading-none tabular-nums" style={{ color: "#10b981" }}>{audit.summary.passed}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Passed</p>
              </div>
              <div className="rounded-[10px] border border-border/80 bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-2xl font-black leading-none tabular-nums" style={{ color: "#fb7185" }}>{audit.summary.failed}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Failed</p>
              </div>
              <div className="rounded-[10px] border border-border/80 bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-2xl font-black leading-none text-foreground/85 tabular-nums">{audit.summary.total}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-background/35 p-3 dark:bg-black/10">
          <div className="flex items-center justify-between gap-3 lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Actions</p>
            <p className="hidden text-xs text-muted-foreground lg:mt-1 lg:block">Choose what to do with this saved result.</p>
          </div>
          <div className={cn("mt-3 grid gap-2", actionGridClass, "lg:grid-cols-1")}>
            <Button type="button" size="sm" onClick={onOpen} className="w-full justify-start">
              <Eye className="h-4 w-4" />
              View
            </Button>
            {onExport && (
              <Button type="button" variant="outline" size="sm" onClick={onExport} className="w-full justify-start">
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
