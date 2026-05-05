import { Clock, Container, Download, Eye, Loader2, Server, Trash2 } from "lucide-react";
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
        "group relative w-full overflow-hidden rounded-[20px] border border-border bg-card shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md dark:bg-white/[0.02]",
        className,
      )}
    >
      <div className="grid gap-0 p-5 lg:grid-cols-[180px_minmax(0,1fr)_180px] lg:divide-x lg:divide-border/50 lg:items-center">
        
        {/* SCORE */}
        <div className="p-2 lg:pr-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ color: tone.accent, backgroundColor: tone.soft }}
            >
              {tone.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-black text-foreground tabular-nums tracking-tight">{audit.summary.score}</span>
            <span className="text-base font-bold text-muted-foreground/40">/100</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary/50">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${audit.summary.score}%`, backgroundColor: tone.accent }}
            />
          </div>
        </div>

        {/* MIDDLE: INFO & STATS */}
        <div className="p-2 lg:px-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm font-semibold text-foreground">{fmtDate(audit.timestamp)}</span>
          </div>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
             <div className="flex flex-1 gap-2">
                <div className="flex-1 flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 p-3 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Pass</div>
                   <div className="text-2xl font-black text-emerald-500 tabular-nums leading-none">{audit.summary.passed}</div>
                </div>
                <div className="flex-1 flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 p-3 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Fail</div>
                   <div className="text-2xl font-black text-rose-500 tabular-nums leading-none">{audit.summary.failed}</div>
                </div>
                <div className="flex-1 flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 p-3 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Total</div>
                   <div className="text-2xl font-black text-foreground/80 tabular-nums leading-none">{audit.summary.total}</div>
                </div>
             </div>
             
             <div className="flex-[1.2] flex flex-col gap-2">
                <div className="flex flex-1 items-center gap-3 rounded-lg border border-border/50 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/20">
                    <Server className="h-4 w-4 shrink-0 text-foreground/60" />
                    <span className="truncate">{audit.hostname}</span>
                </div>
                <div className="flex flex-1 items-center gap-3 rounded-lg border border-border/50 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/20">
                    <Container className="h-4 w-4 shrink-0 text-foreground/60" />
                    <span className="truncate">{audit.total_containers} containers • Docker {audit.docker_version}</span>
                </div>
             </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="p-2 lg:pl-6 flex flex-col justify-center">
          <div className="mb-3 hidden lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Actions</p>
          </div>
          <div className={cn("grid gap-2", actionGridClass, "lg:grid-cols-1")}>
            <Button type="button" size="sm" onClick={onOpen} className="w-full justify-start font-bold">
              <Eye className="h-4 w-4 mr-2 opacity-80" />
              View
            </Button>
            {onExport && (
              <Button type="button" variant="outline" size="sm" onClick={onExport} className="w-full justify-start text-muted-foreground">
                <Download className="h-4 w-4 mr-2 opacity-70" />
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
                {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2 opacity-70" />}
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
