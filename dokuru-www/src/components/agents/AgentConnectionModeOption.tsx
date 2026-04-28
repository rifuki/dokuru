import { Cloud, Globe, Link2, type LucideIcon } from "lucide-react";
import type { AgentAccessMode } from "@/components/agents/AgentConnectionMode";

const MODE_META: Record<AgentAccessMode, { label: string; description: string; Icon: LucideIcon }> = {
    cloudflare: {
        label: "Cloudflare Tunnel",
        description: "Instant HTTPS tunnel, no domain required.",
        Icon: Cloud,
    },
    relay: {
        label: "Relay Mode",
        description: "No inbound port and no public URL.",
        Icon: Link2,
    },
    direct: {
        label: "Direct HTTP",
        description: "Use your own reverse proxy endpoint.",
        Icon: Globe,
    },
    domain: {
        label: "Custom Domain",
        description: "Use a domain or reverse proxy you control.",
        Icon: Globe,
    },
};

export function AgentConnectionModeOption<TMode extends AgentAccessMode>({
    mode,
    checked,
    badge,
    onSelect,
}: {
    mode: TMode;
    checked: boolean;
    badge?: string;
    onSelect: (mode: TMode) => void;
}) {
    const { label, description, Icon } = MODE_META[mode];

    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onSelect(mode)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                checked
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-background/80"
            }`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${checked ? "bg-primary text-primary-foreground" : "bg-muted text-primary"}`}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {label}
                    {badge && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {badge}
                        </span>
                    )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
            </span>
        </button>
    );
}
