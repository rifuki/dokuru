import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle,
    CheckCircle2,
    History,
    Loader2,
    RefreshCw,
    RotateCcw,
    ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type FixHistoryEntry, type FixOutcome, type FixTarget } from "@/lib/api/agent-direct";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";

interface FixHistoryPanelProps {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    onRollbackApplied?: () => void;
}

function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatBytes(value?: number | null): string {
    if (value === undefined || value === null) return "unset";
    if (value === 0) return "unlimited";
    return `${Math.round(value / 1024 / 1024)} MB`;
}

function formatTarget(target: FixTarget): string {
    const parts = [];
    if (target.memory !== undefined) parts.push(`memory ${formatBytes(target.memory)}`);
    if (target.cpu_shares !== undefined) parts.push(`cpu ${target.cpu_shares}`);
    if (target.pids_limit !== undefined) parts.push(`pids ${target.pids_limit}`);
    return parts.length > 0 ? parts.join(" · ") : "previous limits captured";
}

function statusStyles(outcome: FixOutcome) {
    if (outcome.status === "Applied") {
        return {
            icon: CheckCircle2,
            className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
        };
    }

    return {
        icon: ShieldAlert,
        className: "border-amber-500/25 bg-amber-500/10 text-amber-400",
    };
}

export function FixHistoryPanel({
    agentId,
    agentUrl,
    agentAccessMode,
    token,
    onRollbackApplied,
}: FixHistoryPanelProps) {
    const [rollingBackId, setRollingBackId] = useState<string | null>(null);
    const [confirmEntry, setConfirmEntry] = useState<FixHistoryEntry | null>(null);

    const historyQuery = useQuery({
        queryKey: ["fix-history", agentAccessMode, agentId, agentUrl, token],
        enabled: agentAccessMode === "relay" || (!!agentUrl && (!!token || agentId === LOCAL_AGENT_ID)),
        queryFn: async () => {
            return agentAccessMode === "relay"
                ? await agentApi.listFixHistory(agentId)
                : await agentDirectApi.listFixHistory(agentUrl, token);
        },
    });

    const history = historyQuery.data ?? [];
    const loading = historyQuery.isLoading || historyQuery.isFetching;

    const rollback = useCallback(async (entry: FixHistoryEntry) => {
        setRollingBackId(entry.id);
        try {
            const outcome = agentAccessMode === "relay"
                ? await agentApi.rollbackFix(agentId, entry.id)
                : await agentDirectApi.rollbackFix(agentUrl, entry.id, token);

            if (outcome.status === "Applied") {
                toast.success(outcome.message);
                onRollbackApplied?.();
            } else {
                toast.error(outcome.message);
            }
            await historyQuery.refetch();
        } catch {
            toast.error("Failed to rollback fix");
        } finally {
            setRollingBackId(null);
            setConfirmEntry(null);
        }
    }, [agentAccessMode, agentId, agentUrl, token, historyQuery, onRollbackApplied]);

    return (
        <>
            <section className="rounded-2xl border border-border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:to-[#111113] overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#2496ED]/25 bg-[#2496ED]/10 text-[#2496ED]">
                            <History className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold tracking-tight">Fix History & Rollback</h3>
                            <p className="text-sm text-muted-foreground">
                                Agent-side remediation log. Cgroup fixes can be rolled back to the captured previous limits.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()} disabled={loading}>
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                    </Button>
                </div>

                {historyQuery.isError ? (
                    <div className="flex items-center gap-2 px-5 py-6 text-sm text-amber-500">
                        <AlertTriangle className="h-4 w-4" />
                        Failed to load fix history from agent. Check connectivity, then refresh.
                    </div>
                ) : loading ? (
                    <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-[#2496ED]" />
                        Loading fix history from agent...
                    </div>
                ) : history.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground">
                        No fixes recorded yet. Apply a fix from this audit, then refresh this panel.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {history.slice(0, 8).map((entry) => {
                            const status = statusStyles(entry.outcome);
                            const StatusIcon = status.icon;
                            const rollingBack = rollingBackId === entry.id;

                            return (
                                <div key={entry.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs font-black text-muted-foreground">
                                                {entry.request.rule_id}
                                            </span>
                                            <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-bold", status.className)}>
                                                <StatusIcon className="h-3 w-3" />
                                                {entry.outcome.status}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 text-xs font-bold text-muted-foreground">
                                                <History className="h-3 w-3" />
                                                {formatTime(entry.timestamp)}
                                            </span>
                                            {entry.rollback_supported ? (
                                                <span className="rounded border border-[#2496ED]/25 bg-[#2496ED]/10 px-2 py-1 text-xs font-bold text-[#2496ED]">
                                                    rollback ready
                                                </span>
                                            ) : (
                                                <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-bold text-muted-foreground">
                                                    no rollback
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-sm font-medium leading-snug text-foreground/90">
                                            {entry.outcome.message}
                                        </p>

                                        {entry.rollback_targets.length > 0 && (
                                            <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                                                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-white/35">
                                                    Rollback targets
                                                </p>
                                                <div className="grid gap-1.5">
                                                    {entry.rollback_targets.slice(0, 4).map((target) => (
                                                        <div key={target.container_id} className="flex flex-col gap-1 text-xs font-mono text-white/45 sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="truncate text-white/65">{target.container_id.slice(0, 12)}</span>
                                                            <span>{formatTarget(target)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2 lg:items-end">
                                        {entry.rollback_supported ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setConfirmEntry(entry)}
                                                disabled={rollingBack}
                                                className="border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                                            >
                                                {rollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                                Rollback
                                            </Button>
                                        ) : (
                                            <p className="max-w-56 text-xs text-muted-foreground lg:text-right">
                                                {entry.rollback_note ?? "Rollback is currently available only for captured cgroup resource updates."}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <AlertDialog open={!!confirmEntry} onOpenChange={(open) => !open && setConfirmEntry(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Rollback Fix {confirmEntry?.request.rule_id}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will restore the cgroup resource limits captured before the fix was applied. Re-run audit after rollback to verify the result.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-amber-600 text-white hover:bg-amber-700"
                            onClick={() => {
                                if (confirmEntry) void rollback(confirmEntry);
                            }}
                        >
                            Confirm Rollback
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
