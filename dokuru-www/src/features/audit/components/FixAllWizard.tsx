import { useState } from "react";
import {
    Sheet, SheetClose, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
    AlertTriangle, CheckCircle2, Loader2, XCircle,
    RefreshCw, Check, ShieldAlert, X, FileCode2, ChevronRight, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isContainerRecreateRule } from "@/features/audit/hooks/useFix";
import type { CgroupRuleId, CgroupTargetConfig, FixAllStep, RuleFixStatus } from "@/features/audit/hooks/useFixAll";
import { ResizableSheetContent } from "@/features/audit/components/ResizableSheetContent";
import { ProgressEventsPanel } from "@/features/audit/components/ProgressEventsPanel";
import { CGROUP_RESOURCE_MINIMUMS, CgroupTargetEditor, type CgroupResourceField } from "@/features/audit/components/CgroupTargetControls";
import type { FixProgress } from "@/lib/api/agent-direct";
import { appendFixProgressEvents, coalesceFixProgressEvents } from "@/lib/fix-progress-events";
import { fixJobKey, useAuditStore } from "@/stores/use-audit-store";

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS: { key: FixAllStep; label: string }[] = [
    { key: "confirm",  label: "Confirm"  },
    { key: "configure", label: "Configure" },
    { key: "applying", label: "Applying" },
    { key: "result",   label: "Result"   },
];

function StepIndicator({ current, showConfigure, complete = false }: { current: FixAllStep; showConfigure: boolean; complete?: boolean }) {
    const steps = showConfigure ? STEPS : STEPS.filter((step) => step.key !== "configure");
    const idx = Math.max(steps.findIndex(s => s.key === current), 0);

    return (
        <div className="flex w-full items-start" aria-label="Fix progress">
            {steps.map((s, i) => {
                const done = i < idx || (complete && i === idx);
                const active = i === idx && !done;

                return (
                    <div key={s.key} className={cn("flex items-start", i < steps.length - 1 ? "flex-1" : "flex-none")}>
                        <div className="flex w-20 flex-col items-center gap-1.5">
                            <div className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-mono font-bold transition-all",
                                done
                                    ? "border-[#2496ED] bg-[#2496ED] text-white"
                                    : active
                                    ? "border-[#2496ED] bg-[#2496ED]/10 text-[#2496ED]"
                                    : "border-border bg-muted/20 text-muted-foreground"
                            )}>
                                {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                            </div>
                            <span className={cn(
                                "whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.18em]",
                                active ? "text-[#2496ED]" : done ? "text-muted-foreground" : "text-muted-foreground/70"
                            )}>
                                {s.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
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
    const cancelled = rs.state === "cancelled";
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
                        rs.selected ? "audit-on-primary border-[#2496ED] bg-[#2496ED] text-white" : "border-white/20 bg-transparent",
                    )}>{rs.selected && <Check size={10} strokeWidth={3} />}</span>
                    : skipped
                    ? <span className="inline-block w-3 h-3 rounded-full border border-white/10 mt-0.5" />
                    : rs.state === "done" || cancelled
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
                    {rs.autoTriggered && (
                        <span className="rounded border border-[#2496ED]/25 bg-[#2496ED]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#2496ED]" title={`Triggered by ${rs.triggeredByRuleIds?.join(", ") ?? "another fix"}`}>
                            auto-triggered
                        </span>
                    )}
                </div>
                <p className={cn(
                    "mt-1 truncate text-xs leading-snug",
                    skipped
                        ? "text-white/22"
                        : cancelled
                        ? "text-rose-400/80"
                        : rs.state === "done"
                        ? applied ? "text-emerald-400/80" : "text-rose-400/80"
                        : rs.state === "applying" ? "text-white/80"
                        : rs.selected ? "text-white/60" : "text-white/35"
                )}>
                    {skipped
                        ? "Skipped by selection"
                        : cancelled
                        ? "Cancelled before completion"
                        : rs.state === "done" && rs.outcome
                        ? rs.outcome.message.slice(0, 72)
                        : rs.title}
                </p>
            </div>

            {/* Right badge */}
            {showOutcome && (rs.state === "done" || cancelled) && (
                <span className={cn(
                    "text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border shrink-0",
                    applied
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/25"
                )}>
                    {applied ? "applied" : cancelled ? "cancelled" : "blocked"}
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

function ruleStatusLabel(rs: RuleFixStatus) {
    if (rs.state === "applying") return "running";
    if (rs.state === "pending") return "queued";
    if (rs.state === "skipped") return "skipped";
    if (rs.state === "cancelled") return "cancelled";
    if (rs.outcome?.status === "Applied") return "applied";
    return "blocked";
}

function ruleStatusTone(rs: RuleFixStatus) {
    if (rs.state === "applying") return "border-[#2496ED]/30 bg-[#2496ED]/10 text-[#2496ED]";
    if (rs.state === "pending") return "border-white/8 bg-white/[0.025] text-white/35";
    if (rs.state === "skipped") return "border-white/8 bg-white/[0.015] text-white/25";
    if (rs.outcome?.status === "Applied") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
}

function RuleStatusIcon({ rs }: { rs: RuleFixStatus }) {
    const applied = rs.outcome?.status === "Applied";
    const cancelled = rs.state === "cancelled";

    if (rs.state === "applying") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2496ED]" />;
    if (rs.state === "done" || cancelled) {
        return applied
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            : <XCircle className="h-3.5 w-3.5 text-rose-400" />;
    }
    return <span className="mt-0.5 inline-block h-3 w-3 rounded-full border border-white/15" />;
}

function RuleEvidenceRow({
    rs,
    defaultExpanded = false,
    position,
}: {
    rs: RuleFixStatus;
    defaultExpanded?: boolean;
    position?: string;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const isActive = rs.state === "applying";
    const isRecreate = isContainerRecreateRule(rs.ruleId);
    const evidenceEvents = coalesceFixProgressEvents(rs.progressEvents);
    const eventCount = evidenceEvents.length;
    const summary = rs.state === "skipped"
        ? "Skipped by selection"
        : rs.state === "cancelled"
        ? "Cancelled before completion"
        : rs.outcome?.message ?? rs.title;

    return (
        <div className={cn("group transition-colors", isActive && "bg-[#2496ED]/5")}>
            <button
                type="button"
                onClick={() => setExpanded(open => !open)}
                className="grid w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_auto_18px] items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.025]"
                aria-expanded={expanded}
            >
                <span className="mt-1 flex h-4 w-4 items-center justify-center">
                    <RuleStatusIcon rs={rs} />
                </span>
                <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-white/62">{rs.ruleId}</span>
                        {isRecreate && (
                            <span className="rounded border border-amber-500/22 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300/85">
                                recreate
                            </span>
                        )}
                        {rs.highRisk && (
                            <span className="inline-flex items-center gap-1 rounded border border-rose-500/22 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-300/85">
                                <ShieldAlert className="h-2.5 w-2.5" /> risky
                            </span>
                        )}
                        {rs.autoTriggered && (
                            <span className="rounded border border-[#2496ED]/25 bg-[#2496ED]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#2496ED]" title={`Triggered by ${rs.triggeredByRuleIds?.join(", ") ?? "another fix"}`}>
                                auto-triggered
                            </span>
                        )}
                    </span>
                    <span className={cn(
                        "mt-1 block truncate text-xs leading-snug",
                        rs.state === "applying" ? "text-white/82" : rs.outcome?.status === "Applied" ? "text-[#2496ED]" : rs.outcome?.status === "Blocked" ? "text-rose-300/82" : "text-white/48",
                    )}>
                        {summary}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]", ruleStatusTone(rs))}>
                        {ruleStatusLabel(rs)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded border border-white/8 bg-white/[0.025] px-1.5 py-0.5 font-mono text-[9px] text-white/35">
                        <Terminal className="h-2.5 w-2.5 text-[#2496ED]/70" />
                        {eventCount} event{eventCount === 1 ? "" : "s"}
                    </span>
                    {position && (
                        <span className="font-mono text-[9px] text-white/24">{position}</span>
                    )}
                </span>
                <ChevronRight className={cn("mt-1 h-3.5 w-3.5 text-white/28 transition-transform group-hover:text-white/55", expanded && "rotate-90 text-[#2496ED]")} />
            </button>

            {expanded && (
                <div className="px-3 pb-3 pl-10">
                    <ProgressEventsPanel
                        progressEvents={evidenceEvents}
                        title={`rule ${rs.ruleId} evidence stream`}
                        emptyMessage={rs.state === "pending" ? "Waiting for this rule to start" : "No streamed evidence captured"}
                        className="shadow-none"
                        resizable
                        storageKey={`dokuru_fix_all_evidence_${rs.ruleId}`}
                        defaultHeight={isActive ? 320 : 260}
                        minHeight={180}
                        maxHeight={900}
                    />
                </div>
            )}
        </div>
    );
}

// ── Confirm step ──────────────────────────────────────────────────────────────

function ConfirmStep({
    ruleStatuses, selectedCount, hasCgroupSelection, cgroupLoading, onConfirm, onCancel, onToggleRule, onSetAllSelected,
}: {
    ruleStatuses: RuleFixStatus[];
    selectedCount: number;
    hasCgroupSelection: boolean;
    cgroupLoading: boolean;
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
                <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3.5 py-3">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-semibold text-rose-300">
                                Risky fixes stay unselected
                            </p>
                            <p className="text-xs text-rose-200/65 leading-relaxed">
                                Host storage, user namespace, and recreate fixes can restart Docker or break workloads if prerequisites are wrong.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {recreateCount > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-semibold text-amber-300">
                                {recreateCount} rule{recreateCount > 1 ? "s" : ""} require container restart
                            </p>
                            <p className="text-xs text-amber-200/65 leading-relaxed">
                                Selected fixes may stop, recreate, and restart affected containers. Expect short downtime.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {cgroupLoading && (
                <div className="rounded-lg border border-[#2496ED]/25 bg-[#2496ED]/8 px-3.5 py-3">
                    <div className="flex items-start gap-3">
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#2496ED]" />
                        <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-semibold text-[#2496ED]">
                                Loading cgroup resource preview
                            </p>
                            <p className="text-xs leading-relaxed text-[#2496ED]/65">
                                Inspecting current containers before showing editable memory, CPU, and PID values.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/38">
                        {selectedCount} of {ruleStatuses.length} rules selected
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onSetAllSelected(true)}
                            disabled={cgroupLoading}
                            className="text-xs font-medium text-[#2496ED]/75 hover:text-[#2496ED] disabled:pointer-events-none disabled:opacity-40"
                        >
                            Select all
                        </button>
                        <span className="text-white/15">/</span>
                        <button
                            type="button"
                            onClick={() => onSetAllSelected(false)}
                            disabled={cgroupLoading}
                            className="text-xs font-medium text-white/35 hover:text-white/70 disabled:pointer-events-none disabled:opacity-40"
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
                            selectable={!cgroupLoading}
                            onToggle={onToggleRule}
                        />
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onCancel}
                    disabled={cgroupLoading}
                    className="h-9 flex-1 rounded-md border border-white/12 bg-white/[0.03] px-4 text-sm font-medium text-white/60 transition-all hover:bg-white/[0.07] hover:text-white/90 disabled:pointer-events-none disabled:opacity-45"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    disabled={selectedCount === 0 || cgroupLoading}
                    className="audit-on-primary inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[#2496ED] px-4 text-sm font-semibold text-white transition-all hover:bg-[#1e80cc] active:scale-[0.98] disabled:bg-white/10 disabled:text-white/25 disabled:shadow-none"
                >
                    {cgroupLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {cgroupLoading
                        ? "Loading resources..."
                        : hasCgroupSelection
                        ? "Configure Resources"
                        : `Apply ${selectedCount} Selected`}
                </button>
            </div>
        </div>
    );
}

// ── Configure resources step ──────────────────────────────────────────────────

function ruleValueLabel(ruleId: CgroupRuleId) {
    if (ruleId === "5.25") return "Cgroup usage";
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
    const needsConcreteLimit = selectedCgroupRuleIds.includes("5.25") && !showMemory && !showCpu && !showPids;
    const hasInvalidValues = cgroupTargets.some((target) => (
        (showMemory && target.ruleIds.some((ruleId) => ruleId === "5.11") && (!Number.isFinite(target.memoryMb) || target.memoryMb < CGROUP_RESOURCE_MINIMUMS.memoryMb))
        || (showCpu && target.ruleIds.some((ruleId) => ruleId === "5.12") && (!Number.isFinite(target.cpuShares) || target.cpuShares < CGROUP_RESOURCE_MINIMUMS.cpuShares))
        || (showPids && target.ruleIds.some((ruleId) => ruleId === "5.29") && (!Number.isFinite(target.pidsLimit) || target.pidsLimit < CGROUP_RESOURCE_MINIMUMS.pidsLimit))
    )) || needsConcreteLimit;

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-[#2496ED]/20 bg-[#2496ED]/7 px-4 py-3 text-sm text-[#2496ED]/80">
                <div className="flex items-start gap-2.5">
                    <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="leading-relaxed">
                        Configure cgroup values before bulk apply. Compose-managed containers default to standard override files; standalone containers use Docker live updates.
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

            {needsConcreteLimit && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200/80">
                    Select 5.11, 5.12, or 5.29 with 5.25 to choose which concrete cgroup limit should be applied.
                </div>
            )}

            {cgroupLoading ? (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/45">
                    <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-[#2496ED]" />
                    Loading cgroup target preview...
                </div>
            ) : needsConcreteLimit ? null : cgroupTargets.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-300/80">
                    The agent preview did not find cgroup targets that still need these selected fixes. Applying will let the agent verify and no-op if everything already matches.
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).map(([group, targets]) => (
                        <div key={group} className="audit-fix-target-list overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                            <div className="border-b border-white/6 bg-white/[0.025] px-3 py-2">
                                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{group}</p>
                            </div>
                            <div className="divide-y divide-white/6">
                                {targets.map((target) => {
                                    const canCompose = Boolean(target.composeProject && target.composeService);
                                    const hasMemory = target.ruleIds.some((ruleId) => ruleId === "5.11");
                                    const hasCpu = target.ruleIds.some((ruleId) => ruleId === "5.12");
                                    const hasPids = target.ruleIds.some((ruleId) => ruleId === "5.29");
                                    const resources: CgroupResourceField[] = [];

                                    if (showMemory) {
                                        resources.push({
                                            key: "memoryMb",
                                            label: "Memory",
                                            unit: "MB",
                                            value: target.memoryMb,
                                            min: CGROUP_RESOURCE_MINIMUMS.memoryMb,
                                            enabled: hasMemory,
                                            onChange: (value) => onUpdateTarget(target.key, { memoryMb: value }),
                                        });
                                    }

                                    if (showCpu) {
                                        resources.push({
                                            key: "cpuShares",
                                            label: "CPU",
                                            unit: "shares",
                                            value: target.cpuShares,
                                            min: CGROUP_RESOURCE_MINIMUMS.cpuShares,
                                            enabled: hasCpu,
                                            onChange: (value) => onUpdateTarget(target.key, { cpuShares: value }),
                                        });
                                    }

                                    if (showPids) {
                                        resources.push({
                                            key: "pidsLimit",
                                            label: "Limit",
                                            unit: "PIDs",
                                            value: target.pidsLimit,
                                            min: CGROUP_RESOURCE_MINIMUMS.pidsLimit,
                                            enabled: hasPids,
                                            onChange: (value) => onUpdateTarget(target.key, { pidsLimit: value }),
                                        });
                                    }

                                    return (
                                        <CgroupTargetEditor
                                            key={target.key}
                                            containerName={target.composeService ?? target.containerName}
                                            canCompose={canCompose}
                                            sourceLabel={canCompose ? "compose" : "runtime"}
                                            sourceDetail={canCompose ? target.containerName : target.image || "standalone"}
                                            strategy={target.strategy}
                                            onStrategyChange={(strategy) => onUpdateTarget(target.key, { strategy })}
                                            resources={resources}
                                        />
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
                    disabled={cgroupLoading || hasInvalidValues}
                    className="audit-on-primary flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] disabled:bg-white/10 disabled:text-white/25 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all active:scale-[0.98]"
                >
                    Apply {selectedCount} Selected
                </button>
            </div>
        </div>
    );
}

// ── Applying step ─────────────────────────────────────────────────────────────

function ApplyingStep({
    ruleStatuses, currentIndex, onCancel,
}: {
    ruleStatuses: RuleFixStatus[];
    currentIndex: number;
    onCancel: () => void;
}) {
    const selected = ruleStatuses.filter(r => r.selected);
    const done = selected.filter(r => r.state === "done").length;
    const total = selected.length;
    const active = selected.find(r => r.state === "applying") ?? selected[Math.min(Math.max(currentIndex, 0), Math.max(selected.length - 1, 0))];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
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

            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
                <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                            Current rule
                        </p>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                            <span className="rounded border border-[#2496ED]/25 bg-[#2496ED]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#2496ED]">
                                {active?.ruleId ?? "-"}
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold text-white/82">
                                {active?.title ?? "Waiting for selected fixes"}
                            </span>
                        </div>
                    </div>
                    <span className="shrink-0 rounded border border-white/8 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/38">
                        {Math.min(currentIndex + 1, total)}/{total}
                    </span>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
                    <div
                        className="h-full rounded-full bg-[#2496ED] transition-all duration-500"
                        style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-white/[0.018] px-3 py-2.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-300/75" />
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-white/78">Need to stop the batch?</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-rose-100/42">
                                Stops the active stream and skips remaining selected rules.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-destructive/35 bg-transparent px-3 text-xs font-semibold text-destructive transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground sm:self-auto"
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel Fix All
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-white/[0.025] px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Selected queue & evidence</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">expand any rule for evidence</span>
                </div>
                <div className="divide-y divide-white/6">
                    {selected.map((rs, index) => (
                        <RuleEvidenceRow
                            key={`${rs.ruleId}-${rs.ruleId === active?.ruleId ? "active" : "idle"}`}
                            rs={rs}
                            defaultExpanded={rs.ruleId === active?.ruleId}
                            position={`${index + 1}/${total}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function uniqueLabels(values: Array<string | undefined | null>) {
    return Array.from(new Set(values.map(value => value?.trim()).filter(Boolean))) as string[];
}

function mergeProgressEvents(base: FixProgress[], live: FixProgress[]) {
    return appendFixProgressEvents(base, live);
}

// ── Result step ───────────────────────────────────────────────────────────────

function ResultStep({
    ruleStatuses, onRerunAudit, onRetry, onClose,
}: {
    ruleStatuses: RuleFixStatus[];
    onRerunAudit: () => void;
    onRetry: () => void;
    onClose: () => void;
}) {
    const selected = ruleStatuses.filter(r => r.selected);
    const applied = selected.filter(r => r.outcome?.status === "Applied").length;
    const cancelled = selected.filter(r => r.state === "cancelled").length;
    const blocked = selected.filter(r => r.outcome?.status === "Blocked" && r.state !== "cancelled").length;
    const unresolved = blocked + cancelled;
    const skipped = ruleStatuses.filter(r => r.state === "skipped").length;
    const autoTriggered = selected.filter(r => r.autoTriggered).length;
    const allApplied = selected.length > 0 && applied === selected.length;
    const selectedEvidence = selected.map(rs => coalesceFixProgressEvents(rs.progressEvents));
    const evidenceCount = selectedEvidence.reduce((sum, events) => sum + events.length, 0);
    const targets = uniqueLabels(selectedEvidence.flatMap(events => events.map(event => event.container_name)));
    const unresolvedLabel = [
        applied > 0 ? `${applied} applied` : null,
        blocked > 0 ? `${blocked} blocked` : null,
        cancelled > 0 ? `${cancelled} cancelled` : null,
    ].filter(Boolean).join(", ") || "No fixes applied";

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
                            : unresolvedLabel
                        }
                    </p>
                    <p className={cn("text-xs mt-0.5", allApplied ? "text-emerald-400/70" : "text-amber-400/70")}>
                        {allApplied
                            ? `${autoTriggered > 0 ? `${autoTriggered} dependent check(s) were auto-triggered and verified. ` : ""}${skipped > 0 ? `${skipped} rule(s) were skipped by selection. ` : ""}Re-run the audit to see the updated score.`
                            : "Fixes were not fully applied. Retry after adjusting selection, permissions, or target availability."
                        }
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">applied</p>
                    <p className="mt-1 text-xl font-bold text-[#2496ED]">{applied}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">unresolved</p>
                    <p className="mt-1 text-xl font-bold text-rose-400">{unresolved}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">evidence</p>
                    <p className="mt-1 text-xl font-bold text-white/82">{evidenceCount}</p>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">targets</p>
                    <p className="mt-1 text-xl font-bold text-white/82">{targets.length}</p>
                </div>
            </div>

            {skipped > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 text-xs text-white/42">
                    <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/35" />
                        <p className="leading-relaxed">
                            {skipped} rule(s) were intentionally skipped by selection. High-risk rules stay available in the rule list, but they are not mixed into the evidence ledger unless you selected them.
                        </p>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
                <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-white/[0.025] px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Selected results & evidence</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">{evidenceCount} events</span>
                </div>
                <div className="divide-y divide-white/6">
                    {selected.map((rs, index) => (
                        <RuleEvidenceRow
                            key={rs.ruleId}
                            rs={rs}
                            defaultExpanded={rs.outcome?.status === "Blocked" || rs.state === "cancelled"}
                            position={`${index + 1}/${selected.length}`}
                        />
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={onClose}
                    className="flex-1 rounded-md border border-white/12 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/90 transition-all"
                >
                    Close
                </button>
                {allApplied ? (
                    <button
                        onClick={onRerunAudit}
                        className="audit-on-primary flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Re-run Audit
                    </button>
                ) : (
                    <button
                        onClick={onRetry}
                        className="audit-on-primary flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98]"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try Again
                    </button>
                )}
            </div>
        </div>
    );
}

// ── FixAllWizard (main export) ────────────────────────────────────────────────

interface FixAllWizardProps {
    open: boolean;
    agentId: string;
    step: FixAllStep;
    currentIndex: number;
    ruleStatuses: RuleFixStatus[];
    selectedCount: number;
    cgroupTargets: CgroupTargetConfig[];
    cgroupLoading: boolean;
    selectedCgroupRuleIds: CgroupRuleId[];
    onConfirm: () => void;
    onCancelApply: () => void;
    onClose: () => void;
    onRerunAudit: () => void;
    onRetry: () => void;
    onToggleRule: (ruleId: string) => void;
    onSetAllSelected: (selected: boolean) => void;
    onUpdateCgroupTarget: (key: string, patch: Partial<CgroupTargetConfig>) => void;
    onBackToConfirm: () => void;
}

export function FixAllWizard({
    open, agentId, step, currentIndex, ruleStatuses, selectedCount,
    cgroupTargets, cgroupLoading, selectedCgroupRuleIds,
    onConfirm, onCancelApply, onClose, onRerunAudit, onRetry, onToggleRule, onSetAllSelected,
    onUpdateCgroupTarget, onBackToConfirm,
}: FixAllWizardProps) {
    const showConfigure = selectedCgroupRuleIds.length > 0 || step === "configure";
    const fixJobs = useAuditStore((state) => state.fixJobs);
    const liveRuleStatuses = ruleStatuses.map((status) => {
        const job = fixJobs[fixJobKey(agentId, status.ruleId)];
        if (!job || status.state !== "applying") return status;

        return {
            ...status,
            outcome: job.outcome ?? status.outcome,
            progressEvents: mergeProgressEvents(status.progressEvents, job.progressEvents),
        };
    });
    const selectedStatuses = liveRuleStatuses.filter((status) => status.selected);
    const resultComplete = step === "result"
        && selectedStatuses.length > 0
        && selectedStatuses.every((status) => status.outcome?.status === "Applied");

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <ResizableSheetContent
                side="right"
                showCloseButton={false}
                storageKey="dokuru_fix_all_sheet_width"
                defaultWidth={560}
                minWidth={420}
                className="bg-background border-l"
            >
                <SheetClose
                    className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </SheetClose>
                {/* Header */}
                <SheetHeader className="px-6 pt-6 pb-5 border-b space-y-5">
                    <div className="pr-12">
                        <div className="min-w-0 space-y-1.5">
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                                Bulk remediation
                            </p>
                            <SheetTitle className="text-lg font-semibold text-white leading-snug">
                                Apply selected fixes
                            </SheetTitle>
                            <SheetDescription className="sr-only">
                                Review selected rules, configure editable values, apply fixes, and inspect the result.
                            </SheetDescription>
                            <p className="text-xs text-white/45">
                                {selectedCount} of {ruleStatuses.length} rules selected
                            </p>
                        </div>
                    </div>
                    <StepIndicator current={step} showConfigure={showConfigure} complete={resultComplete} />
                </SheetHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {step === "confirm" && (
                        <ConfirmStep
                            ruleStatuses={liveRuleStatuses}
                            selectedCount={selectedCount}
                            hasCgroupSelection={selectedCgroupRuleIds.length > 0}
                            cgroupLoading={cgroupLoading}
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
                        <ApplyingStep ruleStatuses={liveRuleStatuses} currentIndex={currentIndex} onCancel={onCancelApply} />
                    )}
                    {step === "result" && (
                        <ResultStep
                            ruleStatuses={liveRuleStatuses}
                            onRerunAudit={onRerunAudit}
                            onRetry={onRetry}
                            onClose={onClose}
                        />
                    )}
                </div>
            </ResizableSheetContent>
        </Sheet>
    );
}
