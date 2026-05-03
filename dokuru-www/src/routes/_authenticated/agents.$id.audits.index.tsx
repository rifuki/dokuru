import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import type { AuditResponse } from "@/lib/api/agent-direct";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";

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
            navigate({ to: "/agents/$id/audits/$auditId", params: { id, auditId: audit.id } });
        }
    };

    const handleBack = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        navigate({ to: "/agents/$id/audit", params: { id } });
    };

    const fmtDate = (ts: string) => {
        try { return new Date(ts).toLocaleString(); } catch { return ts; }
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
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Audit History</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        All security audit results for this agent
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
            </div>

            {audits.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    No audit history yet. Run your first audit to get started.
                </div>
            ) : (
                <div className="grid gap-3">
                    {audits.map((audit, idx) => {
                        const scoreColor = audit.summary.score >= 80 
                            ? "text-green-500" 
                            : audit.summary.score >= 60 
                            ? "text-yellow-500" 
                            : "text-red-500";
                        
                        return (
                            <button
                                key={idx}
                                onClick={() => handleAuditClick(audit)}
                                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left group"
                            >
                                {/* Score ring */}
                                <div className="flex-shrink-0">
                                    <div className="relative w-16 h-16">
                                        <svg width="64" height="64" viewBox="0 0 64 64">
                                            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
                                                className="text-muted-foreground/10" />
                                            <circle cx="32" cy="32" r="28" fill="none" 
                                                stroke={audit.summary.score >= 80 ? "#22c55e" : audit.summary.score >= 60 ? "#f59e0b" : "#ef4444"}
                                                strokeWidth="4"
                                                strokeDasharray={`${2 * Math.PI * 28}`}
                                                strokeDashoffset={`${2 * Math.PI * 28 - (audit.summary.score / 100) * 2 * Math.PI * 28}`}
                                                strokeLinecap="round" transform="rotate(-90 32 32)"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className={`text-xl font-bold ${scoreColor}`}>{audit.summary.score}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-sm font-medium">{fmtDate(audit.timestamp)}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-2">
                                        {audit.hostname} • Docker {audit.docker_version} • {audit.total_containers} containers
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                            {audit.summary.passed} passed
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {audit.summary.failed} failed
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {audit.summary.total} total
                                        </Badge>
                                    </div>
                                </div>

                                {/* Arrow */}
                                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
