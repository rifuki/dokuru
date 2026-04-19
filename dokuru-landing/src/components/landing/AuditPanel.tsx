import { CheckCircle2, XCircle, AlertTriangle, Zap, BookOpen, Wrench, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type Sev = "PASS" | "WARN" | "FAIL";
type Rem = "AUTO" | "GUIDED" | "MANUAL" | null;

const FINDINGS: { id: string; title: string; sev: Sev; rem: Rem }[] = [
  { id: "1.1.1", title: "Audit rule for docker daemon",   sev: "FAIL", rem: "AUTO" },
  { id: "2.1",   title: "TLS not configured on daemon",   sev: "FAIL", rem: "GUIDED" },
  { id: "3.1",   title: "Docker socket permissions ok",   sev: "PASS", rem: null },
  { id: "5.4",   title: "Privileged container detected",  sev: "FAIL", rem: "AUTO" },
  { id: "5.10",  title: "Memory limit not set",           sev: "WARN", rem: "AUTO" },
  { id: "5.5",   title: "AppArmor profile enabled",       sev: "PASS", rem: null },
];

const SCORE = 62;

function SevIcon({ s }: { s: Sev }) {
  if (s === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (s === "WARN") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
}

function RemBadge({ r }: { r: Rem }) {
  if (!r) return null;
  const cfg = {
    AUTO:   { cls: "text-primary bg-primary/10 border-primary/25",                            icon: Zap,      label: "AUTO" },
    GUIDED: { cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",  icon: BookOpen, label: "GUIDED" },
    MANUAL: { cls: "text-muted-foreground bg-muted border-border",                            icon: Wrench,   label: "MANUAL" },
  }[r];
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold shrink-0 uppercase tracking-wide", cfg.cls)}>
      <cfg.icon className="h-2.5 w-2.5" />{cfg.label}
    </span>
  );
}

export function AuditPanel() {
  const barCls = SCORE >= 80 ? "bg-emerald-500" : SCORE >= 60 ? "bg-amber-500" : "bg-rose-500";
  const numCls = SCORE >= 80 ? "text-emerald-500" : SCORE >= 60 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="relative w-full">
      <div className="absolute -inset-8 bg-primary/8 rounded-[2.5rem] blur-3xl pointer-events-none" />
      <div className="relative rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        {/* Terminal bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-3 text-xs font-mono text-muted-foreground">dokuru / prod-web-01</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
            audit · 12s ago
          </div>
        </div>

        <div className="grid sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {/* Score */}
          <div className="sm:col-span-2 p-5 space-y-4">
            <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">
              Audit Score
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-5xl font-bold tabular-nums", numCls)}>{SCORE}</span>
              <span className="text-sm text-muted-foreground font-mono">/ 100</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", barCls)} style={{ width: `${SCORE}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "PASS",  val: 22, cls: "text-emerald-500" },
                { label: "FAIL",  val: 13, cls: "text-rose-500" },
                { label: "TOTAL", val: 35, cls: "text-muted-foreground" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="rounded-xl border border-border bg-muted/20 py-2.5">
                  <div className={cn("text-lg font-bold", cls)}>{val}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Findings */}
          <div className="sm:col-span-3 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">Findings</span>
              <span className="text-[10px] font-mono text-muted-foreground">CIS Docker · v1.8.0</span>
            </div>
            <ul className="flex-1 divide-y divide-border">
              {FINDINGS.map((f) => (
                <li key={f.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <SevIcon s={f.sev} />
                  <span className="font-mono text-[10px] text-muted-foreground w-8 shrink-0">{f.id}</span>
                  <span className="text-xs flex-1 truncate">{f.title}</span>
                  <RemBadge r={f.rem} />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
              <span className="text-[10px] font-mono text-muted-foreground">6 of 35 shown</span>
              <a
                href="https://app.dokuru.rifuki.dev"
                className="text-[10px] font-mono text-primary hover:underline"
              >
                Apply auto-fixes →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
