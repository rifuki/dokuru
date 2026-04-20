// @ts-nocheck
import { ShieldCheck, Wrench, LifeBuoy, Clock, Box, Gauge, Shield } from "lucide-react";
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

const sections = [
  {
    name: "Namespace Isolation",
    icon: <Box size={10} />,
    color: "text-blue-400 border-blue-500/30",
    barColor: "bg-blue-500",
    passed: 1,
    failed: 1,
    total: 5,
    rules: [
      { rule: "2.8 User namespace remapping", sev: "PASS", rem: "OK", detail: "userns-remap: default" },
      { rule: "5.9 Host network namespace", sev: "FAIL", rem: "GUIDED", detail: "1 container using --net=host" },
    ],
  },
  {
    name: "Cgroup Controls",
    icon: <Gauge size={10} />,
    color: "text-amber-400 border-amber-500/30",
    barColor: "bg-amber-500",
    passed: 2,
    failed: 1,
    total: 5,
    rules: [
      { rule: "5.11 Memory limit", sev: "WARN", rem: "AUTO", detail: "3 containers without --memory" },
    ],
  },
  {
    name: "Runtime Hardening",
    icon: <Shield size={10} />,
    color: "text-rose-400 border-rose-500/30",
    barColor: "bg-rose-500",
    passed: 3,
    failed: 2,
    total: 6,
    rules: [
      { rule: "5.4 Privileged containers", sev: "FAIL", rem: "AUTO", detail: "2 containers with --privileged" },
    ],
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
      <div className="p-4 flex flex-col gap-4 relative">
        {/* Score row */}
        <div className="flex items-end justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
              audit score
            </div>
            <div className="flex items-baseline gap-1 font-heading">
              <span
                className="text-4xl font-black text-emerald-400 leading-none"
                data-testid="audit-score-value"
              >
                78
              </span>
              <span className="text-base text-zinc-600 font-bold">/ 100</span>
            </div>
            <div className="mt-1 text-[10px] text-zinc-500 font-mono">
              CIS-aligned · 42 rules evaluated
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-sm bg-rose-500" />
              <span className="font-mono text-[10px] text-zinc-300">
                <span className="text-rose-400 font-semibold">7</span> failed
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-sm bg-amber-400" />
              <span className="font-mono text-[10px] text-zinc-300">
                <span className="text-amber-400 font-semibold">3</span> warnings
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-sm bg-emerald-400" />
              <span className="font-mono text-[10px] text-zinc-300">
                <span className="text-emerald-400 font-semibold">32</span> passed
              </span>
            </div>
          </div>
        </div>

        {/* Section breakdown */}
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-0.5">
            security pillars
          </div>

          {sections.map((section, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {/* Section header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded border ${section.color} bg-white/[0.02]`}>
                    {section.icon}
                    {section.name}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-600">
                    {section.passed}/{section.total}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${section.barColor}`}
                  style={{ width: `${(section.passed / section.total) * 100}%` }}
                />
              </div>

              {/* Sample rules */}
              {section.rules.map((rule, j) => (
                <div
                  key={j}
                  className="flex items-center justify-between gap-2 p-1.5 rounded bg-white/[0.02] border border-white/5"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <SeverityChip kind={rule.sev} />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-zinc-200 truncate">
                        {rule.rule}
                      </div>
                      <div className="font-mono text-[9px] text-zinc-500 truncate">
                        {rule.detail}
                      </div>
                    </div>
                  </div>
                  <RemediationPill kind={rule.rem} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* footer bar */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3 -mb-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            run · 2s ago
          </div>
          <div className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#2496ED]">
            apply auto-fixes (3)
            <span>→</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditPanel;
