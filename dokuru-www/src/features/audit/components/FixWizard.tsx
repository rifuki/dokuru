import { useState } from "react";
import {
    Sheet, SheetContent, SheetHeader,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, RotateCcw, Server,
    ShieldAlert, XCircle, Wrench, ChevronRight, Terminal, Copy, Check,
    RefreshCw, FileCode2, Activity, ArrowRight, Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AffectedItems } from "@/features/audit/components/AffectedItems";
import type { AuditResult, FixOutcome, FixPreview, FixProgress } from "@/lib/api/agent-direct";
import type { Container as DockerContainer } from "@/services/docker-api";
import {
    getFixSteps, isContainerRecreateRule, isCgroupRule,
    type TargetConfig, type WizardStep,
} from "@/features/audit/hooks/useFix";

// ── Step indicator ────────────────────────────────────────────────────────────

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

function StepIndicator({ current, complete = false }: { current: WizardStep; complete?: boolean }) {
    const idx = WIZARD_STEPS.findIndex(s => s.key === current);
    return (
        <div className="flex items-center gap-0">
            {WIZARD_STEPS.map((s, i) => {
                const done = i < idx || (complete && i === idx);
                const active = i === idx && !done;

                return (
                    <div key={s.key} className="flex items-center">
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={cn(
                                "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                                done
                                    ? "bg-[#2496ED] border-[#2496ED] text-white"
                                    : active
                                    ? "border-[#2496ED] text-[#2496ED] bg-[#2496ED]/10"
                                    : "border-white/15 text-white/20 bg-transparent"
                            )}>
                                {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                            </div>
                            <span className={cn(
                                "text-[9px] uppercase tracking-[0.18em] font-mono whitespace-nowrap",
                                active ? "text-[#2496ED]" : done ? "text-white/50" : "text-white/20"
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
    return { label: "PIDs limit", unit: "PIDs", key: "pidsLimit" as const, min: 50 };
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
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-amber-400">
                            Container restart required
                        </p>
                        <p className="text-xs text-amber-400/70 leading-relaxed">
                            This setting cannot be changed on a running container. Standalone containers are recreated, while Compose-managed services update the compose file and run docker compose up.
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
                        <div className="rounded-xl border border-[#2496ED]/20 bg-[#2496ED]/7 px-3.5 py-3 text-xs text-[#2496ED]/80">
                            <div className="flex items-start gap-2.5">
                                <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <p className="leading-relaxed">
                                    Compose-managed containers default to <span className="font-semibold text-[#2496ED]">Persist in Compose</span> so the score does not regress after <code className="font-mono">docker compose restart</code>. Switch to Live only if you need a temporary Docker update.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
                        {isCgroup && (
                            <div className="hidden border-b border-white/6 bg-white/[0.025] px-4 py-2.5 text-[9px] font-mono uppercase tracking-[0.16em] text-white/30 sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(116px,.7fr)_148px_150px] sm:gap-4">
                                <span>Container</span>
                                <span>Source</span>
                                <span>Apply via</span>
                                <span className="text-right">Value</span>
                            </div>
                        )}
                        {targets.map((target, i) => {
                            const config = targetConfig[target.container_id];
                            const canCompose = Boolean(target.compose_project && target.compose_service);
                            const strategy = config?.strategy ?? (target.strategy === "compose_update" ? "compose_update" : "docker_update");
                            const meta = valueMeta(rule.id);
                            const value = config?.[meta.key] ?? 0;

                            return (
                                <div
                                    key={target.container_id}
                                    className={cn(
                                        "grid gap-3 px-4 py-3 text-xs font-mono sm:items-center",
                                        isCgroup ? "sm:grid-cols-[minmax(0,1.25fr)_minmax(116px,.7fr)_148px_150px] sm:gap-4" : "sm:grid-cols-[minmax(0,1fr)_auto]",
                                        i < targets.length - 1 && "border-b border-white/6"
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <Server className="h-3.5 w-3.5 shrink-0 text-white/32" />
                                        <div className="min-w-0">
                                            <span className="block truncate text-[13px] font-semibold text-white/75">{target.container_name}</span>
                                            <span className="block truncate text-[10px] text-white/28">current: {currentValueLabel(rule.id, target)}</span>
                                        </div>
                                    </div>

                                    {isCgroup && (
                                        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
                                            {canCompose ? <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[#2496ED]" /> : <Box className="h-3.5 w-3.5 shrink-0 text-white/35" />}
                                            <div className="min-w-0">
                                                <span className={cn("block truncate text-[10px] uppercase tracking-[0.12em]", canCompose ? "text-[#2496ED]/80" : "text-white/35")}>{canCompose ? "compose" : "runtime"}</span>
                                                <span className="block truncate text-[10px] text-white/30">{canCompose ? `${target.compose_project}/${target.compose_service}` : "standalone"}</span>
                                            </div>
                                        </div>
                                    )}

                                    {isCgroup && config && (
                                        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-0.5">
                                            <button
                                                type="button"
                                                disabled={!canCompose}
                                                onClick={() => onTargetChange(target.container_id, { strategy: "compose_update" })}
                                                className={cn(
                                                    "rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors",
                                                    strategy === "compose_update" && canCompose ? "bg-[#2496ED] text-white" : "text-white/38 hover:text-white/70",
                                                    !canCompose && "cursor-not-allowed opacity-35 hover:text-white/38"
                                                )}
                                            >
                                                Compose
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onTargetChange(target.container_id, { strategy: "docker_update" })}
                                                className={cn(
                                                    "rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors",
                                                    strategy === "docker_update" ? "bg-white/12 text-white" : "text-white/38 hover:text-white/70"
                                                )}
                                            >
                                                Live only
                                            </button>
                                        </div>
                                    )}

                                    {isCgroup && config && (
                                        <label className="block text-[10px] text-white/35 sm:text-right">
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
                                                    "h-9 w-full rounded-lg border bg-black/35 px-3 text-right text-[13px] font-semibold outline-none transition-colors focus:bg-black/50",
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
                    {isCgroup && (
                        <p className="px-1 text-[10px] text-white/25 font-mono">
                            Rows are aligned by container, source, apply method, and value. Compose mode edits the compose YAML then runs <code>docker compose up -d</code>; Live only uses Docker update for the current container instance.
                        </p>
                    )}
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
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onCancel}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={previewLoading || hasInvalidValues}
                    className={cn(
                        "flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]",
                        previewLoading || hasInvalidValues
                            ? "bg-white/10 cursor-not-allowed opacity-50"
                            : "bg-[#2496ED] hover:bg-[#1e80cc] shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] hover:shadow-[0_0_24px_-4px_rgba(36,150,237,0.65)]"
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
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030507] shadow-[0_0_40px_-24px_rgba(36,150,237,0.7)]">
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
            <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(36,150,237,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-4">
                <div className="flex items-start gap-3">
                    <div className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
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
                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">events</p>
                        <p className="mt-1 text-lg font-bold text-white">{progressEvents.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">affected</p>
                        <p className="mt-1 text-lg font-bold text-white">{affectedItems.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
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
            <SheetContent
                side="right"
                className="audit-fix-sheet w-full sm:max-w-[680px] bg-[#09090B] border-l border-white/8 p-0 flex flex-col gap-0 overflow-hidden"
            >
                {/* ── Header ── */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b border-white/8 space-y-4">
                    {/* Rule badge + title */}
                    <div className="space-y-2 pr-8">
                        <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#2496ED] bg-[#2496ED]/10 border border-[#2496ED]/25 px-2.5 py-1 rounded">
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
            </SheetContent>
        </Sheet>
    );
}
