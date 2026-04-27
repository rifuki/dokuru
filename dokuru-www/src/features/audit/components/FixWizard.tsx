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
import type { AuditResult, FixOutcome, FixPreview, FixProgress } from "@/lib/api/agent-direct";
import {
    getFixSteps, isNamespaceRecreateRule, isCgroupRule,
    type TargetConfig, type WizardStep,
} from "@/features/audit/hooks/useFix";

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
    preview,
    previewLoading,
    targetConfig,
    onConfirm,
    onCancel,
    onTargetChange,
}: {
    result: AuditResult;
    preview: FixPreview | null;
    previewLoading: boolean;
    targetConfig: Record<string, TargetConfig>;
    onConfirm: () => void;
    onCancel: () => void;
    onTargetChange: (containerId: string, patch: Partial<TargetConfig>) => void;
}) {
    const { rule, affected } = result;
    const steps = preview?.steps ?? getFixSteps(rule.id);
    const isRecreate = isNamespaceRecreateRule(rule.id);
    const isCgroup = isCgroupRule(rule.id);
    const targets = preview?.targets ?? [];

    return (
        <div className="flex flex-col gap-5">
            {/* Restart warning */}
            {isRecreate && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-400">
                            Container restart required
                        </p>
                        <p className="text-xs text-amber-400/70 leading-relaxed">
                            Namespace and privileged flags cannot be changed on a running container. Standalone containers are recreated, while Compose-managed services update the compose file and run docker compose up.
                        </p>
                    </div>
                </div>
            )}

            {/* Affected containers */}
            {previewLoading && (
                <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-xs font-mono text-white/40">
                    Loading agent preview and suggested values...
                </div>
            )}

            {targets.length > 0 ? (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">
                            Agent preview ({targets.length})
                        </p>
                        {isCgroup && (
                            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#2496ED]/60">
                                editable values
                            </p>
                        )}
                    </div>
                    <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden">
                        {targets.map((target, i) => {
                            const config = targetConfig[target.container_id];
                            return (
                                <div
                                    key={target.container_id}
                                    className={cn(
                                        "flex flex-col gap-2 px-3 py-2 text-xs font-mono sm:flex-row sm:items-center sm:justify-between",
                                        i < targets.length - 1 && "border-b border-white/5"
                                    )}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Server className="h-3 w-3 text-white/30 shrink-0" />
                                        <div className="min-w-0">
                                            <span className="text-white/70 truncate block">{target.container_name}</span>
                                            <span className="text-white/25 text-[10px] truncate block">
                                                {target.strategy}{target.compose_project ? ` · ${target.compose_project}/${target.compose_service}` : ""}
                                            </span>
                                        </div>
                                    </div>
                                    {isCgroup && config && (
                                        <div className="grid grid-cols-3 gap-1.5 sm:w-[230px]">
                                            {rule.id === "5.11" && (
                                                <label className="col-span-3 text-[10px] text-white/35">
                                                    Memory MB
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={config.memoryMb}
                                                        onChange={(e) => onTargetChange(target.container_id, { memoryMb: Number(e.target.value) })}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80 outline-none focus:border-[#2496ED]/60"
                                                    />
                                                </label>
                                            )}
                                            {rule.id === "5.12" && (
                                                <label className="col-span-3 text-[10px] text-white/35">
                                                    CPU shares
                                                    <input
                                                        type="number"
                                                        min={2}
                                                        value={config.cpuShares}
                                                        onChange={(e) => onTargetChange(target.container_id, { cpuShares: Number(e.target.value) })}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80 outline-none focus:border-[#2496ED]/60"
                                                    />
                                                </label>
                                            )}
                                            {rule.id === "5.29" && (
                                                <label className="col-span-3 text-[10px] text-white/35">
                                                    PIDs limit
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={config.pidsLimit}
                                                        onChange={(e) => onTargetChange(target.container_id, { pidsLimit: Number(e.target.value) })}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80 outline-none focus:border-[#2496ED]/60"
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {isCgroup && (
                        <p className="text-[10px] text-white/25 font-mono mt-1.5 pl-1">
                            Suggested values come from the agent preview and can be edited per container before apply.
                        </p>
                    )}
                </div>
            ) : affected.length > 0 && !previewLoading ? (
                <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-xs font-mono text-white/50">
                    Agent preview returned no target details. Affected from audit: {affected.join(", ")}
                </div>
            ) : null}

            {preview && targets.length === 0 && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-400/80">
                    Agent preview says no containers currently need this fix.
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
                    disabled={previewLoading}
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

function ProgressEventsPanel({
    progressEvents,
    title = "real-time command evidence",
}: {
    progressEvents: FixProgress[];
    title?: string;
}) {
    if (progressEvents.length === 0) return null;

    return (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 text-[10px] font-mono uppercase tracking-[0.15em] text-white/30">
                {title}
            </div>
            <div className="max-h-64 overflow-y-auto p-3 space-y-3">
                {progressEvents.slice(-16).map((event, i) => (
                    <div key={`${event.container_name}-${event.action}-${event.step}-${i}`} className="space-y-1.5 text-[11px] font-mono">
                        <div className="text-white/50">
                            <span className={cn(
                                "mr-2 uppercase",
                                event.status === "done" ? "text-emerald-400" : event.status === "error" ? "text-rose-400" : "text-[#2496ED]"
                            )}>{event.status}</span>
                            <span className="text-white/70">{event.container_name}</span>
                            <span className="text-white/25"> · {event.action}</span>
                            {event.detail && <span className="text-white/35"> · {event.detail}</span>}
                        </div>
                        {event.command && (
                            <pre className="rounded border border-white/8 bg-black/40 px-3 py-2 text-[10px] text-[#2496ED] whitespace-pre-wrap break-words">
                                <span className="text-white/30 select-none">$ </span>
                                {event.command}
                            </pre>
                        )}
                        {(event.stdout || event.stderr) && (
                            <div className="rounded border border-white/8 bg-[#050507] overflow-hidden">
                                {event.stdout && (
                                    <pre className="px-3 py-2 text-[10px] text-emerald-300/80 whitespace-pre-wrap break-words">
                                        <span className="text-white/30 select-none">stdout\n</span>
                                        {event.stdout}
                                    </pre>
                                )}
                                {event.stderr && (
                                    <pre className="px-3 py-2 text-[10px] text-rose-300/80 whitespace-pre-wrap break-words border-t border-white/5">
                                        <span className="text-white/30 select-none">stderr\n</span>
                                        {event.stderr}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ApplyingStep({ ruleId, stepIndex, progressEvents }: { ruleId: string; stepIndex: number; progressEvents: FixProgress[] }) {
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
                Live progress is streamed from dokuru-agent. Do not close this panel while fix is in progress.
            </p>

            <ProgressEventsPanel progressEvents={progressEvents} />
        </div>
    );
}

// ── Step 3: Result ────────────────────────────────────────────────────────────

function ResultStep({
    outcome,
    progressEvents,
    onRerunAudit,
    onClose,
}: {
    outcome: FixOutcome;
    progressEvents: FixProgress[];
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

            <ProgressEventsPanel progressEvents={progressEvents} title="executed command evidence" />

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
    preview: FixPreview | null;
    previewLoading: boolean;
    targetConfig: Record<string, TargetConfig>;
    progressEvents: FixProgress[];
    stepIndex: number;
    onConfirm: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
    onTargetChange: (containerId: string, patch: Partial<TargetConfig>) => void;
}

export function FixWizard({
    open, step, result, outcome, preview, previewLoading, targetConfig, progressEvents, stepIndex,
    onConfirm, onClose, onRerunAudit, onTargetChange,
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
                            preview={preview}
                            previewLoading={previewLoading}
                            targetConfig={targetConfig}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                            onTargetChange={onTargetChange}
                        />
                    )}
                    {step === "applying" && (
                        <ApplyingStep ruleId={rule.id} stepIndex={stepIndex} progressEvents={progressEvents} />
                    )}
                    {step === "result" && outcome && (
                        <ResultStep
                            outcome={outcome}
                            progressEvents={progressEvents}
                            onRerunAudit={onRerunAudit}
                            onClose={onClose}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
