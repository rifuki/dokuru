import { useState } from "react";
import {
    Sheet, SheetContent, SheetHeader,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, RotateCcw, Server,
    ShieldAlert, XCircle, Zap, ChevronRight, Terminal, Copy, Check,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditResult, FixOutcome } from "@/lib/api/agent-direct";
import { getFixSteps, isNamespaceRecreateRule, type WizardStep } from "@/features/audit/hooks/useFix";

// ── Step indicator ────────────────────────────────────────────────────────────

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

function StepIndicator({ current }: { current: WizardStep }) {
    const idx = WIZARD_STEPS.findIndex(s => s.key === current);
    return (
        <div className="flex items-center gap-0">
            {WIZARD_STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center">
                    <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                            "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                            i < idx
                                ? "bg-[#2496ED] border-[#2496ED] text-white"
                                : i === idx
                                ? "border-[#2496ED] text-[#2496ED] bg-[#2496ED]/10"
                                : "border-white/15 text-white/20 bg-transparent"
                        )}>
                            {i < idx ? <Check size={10} strokeWidth={3} /> : i + 1}
                        </div>
                        <span className={cn(
                            "text-[9px] uppercase tracking-[0.18em] font-mono whitespace-nowrap",
                            i === idx ? "text-[#2496ED]" : i < idx ? "text-white/50" : "text-white/20"
                        )}>
                            {s.label}
                        </span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                        <div className={cn(
                            "w-10 h-px mx-1 mb-4 transition-all",
                            i < idx ? "bg-[#2496ED]/60" : "bg-white/10"
                        )} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };
    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors"
        >
            {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
            {copied ? "copied" : "copy"}
        </button>
    );
}

// ── Step 1: Confirm ───────────────────────────────────────────────────────────

function ConfirmStep({
    result,
    onConfirm,
    onCancel,
}: {
    result: AuditResult;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const { rule, affected } = result;
    const steps = getFixSteps(rule.id);
    const isRecreate = isNamespaceRecreateRule(rule.id);
    const needsDaemonRestart = rule.id === "2.10";

    return (
        <div className="flex flex-col gap-5">
            {/* Restart warning */}
            {(isRecreate || needsDaemonRestart) && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-400">
                            {isRecreate ? "Container restart required" : "Docker daemon restart required"}
                        </p>
                        <p className="text-xs text-amber-400/70 leading-relaxed">
                            {isRecreate
                                ? "Namespace flags cannot be changed on a running container. Affected containers will be stopped, recreated with the correct config, and restarted. Expect ~5 seconds of downtime per container."
                                : "The Docker daemon will be restarted to apply this configuration change. Running containers may be briefly interrupted."
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* Affected containers */}
            {affected.length > 0 && (
                <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mb-2">
                        Affected containers ({affected.length})
                    </p>
                    <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden">
                        {affected.map((name, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 text-xs font-mono",
                                    i < affected.length - 1 && "border-b border-white/5"
                                )}
                            >
                                <Server className="h-3 w-3 text-white/30 shrink-0" />
                                <span className="text-white/70">{name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Steps preview */}
            <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mb-2">
                    Fix will execute
                </p>
                <div className="space-y-1.5">
                    {steps.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                            <ChevronRight className="h-3 w-3 text-[#2496ED]/60 shrink-0" />
                            <span className="font-mono">{s.replace("…", "")}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
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
                    Apply Fix
                </button>
            </div>
        </div>
    );
}

// ── Step 2: Applying ──────────────────────────────────────────────────────────

function ApplyingStep({ ruleId, stepIndex }: { ruleId: string; stepIndex: number }) {
    const steps = getFixSteps(ruleId);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 text-[#2496ED] animate-spin shrink-0" />
                <span className="text-sm font-semibold text-[#2496ED] font-mono">
                    Executing fix…
                </span>
            </div>

            {/* Terminal-style step list */}
            <div className="rounded-lg border border-white/8 bg-[#050507] overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 bg-white/[0.015]">
                    <Terminal className="h-3 w-3 text-white/30" />
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                        dokuru-agent
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-[#2496ED]/60 uppercase tracking-[0.15em]">
                        rule {ruleId}
                    </span>
                </div>
                <div className="p-4 space-y-2.5">
                    {steps.map((s, i) => {
                        const done = i < stepIndex;
                        const active = i === stepIndex;
                        const pending = i > stepIndex;
                        return (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-start gap-3 text-xs font-mono transition-all duration-300",
                                    done && "text-emerald-400",
                                    active && "text-white",
                                    pending && "text-white/20"
                                )}
                            >
                                <span className="shrink-0 w-4 text-center mt-px">
                                    {done
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                        : active
                                        ? <Loader2 className="h-3.5 w-3.5 text-[#2496ED] animate-spin" />
                                        : <span className="inline-block w-3.5 h-3.5 rounded-full border border-white/10" />
                                    }
                                </span>
                                <span className="leading-relaxed">{s}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-[11px] text-white/30 font-mono text-center">
                Do not close this panel while fix is in progress
            </p>
        </div>
    );
}

// ── Step 3: Result ────────────────────────────────────────────────────────────

function ResultStep({
    outcome,
    onRerunAudit,
    onClose,
}: {
    outcome: FixOutcome;
    onRerunAudit: () => void;
    onClose: () => void;
}) {
    const isApplied = outcome.status === "Applied";
    const isBlocked = outcome.status === "Blocked";

    return (
        <div className="flex flex-col gap-5">
            {/* Status badge */}
            <div className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3.5",
                isApplied
                    ? "bg-emerald-500/8 border-emerald-500/25"
                    : isBlocked
                    ? "bg-rose-500/8 border-rose-500/25"
                    : "bg-amber-500/8 border-amber-500/25"
            )}>
                {isApplied
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    : isBlocked
                    ? <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                    : <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                }
                <div>
                    <p className={cn(
                        "text-sm font-semibold",
                        isApplied ? "text-emerald-400"
                        : isBlocked ? "text-rose-400"
                        : "text-amber-400"
                    )}>
                        {isApplied ? "Fix Applied Successfully" : isBlocked ? "Fix Blocked" : "Guided Remediation"}
                    </p>
                    <p className={cn(
                        "text-xs mt-0.5 leading-relaxed",
                        isApplied ? "text-emerald-400/70"
                        : isBlocked ? "text-rose-400/70"
                        : "text-amber-400/70"
                    )}>
                        {outcome.message}
                    </p>
                </div>
            </div>

            {/* Flags */}
            {(outcome.requires_elevation || outcome.requires_restart) && (
                <div className="flex flex-wrap gap-2">
                    {outcome.requires_elevation && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded border bg-amber-500/8 border-amber-500/25 text-amber-400">
                            <ShieldAlert className="h-3 w-3" />
                            Requires elevation
                        </span>
                    )}
                    {outcome.requires_restart && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded border bg-blue-500/8 border-blue-500/25 text-[#2496ED]">
                            <RotateCcw className="h-3 w-3" />
                            Docker restart required
                        </span>
                    )}
                </div>
            )}

            {/* Restart command */}
            {outcome.restart_command && (
                <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mb-2">
                        Run to complete
                    </p>
                    <div className="rounded-lg border border-white/8 bg-[#050507] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                            <span className="text-[10px] font-mono text-white/30">bash</span>
                            <CopyButton text={outcome.restart_command} />
                        </div>
                        <pre className="px-4 py-3 text-xs font-mono text-emerald-400 overflow-x-auto">
                            <span className="text-white/30 select-none">$ </span>
                            {outcome.restart_command}
                        </pre>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onClose}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Close
                </button>
                {isApplied && (
                    <button
                        onClick={onRerunAudit}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Re-run Audit
                    </button>
                )}
            </div>
        </div>
    );
}

// ── FixWizard (main export) ───────────────────────────────────────────────────

interface FixWizardProps {
    open: boolean;
    step: WizardStep;
    result: AuditResult | null;
    outcome: FixOutcome | null;
    stepIndex: number;
    onConfirm: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
}

export function FixWizard({
    open, step, result, outcome, stepIndex,
    onConfirm, onClose, onRerunAudit,
}: FixWizardProps) {
    if (!result) return null;
    const { rule } = result;

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[480px] bg-[#09090B] border-l border-white/8 p-0 flex flex-col gap-0 overflow-hidden"
            >
                {/* ── Header ── */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b border-white/8 space-y-4">
                    {/* Rule badge + title */}
                    <div className="space-y-2 pr-8">
                        <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#2496ED] bg-[#2496ED]/10 border border-[#2496ED]/25 px-2.5 py-1 rounded">
                                <Zap className="h-3 w-3" />
                                Rule {rule.id}
                            </span>
                            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                                auto fix
                            </span>
                        </div>
                        <p className="text-base font-semibold text-white leading-snug">
                            {rule.title}
                        </p>
                    </div>

                    {/* Step indicator */}
                    <StepIndicator current={step} />
                </SheetHeader>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {step === "confirm" && (
                        <ConfirmStep
                            result={result}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                        />
                    )}
                    {step === "applying" && (
                        <ApplyingStep ruleId={rule.id} stepIndex={stepIndex} />
                    )}
                    {step === "result" && outcome && (
                        <ResultStep
                            outcome={outcome}
                            onRerunAudit={onRerunAudit}
                            onClose={onClose}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
