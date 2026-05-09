import { useState } from "react";
import {
    ArrowRight, Check, ChevronRight, Copy, ShieldAlert, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FixProgress } from "@/lib/api/agent-direct";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 transition-colors hover:text-white/70"
        >
            {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
            {copied ? "copied" : "copy"}
        </button>
    );
}

function ProgressEventRow({
    event,
    isError,
    showRuleId,
}: {
    event: FixProgress;
    isError: boolean;
    showRuleId: boolean;
}) {
    const [expanded, setExpanded] = useState(isError);
    const detailCanExpand = Boolean(event.detail && event.detail.length > 72);
    const hasStructuredExtras = Boolean(event.command || event.stdout || event.stderr);
    const hasExtras = hasStructuredExtras || detailCanExpand;

    const tone = event.status === "done"
        ? "text-emerald-400"
        : event.status === "error"
        ? "text-rose-400 font-bold"
        : "text-[#2496ED]";

    return (
        <div className={cn(
            "group flex min-w-0 flex-col border-b border-white/5 py-2.5 transition-colors first:pt-0 last:border-b-0 last:pb-0",
            isError && "-mx-2 border-y border-y-rose-500/10 bg-rose-500/[0.02] px-2 first:border-t-0 sm:-mx-3 sm:px-3",
        )}>
            <button
                type="button"
                disabled={!hasExtras}
                className={cn(
                    "grid w-full min-w-0 grid-cols-[88px_minmax(0,1fr)_18px] items-start gap-2 rounded-md text-left transition-colors disabled:cursor-default",
                    hasExtras && "-mx-1 -my-1 cursor-pointer px-1 py-1 hover:bg-white/[0.03] sm:-mx-2 sm:px-2",
                )}
                onClick={() => hasExtras && setExpanded(e => !e)}
            >
                <span className={cn("pt-0.5 text-[10px] uppercase tracking-[0.08em]", tone)}>{event.status}</span>
                <div className="min-w-0 space-y-0.5 text-white/52">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {showRuleId && event.rule_id && (
                            <span className="shrink-0 rounded border border-[#2496ED]/18 bg-[#2496ED]/8 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#2496ED]/80">
                                {event.rule_id}
                            </span>
                        )}
                        <span className="min-w-0 truncate font-semibold text-white/80">{event.container_name || "dokuru-agent"}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-white/20" />
                        <span className="min-w-0 truncate font-medium text-[#2496ED]/80">{event.action}</span>
                    </div>
                    {event.detail && (
                        <p className={cn(
                            detailCanExpand && expanded ? "whitespace-pre-wrap break-words text-white/40" : "truncate text-white/40",
                            isError && "text-rose-300/80",
                        )}>
                            {event.detail}
                        </p>
                    )}
                </div>
                {hasExtras && (
                    <span className="pt-0.5 text-white/30 group-hover:text-white/60">
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                    </span>
                )}
            </button>

            {expanded && hasStructuredExtras && (
                <div className="mt-3 min-w-0 space-y-2.5 pb-1 pr-1 sm:ml-[90px]">
                    {event.command && (
                        <div className="group/cmd relative">
                            <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg border border-[#2496ED]/20 bg-[#06111a] px-3 py-2.5 pr-12 text-[10px] text-[#58b8ff] shadow-inner">
                                <span className="select-none text-[#2496ED]/40">$ </span>{event.command}
                            </pre>
                            <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/cmd:opacity-100">
                                <CopyButton text={event.command} />
                            </div>
                        </div>
                    )}
                    {(event.stdout || event.stderr) && (
                        <div className={cn(
                            "overflow-hidden rounded-lg border shadow-inner",
                            isError ? "border-rose-500/20 bg-[#1a0505]" : "border-white/8 bg-black/45",
                        )}>
                            {event.stdout && (
                                <div className="group/out relative border-b border-white/5 last:border-0">
                                    <pre className="whitespace-pre-wrap break-words px-3 py-2.5 text-[10px] text-emerald-300/80">
                                        {event.stdout}
                                    </pre>
                                    <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/out:opacity-100">
                                        <CopyButton text={event.stdout} />
                                    </div>
                                </div>
                            )}
                            {event.stderr && (
                                <div className="group/err relative">
                                    <pre className={cn(
                                        "whitespace-pre-wrap break-words px-3 py-2.5 text-[10px] font-medium",
                                        isError ? "text-rose-300/90" : "text-white/55",
                                    )}>
                                        {event.stderr}
                                    </pre>
                                    <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/err:opacity-100">
                                        <CopyButton text={event.stderr} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ProgressEventsPanel({
    progressEvents,
    title = "live terminal transcript",
    showRuleId = false,
    emptyMessage,
}: {
    progressEvents: FixProgress[];
    title?: string;
    showRuleId?: boolean;
    emptyMessage?: string;
}) {
    const [filterError, setFilterError] = useState(false);

    if (progressEvents.length === 0 && !emptyMessage) return null;

    const hasErrors = progressEvents.some(e => e.status === "error");
    const displayedEvents = filterError ? progressEvents.filter(e => e.status === "error") : progressEvents;

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#030507] shadow-xl">
            <div className="flex min-w-0 items-center gap-2 border-b border-white/8 bg-white/[0.025] px-3 py-2.5">
                <div className="flex shrink-0 items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                </div>
                <Terminal className="ml-1 h-3.5 w-3.5 shrink-0 text-[#2496ED]" />
                <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">{title}</span>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {hasErrors && (
                        <button
                            type="button"
                            onClick={() => setFilterError(f => !f)}
                            className={cn(
                                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all",
                                filterError
                                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.15)]"
                                    : "border-white/8 bg-white/[0.03] text-white/40 hover:bg-white/[0.08] hover:text-white/60",
                            )}
                        >
                            <ShieldAlert className="h-2.5 w-2.5" />
                            Errors Only
                        </button>
                    )}
                    <span className="rounded border border-white/8 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-white/35">
                        {displayedEvents.length} {filterError ? "errors" : "events"}
                    </span>
                </div>
            </div>
            <div className="max-h-[300px] min-w-0 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed sm:p-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
                {displayedEvents.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-[10px] uppercase tracking-widest text-[#2496ED]/60">
                        <Terminal className="mr-2 h-3.5 w-3.5" /> {emptyMessage ?? "Waiting for agent progress"}
                    </div>
                ) : (
                    displayedEvents.map((event, i) => (
                        <ProgressEventRow
                            key={`${event.rule_id}-${event.container_name}-${event.action}-${event.step}-${i}`}
                            event={event}
                            isError={event.status === "error"}
                            showRuleId={showRuleId}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
