import { Clock, Container, Download, Eye, Loader2, Server, Trash2, Printer, FileJson, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { cn } from "@/lib/utils";

type AuditSummaryCardProps = {
  audit: AuditResponse;
  onOpen: () => void;
  onExport?: (format: "pdf" | "html" | "json") => void;
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

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-[16px] border border-border bg-card shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md dark:bg-white/[0.02]",
        className,
      )}
    >
      <div className="grid gap-0 p-4 lg:grid-cols-[160px_minmax(0,1fr)_160px] lg:divide-x lg:divide-border/50 lg:items-center">
        
        {/* SCORE */}
        <div className="py-1 lg:pr-5 lg:py-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score</span>
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={{ color: tone.accent, backgroundColor: tone.soft }}
            >
              {tone.label}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-foreground tabular-nums tracking-tight leading-none">{audit.summary.score}</span>
            <span className="text-sm font-bold text-muted-foreground/40">/100</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary/50">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${audit.summary.score}%`, backgroundColor: tone.accent }}
            />
          </div>
        </div>

        {/* MIDDLE: INFO & STATS */}
        <div className="py-3 lg:px-6 lg:py-0">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[13px] font-semibold text-foreground">{fmtDate(audit.timestamp)}</span>
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
             <div className="flex gap-2">
                <div className="w-[64px] flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 py-2 px-1 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Pass</div>
                   <div className="text-xl font-black text-emerald-500 tabular-nums leading-none">{audit.summary.passed}</div>
                </div>
                <div className="w-[64px] flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 py-2 px-1 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Fail</div>
                   <div className="text-xl font-black text-rose-500 tabular-nums leading-none">{audit.summary.failed}</div>
                </div>
                <div className="w-[64px] flex flex-col justify-center rounded-xl border border-border/50 bg-secondary/20 py-2 px-1 text-center transition-colors hover:bg-secondary/30">
                   <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Total</div>
                   <div className="text-xl font-black text-foreground/80 tabular-nums leading-none">{audit.summary.total}</div>
                </div>
             </div>
             
             <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-secondary/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/20">
                    <Server className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                    <span className="truncate">{audit.hostname}</span>
                </div>
                <div className="flex w-full items-center gap-2.5 rounded-lg border border-border/50 bg-secondary/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/20">
                    <Container className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                    <span className="truncate">{audit.total_containers} containers • Docker {audit.docker_version}</span>
                </div>
             </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="py-2 lg:pl-5 lg:py-0 flex flex-col justify-center">
          <div className="mb-2.5 hidden lg:block">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Actions</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" onClick={onOpen} className="col-span-2 w-full justify-start h-8 text-xs font-bold">
              <Eye className="h-3.5 w-3.5 mr-2 opacity-80" />
              View
            </Button>
            {onExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className={cn("h-8 text-xs text-muted-foreground", onDelete ? "col-span-1 justify-center px-0" : "col-span-2 justify-start")}
                    title="Export Audit"
                  >
                    <Download className={cn("h-3.5 w-3.5 opacity-70", !onDelete && "mr-2")} />
                    {!onDelete && "Export"}
                    {!onDelete && <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-fit min-w-0">
                  <DropdownMenuLabel className="whitespace-nowrap pr-4">Document Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="whitespace-nowrap pr-4" onClick={() => onExport("pdf")}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print / Save PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem className="whitespace-nowrap pr-4" onClick={() => onExport("html")}>
                    <Download className="h-4 w-4 mr-2" />
                    Download HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem className="whitespace-nowrap pr-4" onClick={() => onExport("json")}>
                    <FileJson className="h-4 w-4 mr-2" />
                    Download JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className={cn("h-8 text-xs text-destructive hover:bg-destructive dark:hover:bg-destructive hover:text-white dark:hover:text-white transition-colors", onExport ? "col-span-1 justify-center px-0" : "col-span-2 justify-start")}
                title="Delete Audit"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {!onExport && "Delete"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
