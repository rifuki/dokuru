import { createFileRoute } from "@tanstack/react-router";
import { SessionsSettings } from "@/features/settings/components/SessionsSettings";

export const Route = createFileRoute("/settings/sessions")({
    component: SessionsSettings,
});
