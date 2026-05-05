import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import { AuditSummaryCard } from "@/features/audit/components/AuditSummaryCard";

export const Route = createFileRoute("/_authenticated/agents/$id/audits/")({
    component: AuditHistoryPage,
});

function AuditHistoryPage() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const [audits, setAudits] = useState<AuditResponse[]>([]);
    const [loading, setLoading] = useState(true);
    useWindowScrollMemory(`agent:${id}:audit-history`, !loading);

    useEffect(() => {
        agentApi.listAudits(id)
            .then(setAudits)
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

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto w-full py-20 text-center">
                <p className="text-muted-foreground">Loading audit history...</p>
            </div>
        );
    }

    return (
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
