import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
    ArrowDownToLine, ArrowRight, Check, ChevronRight, Copy, GripHorizontal, ShieldAlert, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FixProgress } from "@/lib/api/agent-direct";
import { coalesceFixProgressEvents } from "@/lib/fix-progress-events";

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
            className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 font-mono text-[10px] leading-none text-white/45 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white/75"
        >
            {copied ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} /> : <Copy className="h-3 w-3 shrink-0" />}
            {copied ? "copied" : "copy"}
        </button>
    );
}

function progressStatusLabel(status: FixProgress["status"]) {
    if (status === "in_progress") return "progress";
    if (status === "done") return "result";
    return status;
}

function detailBlockLabel(status: FixProgress["status"]) {
    if (status === "in_progress") return "progress detail";
    if (status === "done") return "result detail";
    if (status === "error") return "error detail";
    return "event detail";
}

function silentCommandNote(event: FixProgress) {
    if (!event.command || !event.detail || event.stdout || event.stderr) return null;
    if (event.status === "in_progress") {
        return "No command output has been captured yet; this progress line comes from Dokuru's live monitor.";
    }
    if (event.status === "done") {
        return "Command finished without output; the result detail above is Dokuru's observed outcome.";
    }
    if (event.status === "error") {
        return "Command emitted no output; the error detail above is the captured failure.";
    }
    return "Command emitted no output; Dokuru recorded the status detail above.";
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
    const detailCanExpand = Boolean(event.detail && event.detail.length > 72);
    const noStdoutNote = silentCommandNote(event);
    const combinedOutput = [event.stdout, event.stderr].filter(Boolean).join("\n").trim();
    const hasCapturedOutput = Boolean(combinedOutput);
    const defaultExpanded = isError || hasCapturedOutput;
    const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
    const expanded = expandedOverride ?? defaultExpanded;
    const hasStructuredExtras = Boolean(event.command || event.stdout || event.stderr || noStdoutNote);
    const hasExtras = hasStructuredExtras || detailCanExpand;
    const statusLabel = progressStatusLabel(event.status);

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
                onClick={() => hasExtras && setExpandedOverride(current => !(current ?? defaultExpanded))}
            >
                <span className={cn("pt-0.5 text-[10px] uppercase tracking-[0.08em]", tone)}>{statusLabel}</span>
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
                    {event.detail && hasStructuredExtras && (
                        <div className="rounded-lg border border-white/8 bg-black/35 px-3 py-2.5 shadow-inner">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">{detailBlockLabel(event.status)}</p>
                                <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/60">
                                    {event.detail}
                                </pre>
                            </div>
                        </div>
                    )}
                    {event.command && (
                        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-[#2496ED]/20 bg-[#06111a] px-3 py-2.5 shadow-inner">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#2496ED]/45">command</p>
                                <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[#58b8ff]">
                                    <span className="select-none text-[#2496ED]/40">$ </span>{event.command}
                                </pre>
                            </div>
                            <CopyButton text={event.command} />
                        </div>
                    )}
                    {!isError && combinedOutput && (
                        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-white/8 bg-black/45 px-3 py-2.5 shadow-inner">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-300/35">output</p>
                                <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/62">
                                    {combinedOutput}
                                </pre>
                            </div>
                            <CopyButton text={combinedOutput} />
                        </div>
                    )}
                    {isError && (event.stdout || event.stderr) && (
                        <div className="overflow-hidden rounded-lg border border-rose-500/20 bg-[#1a0505] shadow-inner">
                            {event.stdout && (
                                <div className="flex min-w-0 items-start gap-2 border-b border-white/5 px-3 py-2.5 last:border-0">
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-300/35">stdout</p>
                                        <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-emerald-300/80">
                                            {event.stdout}
                                        </pre>
                                    </div>
                                    <CopyButton text={event.stdout} />
                                </div>
                            )}
                            {event.stderr && (
                                <div className="flex min-w-0 items-start gap-2 px-3 py-2.5">
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-rose-300/45">stderr</p>
                                        <pre className="whitespace-pre-wrap break-words text-[10px] font-medium leading-relaxed text-rose-300/90">
                                            {event.stderr}
                                        </pre>
                                    </div>
                                    <CopyButton text={event.stderr} />
                                </div>
                            )}
                        </div>
                    )}
                    {noStdoutNote && (
                        <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-[10px] leading-relaxed text-white/38">
                            {noStdoutNote}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function clampPanelHeight(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.round(value)));
}

function panelFocusHeight(minHeight: number, maxHeight: number) {
    if (typeof window === "undefined") return clampPanelHeight(640, minHeight, maxHeight);
    return clampPanelHeight(window.innerHeight - 220, minHeight, maxHeight);
}

export function ProgressEventsPanel({
    progressEvents,
    title = "live evidence stream",
    showRuleId = false,
    emptyMessage,
    className,
    maxHeightClassName = "max-h-[300px]",
    resizable = false,
    storageKey = "dokuru_progress_events_panel_height",
    defaultHeight = 360,
    minHeight = 220,
    maxHeight = 960,
    autoScrollDefault = true,
}: {
    progressEvents: FixProgress[];
    title?: string;
    showRuleId?: boolean;
    emptyMessage?: string;
    className?: string;
    maxHeightClassName?: string;
    resizable?: boolean;
    storageKey?: string;
    defaultHeight?: number;
    minHeight?: number;
    maxHeight?: number;
    autoScrollDefault?: boolean;
}) {
    const [filterError, setFilterError] = useState(false);
    const [panelHeight, setPanelHeight] = useState(() => {
        if (!resizable || typeof window === "undefined") return clampPanelHeight(defaultHeight, minHeight, maxHeight);
        const saved = Number(window.localStorage.getItem(storageKey));
        return Number.isFinite(saved)
            ? clampPanelHeight(saved, minHeight, maxHeight)
            : clampPanelHeight(defaultHeight, minHeight, maxHeight);
    });
    const [autoScroll, setAutoScroll] = useState(autoScrollDefault);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const programmaticScrollRef = useRef(false);

    const normalizedEvents = coalesceFixProgressEvents(progressEvents);
    const hasErrors = normalizedEvents.some(e => e.status === "error");
    const displayedEvents = filterError ? normalizedEvents.filter(e => e.status === "error") : normalizedEvents;
    const lastEvent = displayedEvents.at(-1);
    const eventSignature = [
        displayedEvents.length,
        lastEvent?.rule_id,
        lastEvent?.container_name,
        lastEvent?.action,
        lastEvent?.status,
        lastEvent?.detail?.length,
        lastEvent?.stdout?.length,
        lastEvent?.stderr?.length,
    ].join("|");

    function scrollToBottom(behavior: ScrollBehavior = "auto") {
        const node = scrollRef.current;
        if (!node) return;
        programmaticScrollRef.current = true;
        node.scrollTo({ top: node.scrollHeight, behavior });
        window.setTimeout(() => {
            programmaticScrollRef.current = false;
        }, 120);
    }

    useEffect(() => {
        if (!autoScroll) return;
        const frame = window.requestAnimationFrame(() => scrollToBottom());
        return () => window.cancelAnimationFrame(frame);
    }, [autoScroll, eventSignature]);

    if (progressEvents.length === 0 && !emptyMessage) return null;

    function updatePanelHeight(nextHeight: number) {
        const next = clampPanelHeight(nextHeight, minHeight, maxHeight);
        setPanelHeight(next);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, String(next));
        }
    }

    function focusPanelHeight() {
        updatePanelHeight(panelFocusHeight(minHeight, maxHeight));
        panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function handleScroll() {
        if (programmaticScrollRef.current) return;
        const node = scrollRef.current;
        if (!node) return;
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        if (distanceFromBottom > 56 && autoScroll) {
            setAutoScroll(false);
        } else if (distanceFromBottom <= 8 && !autoScroll) {
            setAutoScroll(true);
        }
    }

    function toggleAutoScroll() {
        setAutoScroll((enabled) => {
            if (!enabled) window.requestAnimationFrame(() => scrollToBottom("smooth"));
            return !enabled;
        });
    }

    function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!resizable) return;
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = panelHeight;
        const originalCursor = document.body.style.cursor;
        const originalUserSelect = document.body.style.userSelect;
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";

        const onPointerMove = (moveEvent: PointerEvent) => {
            updatePanelHeight(startHeight + moveEvent.clientY - startY);
        };
        const onPointerUp = () => {
            document.body.style.cursor = originalCursor;
            document.body.style.userSelect = originalUserSelect;
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
    }

    return (
        <div ref={panelRef} className={cn("overflow-hidden rounded-xl border border-white/10 bg-[#030507] shadow-xl", className)}>
            <div className="flex min-w-0 items-center gap-2 border-b border-white/8 bg-white/[0.025] px-3 py-2.5">
                <div className="flex shrink-0 items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                </div>
                <Terminal className="ml-1 h-3.5 w-3.5 shrink-0 text-[#2496ED]" />
                <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/42">{title}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {resizable && (
                        <>
                            <button
                                type="button"
                                title="Drag to resize evidence height"
                                onPointerDown={startResize}
                                className="hidden h-6 cursor-row-resize items-center rounded border border-white/8 bg-white/[0.025] px-1.5 text-white/28 transition-colors hover:bg-white/[0.07] hover:text-white/65 sm:inline-flex"
                            >
                                <GripHorizontal className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => updatePanelHeight(panelHeight - 160)}
                                className="hidden h-6 rounded border border-white/8 bg-white/[0.025] px-2 font-mono text-[10px] text-white/38 transition-colors hover:bg-white/[0.07] hover:text-white/70 sm:inline-flex sm:items-center"
                            >
                                -
                            </button>
                            <button
                                type="button"
                                onClick={focusPanelHeight}
                                className="hidden h-6 rounded border border-[#2496ED]/18 bg-[#2496ED]/8 px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#2496ED]/80 transition-colors hover:bg-[#2496ED]/14 hover:text-[#58b8ff] sm:inline-flex sm:items-center"
                            >
                                Focus
                            </button>
                            <button
                                type="button"
                                onClick={() => updatePanelHeight(panelHeight + 160)}
                                className="hidden h-6 rounded border border-white/8 bg-white/[0.025] px-2 font-mono text-[10px] text-white/38 transition-colors hover:bg-white/[0.07] hover:text-white/70 sm:inline-flex sm:items-center"
                            >
                                +
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={toggleAutoScroll}
                        className={cn(
                            "inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
                            autoScroll
                                ? "border-[#2496ED]/28 bg-[#2496ED]/10 text-[#58b8ff]"
                                : "border-amber-400/25 bg-amber-400/8 text-amber-300 hover:bg-amber-400/12",
                        )}
                        title={autoScroll ? "Auto-scroll is on" : "Auto-scroll is off; click to jump to bottom"}
                    >
                        {autoScroll ? <Check className="h-2.5 w-2.5" /> : <ArrowDownToLine className="h-2.5 w-2.5" />}
                        {autoScroll ? "Auto" : "Bottom"}
                    </button>
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
            <div
                className={cn(
                    !resizable && maxHeightClassName,
                    "min-w-0 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed sm:p-3 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10",
                )}
                style={resizable ? { height: panelHeight } : undefined}
                ref={scrollRef}
                onScroll={handleScroll}
            >
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
            {resizable && (
                <button
                    type="button"
                    aria-label="Resize evidence stream height"
                    onPointerDown={startResize}
                    className="flex h-8 w-full cursor-row-resize items-center justify-center gap-2 border-t border-white/8 bg-white/[0.028] font-mono text-[9px] uppercase tracking-[0.12em] text-white/30 transition-colors hover:bg-white/[0.065] hover:text-white/60"
                >
                    <GripHorizontal className="h-3.5 w-3.5" />
                    Drag height
                </button>
            )}
        </div>
    );
}
