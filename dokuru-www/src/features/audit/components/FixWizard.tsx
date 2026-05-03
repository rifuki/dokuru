import { useState } from "react";
import {
    Sheet, SheetHeader,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, RotateCcw, Server,
    ShieldAlert, XCircle, Wrench, ChevronRight, Terminal, Copy, Check,
    RefreshCw, FileCode2, Activity, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AffectedItems } from "@/features/audit/components/AffectedItems";
import type { AuditResult, FixOutcome, FixPreview, FixProgress } from "@/lib/api/agent-direct";
import type { Container as DockerContainer } from "@/services/docker-api";
import {
    getFixSteps, isContainerRecreateRule, isCgroupRule,
    type TargetConfig, type WizardStep,
} from "@/features/audit/hooks/useFix";
import { ResizableSheetContent } from "@/features/audit/components/ResizableSheetContent";

// ── Step indicator ────────────────────────────────────────────────────────────

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

type ApplyStrategy = TargetConfig["strategy"];

const APPLY_MODE_OPTIONS: { value: ApplyStrategy; label: string; title: string }[] = [
    { value: "dokuru_override", label: "Override", title: "Write Dokuru override file" },
    { value: "compose_update", label: "Patch", title: "Patch source Compose YAML" },
    { value: "docker_update", label: "Live", title: "Update current container only" },
];

function StepIndicator({ current, complete = false }: { current: WizardStep; complete?: boolean }) {
    const idx = WIZARD_STEPS.findIndex(s => s.key === current);
    return (
        <div className="flex w-full items-start">
            {WIZARD_STEPS.map((s, i) => {
                const done = i < idx || (complete && i === idx);
                const active = i === idx && !done;

                return (
                    <div key={s.key} className={cn("flex items-start", i < WIZARD_STEPS.length - 1 ? "flex-1" : "flex-none")}>
                        <div className="flex w-20 flex-col items-center gap-1.5">
                            <div className={cn(
                                "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                                done
                                    ? "bg-[#2496ED] border-[#2496ED] text-white"
                                    : active
                                    ? "border-[#2496ED] text-[#2496ED] bg-[#2496ED]/10"
                                    : "border-border bg-muted/20 text-muted-foreground"
                            )}>
                                {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                            </div>
                            <span className={cn(
                                "text-[9px] uppercase tracking-[0.18em] font-mono whitespace-nowrap",
                                active ? "text-[#2496ED]" : done ? "text-muted-foreground" : "text-muted-foreground/70"
                            )}>
                                {s.label}
                            </span>
                        </div>
                        {i < WIZARD_STEPS.length - 1 && (
                            <div className={cn(
                                "mt-3 h-px min-w-8 flex-1 transition-all",
                                i < idx ? "bg-[#2496ED]/70" : "bg-border"
                            )} />
                        )}
                    </div>
                );
            })}
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

function formatBytesAsMb(bytes?: number | null) {
    if (!bytes || bytes <= 0) return "unlimited";
    return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function currentValueLabel(ruleId: string, target: FixPreview["targets"][number]) {
    if (ruleId === "5.11") return formatBytesAsMb(target.current_memory);
    if (ruleId === "5.12") return target.current_cpu_shares ? `${target.current_cpu_shares} shares` : "unset";
    if (ruleId === "5.29") return target.current_pids_limit && target.current_pids_limit > 0 ? `${target.current_pids_limit} PIDs` : "unset";
    return "current";
}

function valueMeta(ruleId: string) {
    if (ruleId === "5.11") return { label: "Memory", unit: "MB", key: "memoryMb" as const, min: 64 };
    if (ruleId === "5.12") return { label: "CPU shares", unit: "shares", key: "cpuShares" as const, min: 128 };
    return { label: "Limit", unit: "PIDs", key: "pidsLimit" as const, min: 50 };
}

function ApplyModePicker({
    value,
    canCompose,
    onChange,
}: {
    value: ApplyStrategy;
    canCompose: boolean;
    onChange: (strategy: ApplyStrategy) => void;
}) {
    const effectiveValue = canCompose ? value : "docker_update";

    return (
        <div className="audit-fix-mode-control grid grid-cols-3 rounded-md border border-white/10 bg-black/20 p-0.5" role="radiogroup" aria-label="Apply mode">
            {APPLY_MODE_OPTIONS.map((option) => {
                const disabled = !canCompose && option.value !== "docker_update";
                const active = effectiveValue === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={option.title}
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "h-8 rounded-[6px] px-2 text-[10px] font-semibold transition-colors whitespace-nowrap outline-none focus-visible:bg-white/10",
                            active && option.value === "dokuru_override" && canCompose && "bg-[#2496ED] text-white",
                            active && option.value !== "dokuru_override" && "bg-white/12 text-white",
                            !active && "text-white/38 hover:text-white/70",
                            disabled && "cursor-not-allowed opacity-35 hover:text-white/38",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Step 1: Confirm ───────────────────────────────────────────────────────────

function ConfirmStep({
    result,
    preview,
    previewLoading,
    targetConfig,
    onConfirm,
    onTargetChange,
}: {
    result: AuditResult;
    preview: FixPreview | null;
    previewLoading: boolean;
    targetConfig: Record<string, TargetConfig>;
    onConfirm: () => void;
    onTargetChange: (containerId: string, patch: Partial<TargetConfig>) => void;
}) {
    const { rule, affected } = result;
    const steps = preview?.steps ?? getFixSteps(rule.id);
    const isRecreate = isContainerRecreateRule(rule.id);
    const isCgroup = isCgroupRule(rule.id);
    const isHostPartition = rule.id === "1.1.1";
    const targets = preview?.targets ?? [];

    const meta = valueMeta(rule.id);
    const hasInvalidValues = isCgroup && targets.some(target => {
        const config = targetConfig[target.container_id];
        if (!config) return true;
        const value = config[meta.key] ?? 0;
        return value < meta.min;
    });

    return (
        <div className="flex flex-col gap-5">
            {/* Destructive warning for userns-remap (rule 2.10) */}
            {rule.id === "2.10" && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-red-400">
                            Destructive — Docker daemon will restart
                        </p>
                        <p className="text-xs text-red-400/70 leading-relaxed">
                            Dokuru will snapshot containers first, migrate Docker volumes into the remapped storage root, chown safe bind mounts, and restart recovered Compose stacks. Docker socket mounts and other system paths are skipped and may still need manual handling.
                        </p>
                    </div>
                </div>
            )}

            {isHostPartition && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-red-400">
                            High-risk host storage migration
                        </p>
                        <p className="text-xs text-red-400/70 leading-relaxed">
                            Dokuru only proceeds when one LVM volume group is clearly eligible. It creates a new logical volume, copies DockerRootDir, stops Docker for the final sync, updates /etc/fstab, and keeps the original Docker root as a backup.
                        </p>
                    </div>
                </div>
            )}

            {/* Restart warning */}
            {isRecreate && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-300">
                            <RotateCcw className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-amber-300">Restart/recreate required</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-amber-200/55">
                                Dokuru handles it during apply; Compose targets persist the change in YAML.
                            </p>
                        </div>
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
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">
                            Agent preview ({targets.length})
                        </p>
                        {isCgroup && (
                            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#2496ED]/60">
                                editable values
                            </p>
                        )}
                    </div>

                    {isCgroup && targets.some(target => target.compose_project) && (
                        <div className="rounded-md border border-white/8 bg-white/[0.018] px-3 py-2.5 text-xs text-white/48">
                            <div className="flex items-start gap-2.5">
                                <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2496ED]/70" />
                                <p className="leading-relaxed">
                                    Compose targets use <span className="font-semibold text-[#7dd3fc]">Dokuru override</span> by default. Patch edits source YAML; Live is temporary.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="audit-fix-target-list overflow-hidden rounded-md border border-white/8 bg-white/[0.012]">
                        {targets.map((target, i) => {
                            const config = targetConfig[target.container_id];
                            const canCompose = Boolean(target.compose_project && target.compose_service);
                            const strategy = config?.strategy ?? (target.strategy === "dokuru_override" || target.strategy === "compose_update" ? target.strategy : "docker_update");
                            const meta = valueMeta(rule.id);
                            const value = config?.[meta.key] ?? 0;

                            return (
                                <div
                                    key={target.container_id}
                                    className={cn(
                                        "text-xs font-mono",
                                        isCgroup ? "audit-fix-target-row" : "grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                                        i < targets.length - 1 && "border-b border-white/6"
                                    )}
                                >
                                    <div className="audit-fix-target-identity flex min-w-0 items-center gap-2.5">
                                        <Server className="h-3.5 w-3.5 shrink-0 text-white/32" />
                                        <div className="min-w-0">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate text-[13px] font-semibold text-white/75">{target.container_name}</span>
                                                {isCgroup && (
                                                    <span
                                                        title={canCompose ? `${target.compose_project}/${target.compose_service}` : "Runtime-only target"}
                                                        className={cn(
                                                            "shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]",
                                                            canCompose
                                                                ? "border-[#2496ED]/25 bg-[#2496ED]/8 text-[#2496ED]/75"
                                                                : "border-white/8 bg-white/[0.025] text-white/30",
                                                        )}
                                                    >
                                                        {canCompose ? "compose" : "runtime"}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="block truncate text-[10px] text-white/28">current: {currentValueLabel(rule.id, target)}</span>
                                        </div>
                                    </div>

                                    {isCgroup && config && (
                                        <ApplyModePicker
                                            value={strategy}
                                            canCompose={canCompose}
                                            onChange={(nextStrategy) => onTargetChange(target.container_id, { strategy: nextStrategy })}
                                        />
                                    )}

                                    {isCgroup && config && (
                                        <label className="audit-fix-target-value block text-[10px] text-white/35">
                                            <span className="mb-1 block uppercase tracking-[0.12em]">{meta.label} <span className="text-white/20">{meta.unit}</span></span>
                                            <input
                                                type="number"
                                                min={meta.min}
                                                value={value > 0 ? value : ""}
                                                onChange={(e) => {
                                                    const input = e.target.value;
                                                    if (input === "") {
                                                        onTargetChange(target.container_id, { [meta.key]: 0 });
                                                        return;
                                                    }
                                                    const val = Number(input);
                                                    if (!isNaN(val)) {
                                                        onTargetChange(target.container_id, { [meta.key]: val });
                                                    }
                                                }}
                                                className={cn(
                                                    "h-9 w-full rounded-md border bg-black/30 px-3 text-right text-[13px] font-semibold outline-none transition-colors focus:bg-black/45",
                                                    value < meta.min
                                                        ? "border-red-500/60 text-red-400 focus:border-red-500/80"
                                                        : "border-white/10 text-white/85 focus:border-[#2496ED]/60"
                                                )}
                                            />
                                            {value < meta.min && (
                                                <span className="mt-1 block text-[9px] text-red-400/80">
                                                    Minimum: {meta.min} {meta.unit}
                                                </span>
                                            )}
                                        </label>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : affected.length > 0 && !previewLoading ? (
                <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-xs font-mono text-white/50">
                    Agent preview returned no target details. Affected from audit: {affected.join(", ")}
                </div>
            ) : null}

            {preview && targets.length === 0 && isHostPartition && (
                <div className="rounded-lg border border-[#2496ED]/20 bg-[#2496ED]/8 px-4 py-3 text-xs text-[#2496ED]/80">
                    This is a host-level storage fix, so there are no per-container targets to list.
                </div>
            )}

            {preview && targets.length === 0 && !isHostPartition && (
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
            <div className="flex justify-end pt-1">
                <button
                    onClick={onConfirm}
                    disabled={previewLoading || hasInvalidValues}
                    className={cn(
                        "audit-on-primary inline-flex h-9 w-full max-w-[156px] items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-all active:scale-[0.98]",
                        previewLoading || hasInvalidValues
                            ? "bg-white/10 cursor-not-allowed opacity-50"
                            : "bg-[#2496ED] hover:bg-[#1e80cc]"
                    )}
                >
                    <Wrench className="h-3.5 w-3.5" />
                    Apply Fix
                </button>
            </div>
        </div>
    );
}

// ── Step 2: Applying ──────────────────────────────────────────────────────────

function ProgressEventsPanel({
    progressEvents,
    title = "live terminal transcript",
}: {
    progressEvents: FixProgress[];
    title?: string;
}) {
    if (progressEvents.length === 0) return null;

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030507]">
            <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                </div>
                <Terminal className="ml-1 h-3.5 w-3.5 text-[#2496ED]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">{title}</span>
                <span className="ml-auto rounded border border-white/8 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-white/35">
                    {progressEvents.length} events
                </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
                {progressEvents.map((event, i) => {
                    const tone = event.status === "done"
                        ? "text-emerald-400"
                        : event.status === "error"
                        ? "text-rose-400"
                        : "text-[#2496ED]";

                    return (
                        <div key={`${event.container_name}-${event.action}-${event.step}-${i}`} className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 border-b border-white/5 py-2 last:border-b-0 first:pt-0 last:pb-0">
                            <span className={cn("pt-0.5 text-[10px] uppercase tracking-[0.08em]", tone)}>{event.status}</span>
                            <div className="min-w-0 space-y-1.5">
                                <div className="flex min-w-0 items-center gap-1.5 text-white/52">
                                    <span className="truncate font-semibold text-white/75">{event.container_name}</span>
                                    <ArrowRight className="h-3 w-3 shrink-0 text-white/16" />
                                    <span className="shrink-0 text-white/38">{event.action}</span>
                                    {event.detail && <span className="truncate text-white/28">{event.detail}</span>}
                                </div>
                                {event.command && (
                                    <pre className="overflow-x-auto rounded-lg border border-[#2496ED]/15 bg-[#06111a] px-3 py-2 text-[10px] text-[#58b8ff]">
                                        <span className="select-none text-white/28">$ </span>{event.command}
                                    </pre>
                                )}
                                {(event.stdout || event.stderr) && (
                                    <div className="overflow-hidden rounded-lg border border-white/8 bg-black/45">
                                        {event.stdout && (
                                            <pre className="whitespace-pre-wrap break-words px-3 py-2 text-[10px] text-emerald-300/80">
                                                <span className="select-none text-white/28">stdout\n</span>{event.stdout}
                                            </pre>
                                        )}
                                        {event.stderr && (
                                            <pre className="whitespace-pre-wrap break-words border-t border-white/5 px-3 py-2 text-[10px] text-rose-300/80">
                                                <span className="select-none text-white/28">stderr\n</span>{event.stderr}
                                            </pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function FixStepChecklist({ ruleId, stepIndex, complete = false }: { ruleId: string; stepIndex: number; complete?: boolean }) {
    const steps = getFixSteps(ruleId);

    return (
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
                    const done = complete || i < stepIndex;
                    const active = !complete && i === stepIndex;
                    const pending = !complete && i > stepIndex;
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
    );
}

function ApplyingStep({ ruleId, stepIndex, progressEvents }: { ruleId: string; stepIndex: number; progressEvents: FixProgress[] }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 text-[#2496ED] animate-spin shrink-0" />
                <span className="text-sm font-semibold text-[#2496ED] font-mono">
                    Executing fix…
                </span>
            </div>

            <FixStepChecklist ruleId={ruleId} stepIndex={stepIndex} />

            <p className="text-[11px] text-white/30 font-mono text-center">
                Live progress is streamed from dokuru-agent. You can close this panel or navigate away; the fix continues in the background.
            </p>

            <ProgressEventsPanel progressEvents={progressEvents} />
        </div>
    );
}

// ── Step 3: Result ────────────────────────────────────────────────────────────

function ResultStep({
    outcome,
    result,
    progressEvents,
    stepIndex,
    agentId,
    containers,
    auditId,
    onRerunAudit,
    onClose,
}: {
    outcome: FixOutcome;
    result: AuditResult;
    progressEvents: FixProgress[];
    stepIndex: number;
    agentId: string;
    containers: DockerContainer[];
    auditId?: string;
    onRerunAudit: () => void;
    onClose: () => void;
}) {
    const isApplied = outcome.status === "Applied";
    const isBlocked = outcome.status === "Blocked";
    const affectedItems = result.affected.length > 0
        ? result.affected
        : Array.from(new Set(progressEvents.map(event => event.container_name).filter(Boolean)));

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-start gap-3">
                    <div className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
                        isApplied ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-300" : isBlocked ? "border-rose-400/25 bg-rose-500/12 text-rose-300" : "border-amber-400/25 bg-amber-500/12 text-amber-300"
                    )}>
                        {isApplied ? <CheckCircle2 className="h-5 w-5" /> : isBlocked ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{isApplied ? "Remediation complete" : isBlocked ? "Remediation blocked" : "Manual follow-up required"}</p>
                            <span className={cn(
                                "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]",
                                isApplied ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300" : isBlocked ? "border-rose-400/20 bg-rose-500/10 text-rose-300" : "border-amber-400/20 bg-amber-500/10 text-amber-300"
                            )}>{outcome.status}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-white/48">Rule {result.rule.id} finished on the agent. Review the affected targets and terminal transcript before re-running the audit.</p>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">events</p>
                        <p className="mt-1 text-lg font-bold text-white">{progressEvents.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">affected</p>
                        <p className="mt-1 text-lg font-bold text-white">{affectedItems.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">mode</p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#2496ED]">{progressEvents.some(event => event.action.includes("compose")) ? "Compose" : "Live"}</p>
                    </div>
                </div>
            </div>

            <FixStepChecklist ruleId={result.rule.id} stepIndex={stepIndex} complete={isApplied} />

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

            {affectedItems.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Activity className="h-3.5 w-3.5 text-[#2496ED]" />
                            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/38">Affected targets</p>
                        </div>
                    </div>
                    <AffectedItems
                        items={affectedItems}
                        containers={containers}
                        agentId={agentId}
                        returnTo={{ source: "audit", auditId, ruleId: result.rule.id }}
                        chipClassName="rounded-lg bg-[#2496ED]/8 border-[#2496ED]/25 px-2.5 py-1.5"
                    />
                </div>
            )}

            <ProgressEventsPanel progressEvents={progressEvents} title="terminal transcript" />

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
            <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                <button
                    onClick={onClose}
                    className="h-9 rounded-md border border-white/12 bg-white/[0.03] px-4 text-sm font-medium text-white/60 transition-all hover:bg-white/[0.07] hover:text-white/90 sm:w-28"
                >
                    Close
                </button>
                {isApplied && (
                    <button
                        onClick={onRerunAudit}
                        className="audit-on-primary inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#2496ED] px-4 text-sm font-semibold text-white transition-all hover:bg-[#1e80cc] active:scale-[0.98] sm:w-36"
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
    agentId: string;
    containers: DockerContainer[];
    auditId?: string;
    onConfirm: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
    onTargetChange: (containerId: string, patch: Partial<TargetConfig>) => void;
}

export function FixWizard({
    open, step, result, outcome, preview, previewLoading, targetConfig, progressEvents, stepIndex,
    agentId, containers, auditId, onConfirm, onClose, onRerunAudit, onTargetChange,
}: FixWizardProps) {
    if (!result) return null;
    const { rule } = result;

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <ResizableSheetContent
                side="right"
                storageKey="dokuru_fix_sheet_width"
                defaultWidth={720}
                minWidth={420}
                className="bg-[#09090B] border-l border-white/8"
            >
                {/* ── Header ── */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b border-white/8 space-y-4">
                    {/* Rule badge + title */}
                    <div className="space-y-2 pr-8">
                        <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#2496ED]/25 bg-[#2496ED]/8 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-[#2496ED]">
                                <Wrench className="h-3 w-3" />
                                Rule {rule.id}
                            </span>
                            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                                apply fix
                            </span>
                        </div>
                        <p className="text-base font-semibold text-white leading-snug">
                            {rule.title}
                        </p>
                    </div>

                    {/* Step indicator */}
                    <StepIndicator current={step} complete={step === "result" && outcome?.status === "Applied"} />
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
                            onTargetChange={onTargetChange}
                        />
                    )}
                    {step === "applying" && (
                        <ApplyingStep ruleId={rule.id} stepIndex={stepIndex} progressEvents={progressEvents} />
                    )}
                    {step === "result" && outcome && (
                        <ResultStep
                            outcome={outcome}
                            result={result}
                            progressEvents={progressEvents}
                            stepIndex={stepIndex}
                            agentId={agentId}
                            containers={containers}
                            auditId={auditId}
                            onRerunAudit={onRerunAudit}
                            onClose={onClose}
                        />
                    )}
                </div>
            </ResizableSheetContent>
        </Sheet>
    );
}
