import { createFileRoute } from "@tanstack/react-router";
import { SessionsSettings } from "@/features/settings/components/SessionsSettings";

export const Route = createFileRoute("/_authenticated/settings/sessions")({
    component: SessionsSettings,
});
