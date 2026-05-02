import {
    Sheet, SheetClose, SheetContent, SheetHeader,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, XCircle,
    RefreshCw, Check, ShieldAlert, X, FileCode2, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isContainerRecreateRule } from "@/features/audit/hooks/useFix";
import type { CgroupRuleId, CgroupTargetConfig, FixAllStep, RuleFixStatus } from "@/features/audit/hooks/useFixAll";

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { key: FixAllStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "configure", label: "Configure" },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

function StepIndicator({ current, showConfigure }: { current: FixAllStep; showConfigure: boolean }) {
    const steps = showConfigure ? STEPS : STEPS.filter((step) => step.key !== "configure");
    const idx = steps.findIndex(s => s.key === current);
    const progress = idx <= 0 ? 0 : (idx / (steps.length - 1)) * 100;

    return (
        <div className="space-y-3" aria-label="Fix progress">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                    className="h-full rounded-full bg-[#2496ED] transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div className="flex justify-between text-xs">
                {steps.map((s, i) => (
                    <div
                        key={s.key}
                        className={cn(
                            "flex items-center gap-2",
                            i > 0 && i < steps.length - 1 && "justify-center",
                            i === steps.length - 1 && "justify-end"
                        )}
                    >
                        <span className={cn(
                            "h-2 w-2 rounded-full transition-colors",
                            i <= idx ? "bg-[#2496ED]" : "bg-white/18"
                        )} />
                        <span className={cn(
                            "font-medium",
                            i === idx ? "text-white" : i < idx ? "text-white/55" : "text-white/35"
                        )}>
                            {s.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({
    rs, showOutcome, selectable, onToggle,
}: {
    rs: RuleFixStatus;
    showOutcome: boolean;
    selectable?: boolean;
    onToggle?: (ruleId: string) => void;
}) {
    const isRecreate = isContainerRecreateRule(rs.ruleId);
    const applied = rs.outcome?.status === "Applied";
    const skipped = rs.state === "skipped";

    return (
        <button
            type="button"
            onClick={() => selectable && onToggle?.(rs.ruleId)}
            disabled={!selectable}
            className={cn(
            "flex items-start gap-3 px-3 py-2.5 text-xs",
            rs.state === "applying" && "bg-[#2496ED]/5",
            selectable && "w-full text-left hover:bg-white/[0.03] transition-colors",
            !rs.selected && !showOutcome && "opacity-45"
        )}>
            {/* Status icon */}
            <div className="mt-px shrink-0 w-4 flex justify-center">
                {selectable
                    ? <span className={cn(
                        "inline-flex h-3.5 w-3.5 items-center justify-center rounded border mt-0.5",
                        rs.selected ? "border-[#2496ED] bg-[#2496ED] text-white" : "border-white/20 bg-transparent",
                    )}>{rs.selected && <Check size={10} strokeWidth={3} />}</span>
                    : skipped
                    ? <span className="inline-block w-3 h-3 rounded-full border border-white/10 mt-0.5" />
                    : rs.state === "done"
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
                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/80">
                            recreate
                        </span>
                    )}
                    {rs.highRisk && (
                        <span className="inline-flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-300/85">
                            <ShieldAlert className="h-2.5 w-2.5" /> risky
                        </span>
                    )}
                </div>
                <p className={cn(
                    "mt-1 truncate text-xs leading-snug",
                    skipped
                        ? "text-white/22"
                        : rs.state === "done"
                        ? applied ? "text-emerald-400/80" : "text-rose-400/80"
                        : rs.state === "applying" ? "text-white/80"
                        : rs.selected ? "text-white/60" : "text-white/35"
                )}>
                    {skipped
                        ? "Skipped by selection"
                        : rs.state === "done" && rs.outcome
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
            {!showOutcome && rs.state === "pending" && !rs.selected && (
                <span className="shrink-0 text-[10px] text-white/25">
                    skipped
                </span>
            )}
        </button>
    );
}

// ── Confirm step ──────────────────────────────────────────────────────────────

function ConfirmStep({
    ruleStatuses, selectedCount, hasCgroupSelection, onConfirm, onCancel, onToggleRule, onSetAllSelected,
}: {
    ruleStatuses: RuleFixStatus[];
    selectedCount: number;
    hasCgroupSelection: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    onToggleRule: (ruleId: string) => void;
    onSetAllSelected: (selected: boolean) => void;
}) {
    const recreateCount = ruleStatuses.filter(r => r.selected && isContainerRecreateRule(r.ruleId)).length;
    const highRiskCount = ruleStatuses.filter(r => r.highRisk && !r.selected).length;

    return (
        <div className="flex flex-col gap-5">
            {highRiskCount > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3.5">
                    <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-white/90">
                            Risky auto-fixes are not selected by default
                        </p>
                        <p className="text-sm text-white/62 leading-relaxed">
                            Host storage, user namespace, and recreate fixes like 1.1.1, 2.10, 4.1, and 5.31 can restart Docker or break workloads if prerequisites are wrong. Select them manually only when you are ready.
                        </p>
                    </div>
                </div>
            )}

            {recreateCount > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-white/90">
                            {recreateCount} rule{recreateCount > 1 ? "s" : ""} require container restart
                        </p>
                        <p className="text-sm text-white/62 leading-relaxed">
                            Selected fixes require stop → recreate → start for affected standalone containers, or docker compose up for Compose services. Expect short downtime per affected container.
                        </p>
                    </div>
                </div>
            )}

            <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white/45">
                        {selectedCount} of {ruleStatuses.length} rules selected
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onSetAllSelected(true)}
                            className="text-sm font-medium text-[#2496ED]/75 hover:text-[#2496ED]"
                        >
                            Select all
                        </button>
                        <span className="text-white/15">/</span>
                        <button
                            type="button"
                            onClick={() => onSetAllSelected(false)}
                            className="text-sm font-medium text-white/35 hover:text-white/70"
                        >
                            Clear
                        </button>
                    </div>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
                    {ruleStatuses.map(rs => (
                        <RuleRow
                            key={rs.ruleId}
                            rs={rs}
                            showOutcome={false}
                            selectable
                            onToggle={onToggleRule}
                        />
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
                    disabled={selectedCount === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] disabled:bg-white/10 disabled:text-white/25 disabled:shadow-none px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all hover:shadow-[0_0_24px_-4px_rgba(36,150,237,0.65)] active:scale-[0.98]"
                >
                    {hasCgroupSelection ? "Configure Resources" : `Apply ${selectedCount} Selected`}
                </button>
            </div>
        </div>
    );
}

// ── Configure resources step ──────────────────────────────────────────────────

function ruleValueLabel(ruleId: CgroupRuleId) {
    if (ruleId === "5.11") return "Memory";
    if (ruleId === "5.12") return "CPU shares";
    return "PIDs";
}

function ConfigureResourcesStep({
    cgroupTargets,
    cgroupLoading,
    selectedCgroupRuleIds,
    selectedCount,
    onUpdateTarget,
    onBack,
    onApply,
}: {
    cgroupTargets: CgroupTargetConfig[];
    cgroupLoading: boolean;
    selectedCgroupRuleIds: CgroupRuleId[];
    selectedCount: number;
    onUpdateTarget: (key: string, patch: Partial<CgroupTargetConfig>) => void;
    onBack: () => void;
    onApply: () => void;
}) {
    const grouped = cgroupTargets.reduce<Record<string, CgroupTargetConfig[]>>((acc, target) => {
        const key = target.composeProject ? `Compose project: ${target.composeProject}` : "Standalone containers";
        (acc[key] ??= []).push(target);
        return acc;
    }, {});
    const showMemory = selectedCgroupRuleIds.includes("5.11");
    const showCpu = selectedCgroupRuleIds.includes("5.12");
    const showPids = selectedCgroupRuleIds.includes("5.29");

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-[#2496ED]/20 bg-[#2496ED]/7 px-4 py-3 text-sm text-[#2496ED]/80">
                <div className="flex items-start gap-2.5">
                    <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-relaxed">
                        Configure cgroup values before bulk apply. Compose-managed containers default to persistent service updates; standalone containers use Docker live updates.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {selectedCgroupRuleIds.map((ruleId) => (
                    <span key={ruleId} className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-white/55">
                        {ruleId} · {ruleValueLabel(ruleId)}
                    </span>
                ))}
            </div>

            {cgroupLoading ? (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
                    <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-[#2496ED]" />
                    Loading cgroup target preview...
                </div>
            ) : cgroupTargets.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-300/80">
                    The agent preview did not find cgroup targets that still need these selected fixes. Applying will let the agent verify and no-op if everything already matches.
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).map(([group, targets]) => (
                        <div key={group} className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                            <div className="border-b border-white/6 bg-white/[0.025] px-3 py-2">
                                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{group}</p>
                            </div>
                            <div className="divide-y divide-white/6">
                                {targets.map((target) => {
                                    const canCompose = Boolean(target.composeProject && target.composeService);
                                    return (
                                        <div key={target.key} className="space-y-3 px-3 py-3">
                                            <div className="flex min-w-0 items-start justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    {canCompose ? <FileCode2 className="h-4 w-4 shrink-0 text-[#2496ED]" /> : <Server className="h-4 w-4 shrink-0 text-white/35" />}
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-white/75">
                                                            {target.composeService ?? target.containerName}
                                                        </p>
                                                        <p className="truncate font-mono text-[10px] text-white/30">
                                                            {canCompose ? target.containerName : target.image || "standalone"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-0.5">
                                                    <button
                                                        type="button"
                                                        disabled={!canCompose}
                                                        onClick={() => onUpdateTarget(target.key, { strategy: "compose_update" })}
                                                        className={cn(
                                                            "rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors",
                                                            target.strategy === "compose_update" && canCompose ? "bg-[#2496ED] text-white" : "text-white/38 hover:text-white/70",
                                                            !canCompose && "cursor-not-allowed opacity-35 hover:text-white/38"
                                                        )}
                                                    >
                                                        Compose
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onUpdateTarget(target.key, { strategy: "docker_update" })}
                                                        className={cn(
                                                            "rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors",
                                                            target.strategy === "docker_update" ? "bg-white/12 text-white" : "text-white/38 hover:text-white/70"
                                                        )}
                                                    >
                                                        Live only
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid gap-2 sm:grid-cols-3">
                                                {showMemory && (
                                                    <ResourceInput
                                                        label="Memory MB"
                                                        value={target.memoryMb}
                                                        enabled={target.ruleIds.includes("5.11")}
                                                        min={1}
                                                        onChange={(value) => onUpdateTarget(target.key, { memoryMb: value })}
                                                    />
                                                )}
                                                {showCpu && (
                                                    <ResourceInput
                                                        label="CPU shares"
                                                        value={target.cpuShares}
                                                        enabled={target.ruleIds.includes("5.12")}
                                                        min={2}
                                                        onChange={(value) => onUpdateTarget(target.key, { cpuShares: value })}
                                                    />
                                                )}
                                                {showPids && (
                                                    <ResourceInput
                                                        label="PIDs"
                                                        value={target.pidsLimit}
                                                        enabled={target.ruleIds.includes("5.29")}
                                                        min={1}
                                                        onChange={(value) => onUpdateTarget(target.key, { pidsLimit: value })}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onBack}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Back
                </button>
                <button
                    onClick={onApply}
                    disabled={cgroupLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] disabled:bg-white/10 disabled:text-white/25 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all active:scale-[0.98]"
                >
                    Apply {selectedCount} Selected
                </button>
            </div>
        </div>
    );
}

function ResourceInput({
    label,
    value,
    enabled,
    min,
    onChange,
}: {
    label: string;
    value: number;
    enabled: boolean;
    min: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className={cn("block rounded-lg border px-2.5 py-2", enabled ? "border-white/10 bg-black/25" : "border-white/5 bg-white/[0.015] opacity-45")}>
            <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">{label}</span>
            <input
                type="number"
                min={min}
                disabled={!enabled}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-8 w-full rounded border border-white/8 bg-black/35 px-2 text-right font-mono text-xs font-semibold text-white/80 outline-none transition-colors focus:border-[#2496ED]/60 disabled:cursor-not-allowed disabled:text-white/25"
            />
        </label>
    );
}

// ── Applying step ─────────────────────────────────────────────────────────────

function ApplyingStep({
    ruleStatuses, currentIndex,
}: {
    ruleStatuses: RuleFixStatus[];
    currentIndex: number;
}) {
    const selected = ruleStatuses.filter(r => r.selected);
    const done = selected.filter(r => r.state === "done").length;
    const total = selected.length;

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
                    {done}/{total}
                </span>
            </div>

            {/* Overall progress bar */}
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                    className="h-full rounded-full bg-[#2496ED] transition-all duration-500"
                    style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                />
            </div>

            <div className="rounded-lg border border-white/8 bg-[#050507] overflow-hidden divide-y divide-white/5">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.015]">
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.15em]">
                        dokuru-agent · sequential fix
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-[#2496ED]/60 uppercase tracking-[0.15em]">
                        {Math.min(currentIndex + 1, total)}/{total}
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
    const selected = ruleStatuses.filter(r => r.selected);
    const applied = selected.filter(r => r.outcome?.status === "Applied").length;
    const blocked = selected.filter(r => r.outcome?.status === "Blocked").length;
    const skipped = ruleStatuses.filter(r => r.state === "skipped").length;
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
                            ? `${applied} selected fixes applied successfully`
                            : `${applied} applied, ${blocked} blocked`
                        }
                    </p>
                    <p className={cn("text-xs mt-0.5", allApplied ? "text-emerald-400/70" : "text-amber-400/70")}>
                        {allApplied
                            ? skipped > 0 ? `${skipped} rule(s) were skipped by selection. Re-run the audit to see the updated score.` : "Re-run the audit to see the updated score."
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
    selectedCount: number;
    cgroupTargets: CgroupTargetConfig[];
    cgroupLoading: boolean;
    selectedCgroupRuleIds: CgroupRuleId[];
    onConfirm: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
    onToggleRule: (ruleId: string) => void;
    onSetAllSelected: (selected: boolean) => void;
    onUpdateCgroupTarget: (key: string, patch: Partial<CgroupTargetConfig>) => void;
    onBackToConfirm: () => void;
}

export function FixAllWizard({
    open, step, currentIndex, ruleStatuses, selectedCount,
    cgroupTargets, cgroupLoading, selectedCgroupRuleIds,
    onConfirm, onClose, onRerunAudit, onToggleRule, onSetAllSelected,
    onUpdateCgroupTarget, onBackToConfirm,
}: FixAllWizardProps) {
    const showConfigure = selectedCgroupRuleIds.length > 0 || step === "configure";

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v && step !== "applying") onClose(); }}>
            <SheetContent
                side="right"
                showCloseButton={false}
                className="w-full sm:max-w-[520px] bg-[#09090B] border-l border-white/8 p-0 flex flex-col gap-0 overflow-hidden"
            >
                <SheetClose
                    disabled={step === "applying"}
                    className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </SheetClose>
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b border-white/8 space-y-5">
                    <div className="pr-12">
                        <div className="min-w-0 space-y-1.5">
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                                Bulk remediation
                            </p>
                            <p className="text-lg font-semibold text-white leading-snug">
                                Apply selected fixes
                            </p>
                            <p className="text-xs text-white/45">
                                {selectedCount} of {ruleStatuses.length} rules selected
                            </p>
                        </div>
                    </div>
                    <StepIndicator current={step} showConfigure={showConfigure} />
                </SheetHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {step === "confirm" && (
                        <ConfirmStep
                            ruleStatuses={ruleStatuses}
                            selectedCount={selectedCount}
                            hasCgroupSelection={selectedCgroupRuleIds.length > 0}
                            onConfirm={onConfirm}
                            onCancel={onClose}
                            onToggleRule={onToggleRule}
                            onSetAllSelected={onSetAllSelected}
                        />
                    )}
                    {step === "configure" && (
                        <ConfigureResourcesStep
                            cgroupTargets={cgroupTargets}
                            cgroupLoading={cgroupLoading}
                            selectedCgroupRuleIds={selectedCgroupRuleIds}
                            selectedCount={selectedCount}
                            onUpdateTarget={onUpdateCgroupTarget}
                            onBack={onBackToConfirm}
                            onApply={onConfirm}
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
