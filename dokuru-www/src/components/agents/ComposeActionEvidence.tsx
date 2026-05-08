import { Terminal, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useComposeActionStore } from "@/stores/use-compose-action-store";

export function ComposeActionEvidence() {
  const runs = useComposeActionStore((state) => state.runs);
  const open = useComposeActionStore((state) => state.evidenceOpen);
  const setOpen = useComposeActionStore((state) => state.setEvidenceOpen);
  const clearRuns = useComposeActionStore((state) => state.clearRuns);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  
  const hasRunning = runs.some((r) => r.isRunning);
  const failures = runs.filter((r) => r.final && !r.final.success).length;
  const activeRun = runs[0]; // most recent

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.scrollTop = terminal.scrollHeight;
  }, [runs]);

  if (runs.length === 0 && !open) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group fixed bottom-24 right-6 z-50 flex items-center gap-3 rounded-full border border-border/50 bg-card/95 p-1.5 pr-5 text-card-foreground shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl transition-all hover:border-border hover:bg-muted/50 hover:shadow-[0_12px_40px_rgb(0,0,0,0.16)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.6)]"
      >
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 text-primary shadow-inner">
          <Terminal className="h-4 w-4" />
          <span
            className={cn(
              "absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-card",
              hasRunning ? "animate-pulse bg-emerald-400" : failures > 0 ? "bg-red-500" : "bg-cyan-400"
            )}
          />
        </div>
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {hasRunning ? "Compose..." : failures > 0 ? "Failed" : "Evidence"}
          </span>
          <span className="text-sm font-bold leading-tight">
            {runs.length} Action{runs.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-6 z-50 w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Compose Evidence</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium border",
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
              {activeRun ? `${activeRun.action.toUpperCase()} ${activeRun.stackName}` : "No actions yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearRuns}
            disabled={runs.length === 0 || hasRunning}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close evidence</span>
          </Button>
        </div>
      </div>

      <div ref={terminalRef} className="compose-terminal-scrollbar max-h-[400px] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-10 text-center font-sans text-sm text-muted-foreground">
            Run up or down to capture compose terminal evidence here.
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <div key={run.id} className="overflow-hidden rounded-xl border border-border bg-muted/10">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 font-sans text-xs">
                  <span className="truncate font-medium text-foreground">
                    Compose {run.action.toUpperCase()} {run.stackName}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      run.isRunning
                        ? "text-primary"
                        : run.final?.success
                        ? "text-emerald-500"
                        : "text-destructive",
                    )}
                  >
                    {run.isRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : run.final?.success ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {run.isRunning ? "running" : run.final?.success ? "success" : "failed"}
                  </span>
                </div>
                <div className="px-3 py-3 overflow-x-auto">
                  {run.chunks.map((chunk) => (
                    <pre
                      key={chunk.id}
                      className={cn(
                        "whitespace-pre-wrap break-words",
                        chunk.stream === "stderr" && "text-destructive",
                        chunk.stream === "meta" && "text-muted-foreground select-none",
                        chunk.stream === "stdout" && "text-foreground/80",
                      )}
                    >
                      {chunk.data}
                    </pre>
                  ))}
                  {run.final && (
                    <pre className={cn("whitespace-pre-wrap break-words mt-1", run.final.success ? "text-emerald-500/80" : "text-destructive/80")}>
                      {`exit_code=${run.final.exit_code ?? "unknown"} success=${String(run.final.success)}${run.final.stack ? ` status=${run.final.stack.status} running=${run.final.stack.running}/${run.final.stack.total}` : ""}\n`}
                    </pre>
                  )}
                  {run.error && <pre className="whitespace-pre-wrap break-words text-destructive mt-1">{`${run.error}\n`}</pre>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
