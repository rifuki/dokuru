import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import { AuditSummaryCard } from "@/features/audit/components/AuditSummaryCard";
import { downloadAuditJson } from "@/features/audit/audit-export";
import { sortAuditHistory, writeCachedAuditHistory } from "@/features/audit/audit-history-cache";
import { useAuditStore } from "@/stores/use-audit-store";

export const Route = createFileRoute("/_authenticated/agents/$id/audits/")({
    component: AuditHistoryPage,
});

function AuditHistoryPage() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const setAuditHistory = useAuditStore((state) => state.setAuditHistory);
    const [audits, setAudits] = useState<AuditResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState<AuditResponse | null>(null);
    const [deletingAuditId, setDeletingAuditId] = useState<string | null>(null);
    useWindowScrollMemory(`agent:${id}:audit-history`, !loading);

    useEffect(() => {
        agentApi.listAudits(id)
            .then((history) => setAudits(sortAuditHistory(history)))
            .catch(() => toast.error("Failed to load audit history"))
            .finally(() => setLoading(false));
    }, [id]);

    const handleAuditClick = (audit: AuditResponse) => {
        if (audit.id) {
            navigate({ to: "/agents/$id/audits/$auditId", params: { id, auditId: audit.id }, search: { from: "history" } });
        }
    };

    const handleBack = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        navigate({ to: "/agents/$id/audit", params: { id } });
    };

    const handleExportAudit = (audit: AuditResponse) => {
        downloadAuditJson(audit);
        toast.success("Audit JSON downloaded");
    };

    const requestDeleteAudit = (audit: AuditResponse) => {
        if (!audit.id) {
            toast.error("Audit id is missing");
            return;
        }
        setDeleteTarget(audit);
    };

    const handleDeleteAudit = async () => {
        const auditId = deleteTarget?.id;
        if (!auditId) return;

        setDeletingAuditId(auditId);
        try {
            await agentApi.deleteAudit(id, auditId);
            const nextAudits = sortAuditHistory(audits.filter((audit) => audit.id !== auditId));
            setAudits(nextAudits);
            setAuditHistory(id, nextAudits);
            writeCachedAuditHistory(id, nextAudits);
            queryClient.setQueryData(["audits", id], nextAudits);
            queryClient.removeQueries({ queryKey: ["audit", id, auditId] });
            await queryClient.invalidateQueries({ queryKey: ["audits", id] });
            toast.success("Audit deleted");
            setDeleteTarget(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete audit");
        } finally {
            setDeletingAuditId(null);
        }
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto w-full py-20 text-center">
                <p className="text-muted-foreground">Loading audit history...</p>
            </div>
        );
    }

    return (
        <>
        <div className="max-w-4xl mx-auto w-full space-y-6 pb-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Audit History</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        All security audit results for this agent
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
            </div>

            {audits.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    No audit history yet. Run your first audit to get started.
                </div>
            ) : (
                <div className="grid gap-4">
                    {audits.map((audit, idx) => (
                        <AuditSummaryCard
                            key={audit.id ?? idx}
                            audit={audit}
                            onOpen={() => handleAuditClick(audit)}
                            onExport={() => handleExportAudit(audit)}
                            onDelete={audit.id ? () => requestDeleteAudit(audit) : undefined}
                            isDeleting={deletingAuditId === audit.id}
                        />
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
