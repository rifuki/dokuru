import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "@/features/settings/components/ProfileSettings";

export const Route = createFileRoute("/_authenticated/settings/profile")({
    component: ProfileSettings,
});
