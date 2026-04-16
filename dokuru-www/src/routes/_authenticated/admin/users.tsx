import { createFileRoute } from "@tanstack/react-router";
import { UsersManagement } from "@/features/admin/components/UsersManagement";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersManagement,
});
