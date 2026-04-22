import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export const Route = createFileRoute("/_authenticated/agents/$id/events")({
  component: EventsPage,
});

function EventsPage() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        icon={Activity}
        title="Events"
        accent="rose"
        stats={[{ value: "Live", label: "real-time stream", pulse: true }]}
      />

      <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 p-16 text-center">
        <div className="flex justify-center mb-5">
          <div className="h-16 w-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Activity className="h-8 w-8 text-rose-400 animate-pulse" />
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-1.5">Events Stream</h3>
        <p className="text-muted-foreground text-sm">
          Real-time event streaming will be implemented with WebSocket
        </p>
      </div>
    </div>
  );
}
