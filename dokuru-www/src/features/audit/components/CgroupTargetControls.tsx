import { Box, FileCode2, Server } from "lucide-react";
import { cn } from "@/lib/utils";

export type CgroupApplyStrategy = "docker_update" | "compose_update" | "dokuru_override";
export type CgroupResourceKey = "memoryMb" | "cpuShares" | "pidsLimit";

export const CGROUP_RESOURCE_MINIMUMS = {
    memoryMb: 64,
    cpuShares: 128,
    pidsLimit: 50,
} as const;

const CGROUP_APPLY_MODE_OPTIONS: { value: CgroupApplyStrategy; label: string; title: string }[] = [
    { value: "dokuru_override", label: "Override", title: "Write Compose override file" },
    { value: "compose_update", label: "Patch", title: "Patch source Compose YAML" },
    { value: "docker_update", label: "Live", title: "Update current container only" },
];

export type CgroupResourceField = {
    key: CgroupResourceKey;
    label: string;
    unit: string;
    value: number;
    min: number;
    enabled?: boolean;
    onChange: (value: number) => void;
};

function CgroupApplyModePicker({
    value,
    canCompose,
    onChange,
}: {
    value: CgroupApplyStrategy;
    canCompose: boolean;
    onChange: (strategy: CgroupApplyStrategy) => void;
}) {
    const effectiveValue = canCompose ? value : "docker_update";

    return (
        <div className="audit-fix-mode-control grid h-9 w-full grid-cols-3 overflow-hidden rounded-md border" role="radiogroup" aria-label="Apply mode">
            {CGROUP_APPLY_MODE_OPTIONS.map((option) => {
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
                            "audit-fix-mode-button h-full min-w-0 px-2 text-[10px] font-semibold transition-colors whitespace-nowrap outline-none",
                            active && "audit-fix-mode-button-active",
                            !active && "audit-fix-mode-button-idle",
                            disabled && "cursor-not-allowed opacity-35",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function ResourceValueInput({ field }: { field: CgroupResourceField }) {
    const enabled = field.enabled ?? true;
    const invalid = enabled && (!Number.isFinite(field.value) || field.value < field.min);

    return (
        <label className={cn("block min-w-0 text-[10px] text-white/35", !enabled && "opacity-45")}>
            <span className="audit-fix-target-value-label mb-1.5 block uppercase tracking-[0.12em]">
                {field.label} <span className="text-white/20">{field.unit}</span>
            </span>
            <input
                type="number"
                min={field.min}
                inputMode="numeric"
                disabled={!enabled}
                aria-label={`${field.label} ${field.unit}`}
                value={field.value > 0 ? field.value : ""}
                onChange={(event) => {
                    const input = event.target.value;
                    if (input === "") {
                        field.onChange(0);
                        return;
                    }

                    const value = Number(input);
                    if (Number.isFinite(value)) field.onChange(value);
                }}
                className={cn(
                    "audit-fix-number-input h-9 w-full rounded-md border bg-black/30 px-3 text-right text-[13px] font-semibold outline-none transition-colors focus:bg-black/45 disabled:cursor-not-allowed disabled:text-white/25",
                    invalid
                        ? "border-red-500/60 text-red-400 focus:border-red-500/80"
                        : "border-white/10 text-white/85 focus:border-[#2496ED]/60",
                )}
            />
            {invalid && (
                <span className="audit-fix-target-value-error mt-1 block text-[9px] text-red-400/80">
                    Min {field.min} {field.unit}
                </span>
            )}
        </label>
    );
}

export function CgroupTargetEditor({
    className,
    containerName,
    currentLabel,
    canCompose,
    sourceLabel,
    sourceDetail,
    strategy,
    resources,
    onStrategyChange,
}: {
    className?: string;
    containerName: string;
    currentLabel?: string;
    canCompose: boolean;
    sourceLabel: string;
    sourceDetail: string;
    strategy: CgroupApplyStrategy;
    resources: CgroupResourceField[];
    onStrategyChange: (strategy: CgroupApplyStrategy) => void;
}) {
    return (
        <div className={cn("audit-fix-target-row audit-fix-target-row-has-value text-xs font-mono", className)}>
            <div className="audit-fix-target-identity flex min-w-0 items-center gap-2.5 self-center">
                <Server className="h-3.5 w-3.5 shrink-0 text-white/32" />
                <div className="min-w-0">
                    <span className="block max-w-full truncate text-[13px] font-semibold leading-tight text-white/75">{containerName}</span>
                    {currentLabel && (
                        <span className="block max-w-full truncate text-[10px] leading-tight text-white/28">Current: {currentLabel}</span>
                    )}
                </div>
            </div>

            <div className="audit-fix-target-source flex min-w-0 items-center gap-2 self-center">
                {canCompose
                    ? <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[#2496ED]" />
                    : <Box className="h-3.5 w-3.5 shrink-0 text-white/35" />
                }
                <div className="min-w-0">
                    <span className={cn("block truncate text-[10px] uppercase tracking-[0.16em]", canCompose ? "text-[#2496ED]/80" : "text-white/35")}>{sourceLabel}</span>
                    <span className="block truncate text-[10px] text-white/30">{sourceDetail}</span>
                </div>
            </div>

            <CgroupApplyModePicker value={strategy} canCompose={canCompose} onChange={onStrategyChange} />

            <div className="audit-fix-target-value w-full">
                <div className="audit-fix-target-values-grid">
                    {resources.map((field) => (
                        <ResourceValueInput key={field.key} field={field} />
                    ))}
                </div>
            </div>
        </div>
    );
}
