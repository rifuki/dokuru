import { ChevronRight, Clock, Container, Cpu, Download, ExternalLink, Loader2, MoreHorizontal, Server, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      border: "rgba(16, 185, 129, 0.26)",
    };
  }

  if (score >= 60) {
    return {
      label: "Attention",
      accent: "#f59e0b",
      soft: "rgba(245, 158, 11, 0.1)",
      border: "rgba(245, 158, 11, 0.26)",
    };
  }

  return {
    label: "Critical",
    accent: "#f43f5e",
    soft: "rgba(244, 63, 94, 0.1)",
    border: "rgba(244, 63, 94, 0.26)",
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
  const hasActions = !!onExport || !!onDelete;

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-[18px] border border-border bg-card/90 text-left shadow-sm transition-colors hover:border-primary/25 hover:bg-muted/15 dark:bg-white/[0.025]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <button type="button" onClick={onOpen} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45">
        <div className="grid gap-4 p-4 pr-14 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-center md:p-5 md:pr-16">
          <div
            className="rounded-[14px] border bg-muted/10 px-4 py-3"
            style={{ borderColor: tone.border, backgroundColor: tone.soft }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Score</span>
              <span className="text-[11px] font-semibold" style={{ color: tone.accent }}>{tone.label}</span>
            </div>
            <div className="mt-3 flex items-end gap-1.5">
              <span className="text-4xl font-black leading-none tracking-tight text-foreground tabular-nums">
                {audit.summary.score}
              </span>
              <span className="pb-1 text-sm font-semibold text-muted-foreground/60">/100</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${audit.summary.score}%`, backgroundColor: tone.accent }}
              />
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-base font-semibold text-foreground">{fmtDate(audit.timestamp)}</span>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <Server className="h-4 w-4 shrink-0" />
                <span className="truncate">{audit.hostname}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Cpu className="h-4 w-4 shrink-0" />
                <span className="truncate">Docker {audit.docker_version}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Container className="h-4 w-4 shrink-0" />
                <span className="truncate">{audit.total_containers} containers</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[10px] border border-border bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-xl font-black leading-none tabular-nums" style={{ color: "#10b981" }}>{audit.summary.passed}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Passed</p>
              </div>
              <div className="rounded-[10px] border border-border bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-xl font-black leading-none tabular-nums" style={{ color: "#fb7185" }}>{audit.summary.failed}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Failed</p>
              </div>
              <div className="rounded-[10px] border border-border bg-background/45 px-3 py-2 dark:bg-black/10">
                <p className="text-xl font-black leading-none text-foreground/85 tabular-nums">{audit.summary.total}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Total</p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors group-hover:text-primary md:flex">
            <span>Open</span>
            <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </button>

      {hasActions && (
        <div className="absolute right-3 top-3 md:right-4 md:top-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full bg-background/70 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground dark:bg-black/20 dark:hover:bg-black/35"
                aria-label="Audit actions"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen}>
                <ExternalLink className="h-4 w-4" />
                Open Audit
              </DropdownMenuItem>
              {onExport && (
                <DropdownMenuItem onClick={onExport}>
                  <Download className="h-4 w-4" />
                  Download JSON
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={isDeleting} onClick={onDelete}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete Audit
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
