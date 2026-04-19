import { CheckCircle2, XCircle, AlertTriangle, Zap, BookOpen, Wrench, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "PASS" | "WARN" | "FAIL";
type Remediation = "AUTO" | "GUIDED" | "MANUAL" | null;

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  remediation: Remediation;
}

const FINDINGS: Finding[] = [
  { id: "1.1.1", title: "Ensure audit for docker daemon", severity: "FAIL", remediation: "AUTO" },
  { id: "2.1",   title: "TLS not configured on daemon",   severity: "FAIL", remediation: "GUIDED" },
  { id: "3.1",   title: "Docker socket permissions ok",   severity: "PASS", remediation: null },
  { id: "5.4",   title: "Privileged container detected",  severity: "FAIL", remediation: "AUTO" },
  { id: "5.10",  title: "Memory limit not set",           severity: "WARN", remediation: "AUTO" },
  { id: "5.5",   title: "AppArmor profile enabled",       severity: "PASS", remediation: null },
];

const SCORE = 62;
const PASSED = 22;
const FAILED = 13;
const TOTAL = 35;

function StatusIcon({ s }: { s: Severity }) {
  if (s === "PASS") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  if (s === "WARN") return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
}

function RemBadge({ r }: { r: Remediation }) {
  if (!r) return null;
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    AUTO:   { cls: "text-primary bg-primary/10 border-primary/30",           icon: <Zap className="h-2.5 w-2.5" />,     label: "AUTO" },
    GUIDED: { cls: "text-secondary-foreground bg-secondary/20 border-secondary/30", icon: <BookOpen className="h-2.5 w-2.5" />, label: "GUIDED" },
    MANUAL: { cls: "text-muted-foreground bg-muted border-border",           icon: <Wrench className="h-2.5 w-2.5" />,  label: "MANUAL" },
  };
  const { cls, icon, label } = map[r];
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border shrink-0", cls)}>
      {icon}{label}
    </span>
  );
}

export function AuditPanel() {
  const scoreColor =
    SCORE >= 80 ? "text-green-500" : SCORE >= 60 ? "text-yellow-500" : "text-red-500";
  const barColor =
    SCORE >= 80 ? "bg-green-500" : SCORE >= 60 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="relative w-full">
      {/* Glow behind card */}
      <div className="absolute -inset-4 bg-primary/10 rounded-3xl blur-2xl pointer-events-none" />

      <div className="relative rounded-2xl border border-border bg-card overflow-hidden glow-sm">
        {/* Terminal header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs font-mono text-muted-foreground">
              dokuru / prod-web-01
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-green-500 animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground">audit · 12s ago</span>
          </div>
        </div>

        {/* Body: score left | findings right */}
        <div className="grid grid-cols-1 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {/* Left: Score */}
          <div className="sm:col-span-2 p-4 space-y-3">
            <p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground">
              Audit Score
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className={cn("text-4xl font-bold tabular-nums", scoreColor)}>{SCORE}</span>
              <span className="text-sm text-muted-foreground font-mono">/ 100</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", barColor)}
                style={{ width: `${SCORE}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "PASS", value: PASSED, color: "text-green-500" },
                { label: "FAIL", value: FAILED, color: "text-red-500" },
                { label: "TOTAL", value: TOTAL, color: "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/20 py-2">
                  <div className={cn("text-lg font-bold", color)}>{value}</div>
                  <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Findings */}
          <div className="sm:col-span-3">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">Findings</span>
              <span className="text-[10px] font-mono text-muted-foreground">CIS Docker · v1.8.0</span>
            </div>
            <ul className="divide-y divide-border">
              {FINDINGS.map((f) => (
                <li key={f.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <StatusIcon s={f.severity} />
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-9">{f.id}</span>
                  <span className="text-xs flex-1 truncate">{f.title}</span>
                  <RemBadge r={f.remediation} />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
              <span className="text-[10px] text-muted-foreground font-mono">
                {FINDINGS.length} of {TOTAL} shown
              </span>
              <a
                href="https://app.dokuru.rifuki.dev"
                className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
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
