import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agents/$id")({
    component: AgentLayout,
});

function AgentLayout() {
    return <Outlet />;
}
