// @ts-nocheck
import { ShieldCheck, Wrench, LifeBuoy, Clock } from "lucide-react";
import type { ReactNode } from "react";

type SeverityKind = "FAIL" | "PASS" | "WARN";
type RemediationKind = "AUTO" | "GUIDED" | "MANUAL" | "OK";

const SeverityChip = ({ kind }: { kind: SeverityKind }) => {
  const map: Record<SeverityKind, string> = {
    FAIL: "text-rose-400 border-rose-500/30 bg-rose-500/10",
    PASS: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    WARN: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  };
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border ${map[kind]}`}
      data-testid={`severity-${kind.toLowerCase()}`}
    >
      {kind}
    </span>
  );
};

const RemediationPill = ({ kind }: { kind: RemediationKind }) => {
  const map: Record<RemediationKind, { cls: string; icon: ReactNode }> = {
    AUTO: {
      cls: "text-[#2496ED] bg-[#2496ED]/10 border-[#2496ED]/30",
      icon: <Wrench size={10} strokeWidth={2.5} />,
    },
    GUIDED: {
      cls: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
      icon: <LifeBuoy size={10} strokeWidth={2.5} />,
    },
    MANUAL: {
      cls: "text-zinc-300 bg-white/5 border-white/15",
      icon: <Clock size={10} strokeWidth={2.5} />,
    },
    OK: {
      cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      icon: <ShieldCheck size={10} strokeWidth={2.5} />,
    },
  };
  const { cls, icon } = map[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}
      data-testid={`remediation-${kind.toLowerCase()}`}
    >
      {icon}
      {kind}
    </span>
  );
};

const findings = [
  {
    rule: "5.4  Privileged containers detected",
    group: "runtime",
    sev: "FAIL",
    rem: "AUTO",
    detail: "2 containers running with --privileged",
  },
  {
    rule: "2.8  User namespace remapping enabled",
    group: "namespace",
    sev: "PASS",
    rem: "OK",
    detail: "userns-remap: default",
  },
  {
    rule: "5.9  Host network namespace shared",
    group: "namespace",
    sev: "FAIL",
    rem: "GUIDED",
    detail: "1 container using network_mode: host",
  },
  {
    rule: "5.11 Memory limit not set",
    group: "cgroup",
    sev: "WARN",
    rem: "AUTO",
    detail: "3 containers without --memory",
  },
  {
    rule: "5.31 Docker socket mounted",
    group: "runtime",
    sev: "FAIL",
    rem: "MANUAL",
    detail: "/var/run/docker.sock bind-mount",
  },
];

const AuditPanel = () => {
  return (
    <div
      data-testid="hero-audit-panel"
      className="relative w-full rounded-xl border border-white/10 bg-[#09090B] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
    >
      {/* subtle scan line */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
        <div className="scan-line absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#2496ED]/10 to-transparent" />
      </div>

      {/* Terminal-style top bar */}
      <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#121214]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        </div>
        <span className="font-mono text-[11px] text-zinc-500 ml-3">
          dokuru-agent <span className="text-zinc-700">~</span>{" "}
          <span className="text-zinc-400">target:</span>{" "}
          <span className="text-[#2496ED]">prod-cluster-01</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          live
        </span>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col gap-6 relative">
        {/* Score row */}
        <div className="flex items-end justify-between gap-6 border-b border-white/5 pb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
              audit score
            </div>
            <div className="flex items-baseline gap-1 font-heading">
              <span
                className="text-6xl font-black text-emerald-400 leading-none"
                data-testid="audit-score-value"
              >
                78
              </span>
              <span className="text-xl text-zinc-600 font-bold">/ 100</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500 font-mono">
              CIS-aligned · 42 rules evaluated
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-rose-500" />
              <span className="font-mono text-xs text-zinc-300">
                <span className="text-rose-400 font-semibold">7</span> failed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-amber-400" />
              <span className="font-mono text-xs text-zinc-300">
                <span className="text-amber-400 font-semibold">3</span> warnings
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />
              <span className="font-mono text-xs text-zinc-300">
                <span className="text-emerald-400 font-semibold">32</span> passed
              </span>
            </div>
          </div>
        </div>

        {/* Findings list */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              findings
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              rule · evidence · fix
            </div>
          </div>

          {findings.map((f, i) => (
            <div
              key={i}
              data-testid={`finding-row-${i}`}
              className="group flex items-center justify-between gap-3 p-3 rounded-md bg-white/[0.02] border border-white/5 hover:border-white/15 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <SeverityChip kind={f.sev} />
                <div className="min-w-0">
                  <div className="font-mono text-[13px] text-zinc-200 truncate">
                    {f.rule}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500 truncate">
                    {f.detail}
                  </div>
                </div>
              </div>
              <RemediationPill kind={f.rem} />
            </div>
          ))}
        </div>

        {/* footer bar */}
        <div className="flex items-center justify-between border-t border-white/5 pt-4 -mb-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            run · 2s ago
          </div>
          <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#2496ED]">
            apply auto-fixes (3)
            <span>→</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditPanel;
