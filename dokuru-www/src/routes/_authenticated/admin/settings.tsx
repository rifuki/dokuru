import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminService } from "@/lib/api/services/admin-services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Activity } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

const LOG_LEVELS = [
  { value: "trace", label: "Trace", description: "Most verbose logging" },
  { value: "debug", label: "Debug", description: "Detailed debugging information" },
  { value: "info", label: "Info", description: "General informational messages" },
  { value: "warn", label: "Warning", description: "Warning messages" },
  { value: "error", label: "Error", description: "Error messages only" },
] as const;

function AdminSettingsPage() {
  const [currentLogLevel, setCurrentLogLevel] = useState<string>("info");

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminService.getDashboardStats,
  });

  const setLogLevelMutation = useMutation({
    mutationFn: (level: "trace" | "debug" | "info" | "warn" | "error") =>
      adminService.setLogLevel(level),
    onSuccess: () => {
      toast.success("Log level updated successfully");
    },
    onError: () => {
      toast.error("Failed to update log level");
    },
  });

  const handleLogLevelChange = (value: string) => {
    setCurrentLogLevel(value);
    setLogLevelMutation.mutate(value as "trace" | "debug" | "info" | "warn" | "error");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">
          Configure application-wide settings
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Logging</CardTitle>
            </div>
            <CardDescription>
              Configure system logging level
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="log-level">Log Level</Label>
              <Select value={currentLogLevel} onValueChange={handleLogLevelChange}>
                <SelectTrigger id="log-level">
                  <SelectValue placeholder="Select log level" />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{level.label}</span>
                        <span className="text-xs text-muted-foreground">{level.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle>System Statistics</CardTitle>
            </div>
            <CardDescription>
              Current system status and metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats?.total_users ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Agents</p>
                <p className="text-2xl font-bold">{stats?.total_agents ?? 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Audits</p>
                <p className="text-2xl font-bold">{stats?.total_audits ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
