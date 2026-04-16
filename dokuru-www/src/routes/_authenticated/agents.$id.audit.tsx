import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agents/$id/audit")({
    component: AuditPage,
});

function AuditPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
                <p className="text-muted-foreground text-sm mt-1">CIS Docker Benchmark v1.8.0</p>
            </div>

            <div className="rounded-lg border bg-card p-12 text-center">
                <p className="text-muted-foreground">Audit page coming soon...</p>
            </div>
        </div>
    );
}
