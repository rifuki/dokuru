import { AlertCircle, CheckCircle2, Eraser, Loader2, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionEvidenceStream = "meta" | "stdout" | "stderr";
export type ActionEvidenceChunk = { id: number | string; stream: ActionEvidenceStream; data: string };

export type ActionEvidenceRun = {
  id: number | string;
  title: string;
  startedAt: Date | string;
  isRunning: boolean;
  chunks: ActionEvidenceChunk[];
  success?: boolean | null;
  finalLine?: string | null;
  error?: string | null;
};

type ActionEvidenceProps = {
  runs: ActionEvidenceRun[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  title?: string;
  emptyMessage?: string;
};

type PanelPosition = { left: number; top: number };
type DragState = { pointerId: number; startX: number; startY: number; left: number; top: number };

function formatRunTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function runStatus(run: ActionEvidenceRun) {
  if (run.isRunning) return "running";
  if (run.success) return "success";
  return "failed";
}

export function ActionEvidence({
  runs,
  open,
  onOpenChange,
  onClear,
  title = "Action Evidence",
  emptyMessage = "Run an action to capture terminal evidence here.",
}: ActionEvidenceProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const activeRun = runs.find((run) => run.isRunning) ?? runs[0];
  const visibleRuns = [...runs].reverse();
  const hasRunning = runs.some((run) => run.isRunning);
  const failures = runs.filter((run) => run.error || run.success === false).length;

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.scrollTop = terminal.scrollHeight;
  }, [runs]);

  function clampPanelPosition(left: number, top: number): PanelPosition {
    const rect = panelRef.current?.getBoundingClientRect();
    const margin = 12;
    const width = rect?.width ?? Math.min(window.innerWidth * 0.92, 560);
    const height = rect?.height ?? 420;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(maxLeft, Math.max(margin, left)),
      top: Math.min(maxTop, Math.max(margin, top)),
    };
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPanelPosition(drag.left + event.clientX - drag.startX, drag.top + event.clientY - drag.startY));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  if (runs.length === 0 && !open) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="group fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-border bg-card p-1.5 pr-5 text-foreground shadow-lg shadow-black/10 backdrop-blur-xl transition-all hover:border-primary/25 hover:bg-card/95 hover:shadow-xl hover:shadow-black/15 dark:border-white/10 dark:bg-[#0A0A0A]/95 dark:text-white dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] dark:hover:border-white/20 dark:hover:bg-[#111] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.6)]"
      >
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner dark:bg-gradient-to-br dark:from-white/10 dark:to-white/5 dark:text-white">
          <Terminal className="h-4 w-4" />
          <span
            className={cn(
              "absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-card dark:border-[#0A0A0A]",
              hasRunning ? "animate-pulse bg-emerald-400" : failures > 0 ? "bg-red-500" : "bg-cyan-400",
            )}
          />
        </div>
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground dark:text-white/50">
            {hasRunning ? "Running..." : failures > 0 ? "Failed" : "Evidence"}
          </span>
          <span className="text-sm font-bold leading-tight">
            {runs.length} Action{runs.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/20",
        !position && "right-6 bottom-6",
      )}
      style={position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined}
    >
      <div
        className="flex cursor-grab select-none items-center justify-between border-b border-border bg-card px-4 py-3 active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{title}</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  hasRunning
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : failures > 0
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                )}
              >
                {hasRunning ? "running" : failures > 0 ? `${failures} failed` : "idle"}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {activeRun ? activeRun.title : "No actions yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full border border-border bg-muted/35 px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary disabled:opacity-45 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55 dark:hover:text-primary"
            onClick={onClear}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={runs.length === 0 || hasRunning}
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full border border-border bg-muted/35 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55"
            onClick={() => onOpenChange(false)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close evidence</span>
          </Button>
        </div>
      </div>

      <div ref={terminalRef} className="compose-terminal-scrollbar max-h-[400px] overflow-y-auto bg-zinc-50 p-4 font-mono text-[12px] leading-[1.55] text-zinc-800 shadow-inner dark:bg-[#050505] dark:text-zinc-200">
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-10 text-center font-sans text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleRuns.map((run) => {
              const status = runStatus(run);
              return (
                <div key={run.id} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:border-white/10 dark:bg-[#0d0d0d] dark:shadow-inner dark:shadow-black/20">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2 font-sans text-xs dark:border-white/15 dark:bg-[#171717]">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="hidden shrink-0 items-center gap-1 sm:flex">
                        <span className="h-2 w-2 rounded-full bg-[#ff5f56]" />
                        <span className="h-2 w-2 rounded-full bg-[#ffbd2e]" />
                        <span className="h-2 w-2 rounded-full bg-[#27c93f]" />
                      </div>
                      <span className="truncate font-semibold text-foreground dark:text-zinc-100">{run.title}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground dark:text-zinc-500">{formatRunTime(run.startedAt)}</span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        status === "running" ? "text-primary" : status === "success" ? "text-emerald-500" : "text-destructive",
                      )}
                    >
                      {status === "running" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : status === "success" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {status}
                    </span>
                  </div>
                  <div className="overflow-x-auto px-3 py-3">
                    {run.chunks.map((chunk) => (
                      <pre
                        key={chunk.id}
                        className={cn(
                          "whitespace-pre-wrap break-words tabular-nums",
                          chunk.stream === "stderr" && "text-red-600 dark:text-red-400",
                          chunk.stream === "meta" && "select-none text-zinc-500 dark:text-white/45",
                          chunk.stream === "stdout" && "text-zinc-700 dark:text-zinc-200/85",
                        )}
                      >
                        {chunk.data}
                      </pre>
                    ))}
                    {run.finalLine && (
                      <pre className={cn("mt-2 whitespace-pre-wrap break-words tabular-nums", run.success ? "text-cyan-400" : "text-destructive/80")}>
                        {run.finalLine}
                      </pre>
                    )}
                    {run.error && <pre className="mt-1 whitespace-pre-wrap break-words text-destructive">{`${run.error}\n`}</pre>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
