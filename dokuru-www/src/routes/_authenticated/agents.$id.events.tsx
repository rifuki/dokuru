import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/events")({
  component: EventsPage,
});

function EventsPage() {
  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Events</h2>
        <p className="text-muted-foreground text-sm">Real-time Docker events</p>
      </div>
      <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
        <Activity className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
        <h3 className="text-lg font-semibold">Events Stream</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Real-time event streaming will be implemented with WebSocket
        </p>
      </div>
    </div>
  );
}
