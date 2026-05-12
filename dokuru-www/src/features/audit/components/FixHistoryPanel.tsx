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
import { agentDirectApi, type FixHistoryEntry, type FixOutcome, type FixProgress, type FixTarget } from "@/lib/api/agent-direct";
import { ProgressEventsPanel } from "@/features/audit/components/ProgressEventsPanel";
import { appendFixProgressEvents } from "@/lib/fix-progress-events";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";

type FixStreamMessage =
    | { type: "progress"; data: FixProgress }
    | { type: "outcome"; data: FixOutcome }
    | { type: "error"; message: string };

interface FixHistoryPanelProps {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    historyEntries?: FixHistoryEntry[];
    loading?: boolean;
    refreshing?: boolean;
    error?: boolean;
    onRefresh?: () => void | Promise<unknown>;
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
    historyEntries,
    loading: externalLoading,
    refreshing: externalRefreshing,
    error: externalError,
    onRefresh,
    onRollbackApplied,
}: FixHistoryPanelProps) {
    const [rollingBackId, setRollingBackId] = useState<string | null>(null);
    const [confirmEntry, setConfirmEntry] = useState<FixHistoryEntry | null>(null);
    const [rollbackProgress, setRollbackProgress] = useState<Record<string, FixProgress[]>>({});
    const [rollbackOutcomes, setRollbackOutcomes] = useState<Record<string, FixOutcome>>({});

    const hasExternalHistory = historyEntries !== undefined;
    const historyQuery = useQuery({
        queryKey: ["fix-history", agentAccessMode, agentId, agentUrl, token],
        enabled: !hasExternalHistory && (agentAccessMode === "relay" || (!!agentUrl && (!!token || agentId === LOCAL_AGENT_ID))),
        queryFn: async () => {
            return agentAccessMode === "relay"
                ? await agentApi.listFixHistory(agentId)
                : await agentDirectApi.listFixHistory(agentUrl, token);
        },
    });

    const history = historyEntries ?? historyQuery.data ?? [];
    const loading = externalLoading ?? (historyQuery.isLoading && history.length === 0);
    const refreshing = externalRefreshing ?? (historyQuery.isFetching && !loading);
    const hasError = externalError ?? historyQuery.isError;

    const refreshHistory = useCallback(async () => {
        if (onRefresh) {
            await onRefresh();
            return;
        }
        await historyQuery.refetch();
    }, [historyQuery, onRefresh]);

    const rollback = useCallback(async (entry: FixHistoryEntry) => {
        setRollingBackId(entry.id);
        setRollbackProgress(current => ({
            ...current,
            [entry.id]: entry.rollback_progress_events ?? [],
        }));
        try {
            const outcome = await new Promise<FixOutcome>((resolve, reject) => {
                const url = agentAccessMode === "relay"
                    ? agentApi.rollbackFixStreamUrl(agentId, entry.id)
                    : agentDirectApi.rollbackFixStreamUrl(agentUrl, entry.id, token);
                const socket = new WebSocket(url);
                let settled = false;

                socket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(String(event.data)) as FixStreamMessage;
                        if (message.type === "progress") {
                            setRollbackProgress(current => ({
                                ...current,
                                [entry.id]: appendFixProgressEvents(current[entry.id] ?? [], [message.data]),
                            }));
                            return;
                        }

                        if (message.type === "outcome") {
                            settled = true;
                            setRollbackOutcomes(current => ({ ...current, [entry.id]: message.data }));
                            socket.close();
                            resolve(message.data);
                            return;
                        }

                        if (message.type === "error") {
                            settled = true;
                            socket.close();
                            reject(new Error(message.message));
                        }
                    } catch (error) {
                        settled = true;
                        socket.close();
                        reject(error instanceof Error ? error : new Error("Invalid rollback stream message"));
                    }
                };

                socket.onerror = () => {
                    if (!settled) {
                        settled = true;
                        reject(new Error("Rollback progress stream failed"));
                    }
                };
                socket.onclose = () => {
                    if (!settled) {
                        settled = true;
                        reject(new Error("Rollback progress stream closed before completion"));
                    }
                };
            });

            if (outcome.status === "Applied") {
                toast.success(outcome.message);
                onRollbackApplied?.();
            } else {
                toast.error(outcome.message);
            }
            await refreshHistory();
        } catch {
            toast.error("Failed to rollback fix");
        } finally {
            setRollingBackId(null);
            setConfirmEntry(null);
        }
    }, [agentAccessMode, agentId, agentUrl, token, onRollbackApplied, refreshHistory]);

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
                                Remediations linked to this audit window. Rollback restores captured host, Compose, container, or cgroup snapshots.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void refreshHistory()} disabled={refreshing}>
                        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {refreshing ? "Refreshing" : "Refresh"}
                    </Button>
                </div>

                {hasError ? (
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
                        No fixes recorded for this audit window.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {history.slice(0, 8).map((entry) => {
                            const status = statusStyles(entry.outcome);
                            const StatusIcon = status.icon;
                            const rollingBack = rollingBackId === entry.id;
                            const rollbackOutcome = rollbackOutcomes[entry.id] ?? entry.rollback_outcome;
                            const rollbackEvents = rollbackProgress[entry.id] ?? entry.rollback_progress_events ?? [];
                            const rollbackApplied = rollbackOutcome?.status === "Applied";
                            const rollbackBlocked = rollbackOutcome?.status === "Blocked";
                            const canRollback = entry.rollback_supported && !rollbackApplied;

                            return (
                                <div key={entry.id} className="flex flex-col gap-3 px-5 py-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
                                                <span className="inline-flex items-center rounded border border-border bg-muted/10 px-2 py-1 text-xs font-medium text-muted-foreground/80">
                                                    snapshot captured
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded border border-border/50 bg-muted/5 px-2 py-1 text-xs font-medium text-muted-foreground/40">
                                                    no snapshot
                                                </span>
                                            )}
                                            {rollbackApplied && (
                                                <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    rolled back
                                                </span>
                                            )}
                                            {rollbackBlocked && (
                                                <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-400">
                                                    <ShieldAlert className="h-3 w-3" />
                                                    rollback blocked
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex-shrink-0">
                                            {(entry.rollback_supported || rollbackApplied) && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => setConfirmEntry(entry)}
                                                    disabled={rollingBack || !canRollback}
                                                    className={cn(
                                                        "h-8 gap-1.5 px-3 text-xs font-bold shadow-sm transition-all",
                                                        canRollback && "hover:bg-primary hover:text-primary-foreground",
                                                    )}
                                                >
                                                    {rollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                                    {rollbackApplied ? "Rolled back" : rollingBack ? "Rolling back" : "Rollback"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-sm font-medium leading-snug text-foreground/90">
                                            {entry.outcome.message}
                                        </p>

                                        {entry.rollback_targets.length > 0 ? (
                                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                                                    Rollback targets
                                                </p>
                                                <div className="grid gap-1.5">
                                                    {entry.rollback_targets.slice(0, 4).map((target) => (
                                                        <div key={target.container_id} className="flex flex-col gap-1 text-xs font-mono text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="truncate text-foreground/80">{target.container_id.slice(0, 12)}</span>
                                                            <span>{formatTarget(target)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {(entry.compose_rollback_targets?.length ?? 0) > 0 ? (
                                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                                                    Compose snapshots
                                                </p>
                                                <div className="grid gap-1.5">
                                                    {entry.compose_rollback_targets?.slice(0, 4).map((target) => (
                                                        <div key={`${target.project}:${target.service}:${target.compose_path}`} className="flex flex-col gap-1 text-xs font-mono text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="truncate text-foreground/80">{target.project}:{target.service}</span>
                                                            <span>{target.backup_path ? "file snapshot captured" : target.delete_on_rollback ? "delete created override" : "snapshot unavailable"}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {(entry.container_rollback_targets?.length ?? 0) > 0 ? (
                                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                                                    Container snapshots
                                                </p>
                                                <div className="grid gap-1.5">
                                                    {entry.container_rollback_targets?.slice(0, 4).map((target) => (
                                                        <div key={`${target.container_id}:${target.snapshot_path}`} className="flex flex-col gap-1 text-xs font-mono text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="truncate text-foreground/80">{target.container_name || target.container_id.slice(0, 12)}</span>
                                                            <span>
                                                                {target.snapshot_note ?? "full inspect snapshot"}
                                                                {target.original_user ? ` · was ${target.original_user}` : ""}
                                                                {target.was_running ? " · running" : " · stopped"}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {(entry.host_file_rollback_targets?.length ?? 0) > 0 ? (
                                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                                                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                                                    Host/source snapshots
                                                </p>
                                                <div className="grid gap-1.5">
                                                    {entry.host_file_rollback_targets?.slice(0, 4).map((target) => (
                                                        <div key={`${target.path}:${target.backup_path ?? "created"}`} className="flex flex-col gap-1 text-xs font-mono text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                                            <span className="truncate text-foreground/80">{target.path}</span>
                                                            <span>{target.existed ? "file snapshot captured" : "delete created file"}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {!entry.rollback_supported && entry.rollback_note && (
                                            <p className="text-xs text-muted-foreground/70">
                                                {entry.rollback_note}
                                            </p>
                                        )}

                                        {(rollingBack || rollbackEvents.length > 0) && (
                                            <ProgressEventsPanel
                                                progressEvents={rollbackEvents}
                                                title={`rollback ${entry.request.rule_id} evidence stream`}
                                                emptyMessage="Waiting for rollback evidence"
                                                className="shadow-none"
                                                resizable
                                                storageKey={`dokuru_rollback_evidence_${entry.id}`}
                                                defaultHeight={360}
                                                minHeight={180}
                                                maxHeight={900}
                                            />
                                        )}

                                        {rollbackOutcome && (
                                            <div className={cn(
                                                "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                                                rollbackOutcome.status === "Applied"
                                                    ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200/80"
                                                    : "border-amber-500/20 bg-amber-500/8 text-amber-100/80",
                                            )}>
                                                {rollbackOutcome.message}
                                            </div>
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
                            {confirmEntry?.host_file_rollback_targets?.length
                                ? "This will restore host/source files captured before the fix, then restart Docker or reload auditd when those files changed. It may also restore Compose, container, or cgroup snapshots captured for the same fix. Re-run audit after rollback to verify the result."
                                : confirmEntry?.container_rollback_targets?.length
                                ? "This will recreate standalone containers from captured Docker inspect snapshots, including Config and HostConfig such as user, mounts, privileges, caps, and resource settings. Re-run audit after rollback to verify the result."
                                : confirmEntry?.compose_rollback_targets?.length
                                ? "This will restore the captured Compose YAML snapshot or remove a Dokuru-created override, then recreate the affected service. Re-run audit after rollback to verify the result."
                                : "This will restore the cgroup resource limits captured before the fix was applied. Re-run audit after rollback to verify the result."}
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
