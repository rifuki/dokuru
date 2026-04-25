import {
    Sheet, SheetContent, SheetHeader,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, XCircle, Zap,
    RefreshCw, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isNamespaceRecreateRule } from "@/features/audit/hooks/useFix";
import type { FixAllStep, RuleFixStatus } from "@/features/audit/hooks/useFixAll";

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { key: FixAllStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

function StepIndicator({ current }: { current: FixAllStep }) {
    const idx = STEPS.findIndex(s => s.key === current);
    return (
        <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center">
                    <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                            "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                            i < idx  ? "bg-[#2496ED] border-[#2496ED] text-white"
                            : i === idx ? "border-[#2496ED] text-[#2496ED] bg-[#2496ED]/10"
                            : "border-white/15 text-white/20 bg-transparent"
                        )}>
                            {i < idx ? <Check size={10} strokeWidth={3} /> : i + 1}
                        </div>
                        <span className={cn(
                            "text-[9px] uppercase tracking-[0.18em] font-mono whitespace-nowrap",
                            i === idx ? "text-[#2496ED]" : i < idx ? "text-white/50" : "text-white/20"
                        )}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                        <div className={cn("w-10 h-px mx-1 mb-4 transition-all", i < idx ? "bg-[#2496ED]/60" : "bg-white/10")} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({ rs, showOutcome }: { rs: RuleFixStatus; showOutcome: boolean }) {
    const isRecreate = isNamespaceRecreateRule(rs.ruleId);
    const applied = rs.outcome?.status === "Applied";

    return (
        <div className={cn(
            "flex items-start gap-3 px-3 py-2.5 text-xs",
            rs.state === "applying" && "bg-[#2496ED]/5"
        )}>
            {/* Status icon */}
            <div className="mt-px shrink-0 w-4 flex justify-center">
                {rs.state === "done"
                    ? applied
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        : <XCircle className="h-3.5 w-3.5 text-rose-400" />
                    : rs.state === "applying"
                    ? <Loader2 className="h-3.5 w-3.5 text-[#2496ED] animate-spin" />
                    : <span className="inline-block w-3 h-3 rounded-full border border-white/15 mt-0.5" />
                }
            </div>

            {/* Rule info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-white/60 text-[11px]">{rs.ruleId}</span>
                    {isRecreate && (
                        <span className="text-[9px] font-mono text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            recreate
                        </span>
                    )}
                </div>
                <p className={cn(
                    "text-[11px] mt-0.5 leading-snug truncate",
                    rs.state === "done"
                        ? applied ? "text-emerald-400/80" : "text-rose-400/80"
                        : rs.state === "applying" ? "text-white/80"
                        : "text-white/30"
                )}>
                    {rs.state === "done" && rs.outcome
                        ? rs.outcome.message.slice(0, 72)
                        : rs.title}
                </p>
            </div>

            {/* Right badge */}
            {showOutcome && rs.state === "done" && (
                <span className={cn(
                    "text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border shrink-0",
                    applied
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/25"
                )}>
                    {applied ? "applied" : "blocked"}
                </span>
            )}
            {!showOutcome && rs.state === "pending" && (
                <span className="text-[9px] font-mono text-white/20 shrink-0">pending</span>
            )}
        </div>
    );
}

// ── Confirm step ──────────────────────────────────────────────────────────────

function ConfirmStep({
    ruleStatuses, onConfirm, onCancel,
}: {
    ruleStatuses: RuleFixStatus[];
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const recreateCount = ruleStatuses.filter(r => isNamespaceRecreateRule(r.ruleId)).length;

    return (
        <div className="flex flex-col gap-5">
            {recreateCount > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-400">
                            {recreateCount} rule{recreateCount > 1 ? "s" : ""} require container restart
                        </p>
                        <p className="text-xs text-amber-400/70 leading-relaxed">
                            Namespace and privileged flags require stop → recreate → start. Expect ~5 seconds of downtime per affected container.
                        </p>
                    </div>
                </div>
            )}

            <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mb-2">
                    {ruleStatuses.length} rules will be fixed
                </p>
                <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
                    {ruleStatuses.map(rs => (
                        <RuleRow key={rs.ruleId} rs={rs} showOutcome={false} />
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onCancel}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all hover:shadow-[0_0_24px_-4px_rgba(36,150,237,0.65)] active:scale-[0.98]"
                >
                    <Zap className="h-3.5 w-3.5" />
                    Apply All {ruleStatuses.length} Fixes
                </button>
            </div>
        </div>
    );
}

// ── Applying step ─────────────────────────────────────────────────────────────

function ApplyingStep({
    ruleStatuses, currentIndex,
}: {
    ruleStatuses: RuleFixStatus[];
    currentIndex: number;
}) {
    const done = ruleStatuses.filter(r => r.state === "done").length;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Loader2 className="h-4 w-4 text-[#2496ED] animate-spin shrink-0" />
                    <span className="text-sm font-semibold text-[#2496ED] font-mono">
                        Applying fixes…
                    </span>
                </div>
                <span className="text-xs font-mono text-white/40">
                    {done}/{ruleStatuses.length}
                </span>
            </div>

            {/* Overall progress bar */}
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                    className="h-full rounded-full bg-[#2496ED] transition-all duration-500"
                    style={{ width: `${ruleStatuses.length > 0 ? (done / ruleStatuses.length) * 100 : 0}%` }}
                />
            </div>

            <div className="rounded-lg border border-white/8 bg-[#050507] overflow-hidden divide-y divide-white/5">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.015]">
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                        dokuru-agent · sequential fix
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-[#2496ED]/60 uppercase tracking-[0.15em]">
                        {currentIndex + 1}/{ruleStatuses.length}
                    </span>
                </div>
                {ruleStatuses.map(rs => (
                    <RuleRow key={rs.ruleId} rs={rs} showOutcome={true} />
                ))}
            </div>

            <p className="text-[11px] text-white/30 font-mono text-center">
                Do not close this panel while fixes are in progress
            </p>
        </div>
    );
}

// ── Result step ───────────────────────────────────────────────────────────────

function ResultStep({
    ruleStatuses, onRerunAudit, onClose,
}: {
    ruleStatuses: RuleFixStatus[];
    onRerunAudit: () => void;
    onClose: () => void;
}) {
    const applied = ruleStatuses.filter(r => r.outcome?.status === "Applied").length;
    const blocked = ruleStatuses.filter(r => r.outcome?.status === "Blocked").length;
    const allApplied = blocked === 0;

    return (
        <div className="flex flex-col gap-5">
            {/* Summary badge */}
            <div className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3.5",
                allApplied ? "bg-emerald-500/8 border-emerald-500/25" : "bg-amber-500/8 border-amber-500/25"
            )}>
                {allApplied
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    : <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                }
                <div>
                    <p className={cn("text-sm font-semibold", allApplied ? "text-emerald-400" : "text-amber-400")}>
                        {allApplied
                            ? `All ${applied} fixes applied successfully`
                            : `${applied} applied, ${blocked} blocked`
                        }
                    </p>
                    <p className={cn("text-xs mt-0.5", allApplied ? "text-emerald-400/70" : "text-amber-400/70")}>
                        {allApplied
                            ? "Re-run the audit to see the updated score."
                            : "Blocked fixes may require elevated privileges or manual intervention."
                        }
                    </p>
                </div>
            </div>

            {/* Per-rule results */}
            <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
                {ruleStatuses.map(rs => (
                    <RuleRow key={rs.ruleId} rs={rs} showOutcome={true} />
                ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onClose}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Close
                </button>
                <button
                    onClick={onRerunAudit}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-run Audit
                </button>
            </div>
        </div>
    );
}

// ── FixAllWizard (main export) ────────────────────────────────────────────────

interface FixAllWizardProps {
    open: boolean;
    step: FixAllStep;
    currentIndex: number;
    ruleStatuses: RuleFixStatus[];
    onConfirm: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
}

export function FixAllWizard({
    open, step, currentIndex, ruleStatuses,
    onConfirm, onClose, onRerunAudit,
}: FixAllWizardProps) {
    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v && step !== "applying") onClose(); }}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[520px] bg-[#09090B] border-l border-white/8 p-0 flex flex-col gap-0 overflow-hidden"
            >
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b border-white/8 space-y-4">
                    <div className="space-y-2 pr-8">
                        <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#2496ED] bg-[#2496ED]/10 border border-[#2496ED]/25 px-2.5 py-1 rounded">
                                <Zap className="h-3 w-3" />
                                Fix All
                            </span>
                            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                                {ruleStatuses.length} rules · auto fix
                            </span>
                        </div>
                        <p className="text-base font-semibold text-white leading-snug">
                            Apply All Auto-Fixable Issues
                        </p>
                    </div>
                    <StepIndicator current={step} />
                </SheetHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {step === "confirm" && (
                        <ConfirmStep
                            ruleStatuses={ruleStatuses}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                        />
                    )}
                    {step === "applying" && (
                        <ApplyingStep ruleStatuses={ruleStatuses} currentIndex={currentIndex} />
                    )}
                    {step === "result" && (
                        <ResultStep
                            ruleStatuses={ruleStatuses}
                            onRerunAudit={onRerunAudit}
                            onClose={onClose}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
