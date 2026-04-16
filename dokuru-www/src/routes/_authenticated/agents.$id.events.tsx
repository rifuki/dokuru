import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/events")({
    component: EventsPage,
});

function EventsPage() {
    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Events</h2>
                <p className="text-muted-foreground text-sm mt-1">Docker event stream</p>
            </div>
            <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center flex flex-col items-center justify-center min-h-[300px]">
                <Activity className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold">Coming Soon</h3>
                <p className="text-muted-foreground mt-2 text-sm max-w-sm">
                    Event streaming is under development.
                </p>
            </div>
        </div>
    );
}
