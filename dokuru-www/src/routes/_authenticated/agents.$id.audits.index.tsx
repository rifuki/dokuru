import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import { AuditSummaryCard } from "@/features/audit/components/AuditSummaryCard";
import { downloadAuditJson } from "@/features/audit/audit-export";
import { readCachedAuditHistory, sortAuditHistory, writeCachedAuditHistory } from "@/features/audit/audit-history-cache";
import { useAuditStore } from "@/stores/use-audit-store";

export const Route = createFileRoute("/_authenticated/agents/$id/audits/")({
    component: AuditHistoryPage,
});

function AuditHistoryPage() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const setAuditHistory = useAuditStore((state) => state.setAuditHistory);
    const [audits, setAudits] = useState<AuditResponse[]>(() => readCachedAuditHistory(id));
    const [loading, setLoading] = useState(() => readCachedAuditHistory(id).length === 0);
    const [refreshing, setRefreshing] = useState(() => readCachedAuditHistory(id).length > 0);
    const [cacheOnly, setCacheOnly] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AuditResponse | null>(null);
    const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);
    useWindowScrollMemory(`agent:${id}:audit-history`, !loading);

    useEffect(() => {
        let cancelled = false;
        const cachedHistory = readCachedAuditHistory(id);

        if (cachedHistory.length > 0) {
            setAuditHistory(id, cachedHistory);
            queryClient.setQueryData(["audits", id], cachedHistory);
            queueMicrotask(() => {
                if (cancelled) return;
                setAudits(cachedHistory);
                setCacheOnly(true);
                setRefreshing(true);
                setLoading(false);
            });
        } else {
            queueMicrotask(() => {
                if (cancelled) return;
                setLoading(true);
                setRefreshing(false);
                setCacheOnly(false);
            });
        }

        agentApi.listAudits(id)
            .then((history) => {
                if (cancelled) return;
                const sorted = sortAuditHistory(history);
                setAudits(sorted);
                setAuditHistory(id, sorted);
                writeCachedAuditHistory(id, sorted);
                queryClient.setQueryData(["audits", id], sorted);
                for (const audit of sorted) {
                    if (audit.id) queryClient.setQueryData(["audit", id, audit.id], audit);
                }
                setCacheOnly(false);
            })
            .catch(() => {
                if (cancelled) return;
                if (cachedHistory.length > 0) {
                    toast.warning("Showing cached audit history");
                    return;
                }
                toast.error("Failed to load audit history");
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                    setRefreshing(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [id, queryClient, setAuditHistory]);

    const handleAuditClick = (audit: AuditResponse) => {
        if (audit.id) {
            void navigate({ to: "/agents/$id/audits/$auditId", params: { id, auditId: audit.id }, search: { from: "history" } });
        }
    };

    const handleBack = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        void navigate({ to: "/agents/$id/audit", params: { id } });
    };

    const handleExportAudit = (audit: AuditResponse, format: "pdf" | "html" | "json") => {
        if (format === "json") {
            downloadAuditJson(audit);
            toast.success("Audit JSON downloaded");
        } else {
            toast("Opening audit detail", { description: `Please export ${format.toUpperCase()} from the detail page.` });
            void navigate({ to: "/agents/$id/audits/$auditId", params: { id, auditId: audit.id! } });
        }
    };

    const requestDeleteAudit = (audit: AuditResponse) => {
        if (!audit.id) {
            toast.error("Audit id is missing");
            return;
        }
        setDeleteTarget(audit);
    };

    const handleDeleteAudit = async () => {
        if (!deleteTarget?.id) return;
        
        setDeletingAuditId(deleteTarget.id);
        try {
            await agentApi.deleteAudit(id, deleteTarget.id);
            const nextAudits = sortAuditHistory(audits.filter((audit) => audit.id !== deleteTarget.id));
            setAudits(nextAudits);
            setAuditHistory(id, nextAudits);
            writeCachedAuditHistory(id, nextAudits);
            queryClient.setQueryData(["audits", id], nextAudits);
            toast.success("Audit deleted");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete audit");
        } finally {
            setDeletingAuditId(null);
            setDeleteTarget(null);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-5xl py-20 text-center">
                <p className="text-muted-foreground">Loading audit history...</p>
            </div>
        );
    }

    return (
        <>
        <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-bold tracking-tight">Audit History</h2>
                        {refreshing ? (
                            <Badge variant="outline" className="border-primary/25 bg-primary/10 text-[10px] text-primary">Refreshing</Badge>
                        ) : cacheOnly ? (
                            <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-300">Cached</Badge>
                        ) : null}
                    </div>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        {cacheOnly ? "Saved audit results available while this agent is offline" : "All security audit results for this agent"}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBack}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
            </div>

            {audits.length === 0 ? (
                <div className="rounded-[14px] border border-border bg-background/25 p-8 text-center">
                    <History className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
                    <p className="text-foreground font-semibold">No audits found</p>
                    <p className="text-muted-foreground text-sm mt-1">Run a security audit to see history here.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {audits.map((audit) => (
                        <div key={audit.id || audit.timestamp} className="w-full">
                            <AuditSummaryCard
                                audit={audit}
                                onOpen={() => handleAuditClick(audit)}
                                onExport={(format) => handleExportAudit(audit, format)}
                                onDelete={cacheOnly ? undefined : () => requestDeleteAudit(audit)}
                                isDeleting={deletingAuditId === audit.id}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => {
            if (!open && !deletingAuditId) setDeleteTarget(null);
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Audit</AlertDialogTitle>
                    <AlertDialogDescription>
                        Delete the audit from {deleteTarget?.hostname ?? "this agent"} captured on {deleteTarget ? new Date(deleteTarget.timestamp).toLocaleString() : "this run"}? This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={!!deletingAuditId}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={!!deletingAuditId}
                        onClick={(event) => {
                            event.preventDefault();
                            void handleDeleteAudit();
                        }}
                    >
                        {deletingAuditId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Delete Audit
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
