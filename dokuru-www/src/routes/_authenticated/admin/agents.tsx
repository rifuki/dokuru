import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/agents")({
  component: AdminAgentsPage,
});

function AdminAgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agents Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered agents across your infrastructure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Coming Soon</CardTitle>
          </div>
          <CardDescription>
            Agent management interface is under development. You can currently manage agents through
            the main Agents page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This page will include:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>View all agents with detailed information</li>
            <li>Monitor agent status and connection health</li>
            <li>Manage agent tokens and permissions</li>
            <li>View agent audit history</li>
            <li>Bulk operations on multiple agents</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
