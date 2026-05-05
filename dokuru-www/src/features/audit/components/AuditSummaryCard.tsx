import { ChevronRight, Clock, Container, Cpu, Server, ShieldCheck } from "lucide-react";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { cn } from "@/lib/utils";

type AuditSummaryCardProps = {
  audit: AuditResponse;
  onOpen: () => void;
  className?: string;
};

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      label: "Healthy posture",
      hex: "#10b981",
      text: "text-emerald-400",
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/10",
    };
  }

  if (score >= 60) {
    return {
      label: "Needs attention",
      hex: "#f59e0b",
      text: "text-amber-400",
      border: "border-amber-500/25",
      bg: "bg-amber-500/10",
    };
  }

  return {
    label: "Critical exposure",
    hex: "#f43f5e",
    text: "text-rose-400",
    border: "border-rose-500/25",
    bg: "bg-rose-500/10",
  };
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AuditSummaryCard({ audit, onOpen, className }: AuditSummaryCardProps) {
  const tone = scoreTone(audit.summary.score);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (audit.summary.score / 100) * circumference;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-full overflow-hidden rounded-[22px] border border-border bg-card/95 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20 dark:bg-white/[0.035]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="relative flex size-20 shrink-0 items-center justify-center sm:size-24">
          <svg className="size-full -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted-foreground/10" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={tone.hex}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="drop-shadow-sm transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-2xl font-black leading-none tabular-nums sm:text-3xl", tone.text)}>
              {audit.summary.score}
            </span>
            <span className="mt-1 text-[10px] font-bold text-muted-foreground/60">/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-sm font-semibold text-foreground sm:text-base">{fmtDate(audit.timestamp)}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]", tone.border, tone.bg, tone.text)}>
              <ShieldCheck className="h-3 w-3" />
              {tone.label}
            </span>
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <Server className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{audit.hostname}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Docker {audit.docker_version}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Container className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{audit.total_containers} containers</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[12px] border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
              <p className="text-lg font-black leading-none text-emerald-400 tabular-nums">{audit.summary.passed}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Passed</p>
            </div>
            <div className="rounded-[12px] border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2">
              <p className="text-lg font-black leading-none text-rose-400 tabular-nums">{audit.summary.failed}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Failed</p>
            </div>
            <div className="rounded-[12px] border border-border bg-muted/10 px-3 py-2">
              <p className="text-lg font-black leading-none text-foreground/85 tabular-nums">{audit.summary.total}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Total</p>
            </div>
          </div>
        </div>

        <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary sm:block" />
      </div>
    </button>
  );
}
