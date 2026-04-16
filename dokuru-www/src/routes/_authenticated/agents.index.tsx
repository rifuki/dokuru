import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agents/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
