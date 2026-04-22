import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/audits")({
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audits</h1>
        <p className="text-muted-foreground">
          View all security audit results across all agents
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Audit management page coming soon...
        </p>
      </div>
    </div>
  ),
});
