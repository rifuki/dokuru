import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dockerApi } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { HardDrive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/volumes/$volumeName")({
  component: VolumeDetailPage,
});

function VolumeDetailPage() {
  const { id, volumeName } = Route.useParams();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: volume, isLoading } = useQuery({
    queryKey: ["volume", id, volumeName],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.inspectVolume(agent.url, agent.token, volumeName);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-card rounded-lg" />;
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6 p-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <HardDrive className="h-8 w-8" />
          {volume?.Name || volumeName}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Volume Details</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-6 rounded-lg border bg-card">
          <h3 className="font-semibold text-lg">Volume Information</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span>
              <p className="font-mono">{volume?.Name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Driver:</span>
              <Badge variant="outline">{volume?.Driver}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Mountpoint:</span>
              <p className="font-mono text-xs">{volume?.Mountpoint}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Scope:</span>
              <Badge variant="outline">{volume?.Scope}</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6 rounded-lg border bg-card">
          <h3 className="font-semibold text-lg">Labels</h3>
          <div className="space-y-2">
            {volume?.Labels && Object.keys(volume.Labels).length > 0 ? (
              Object.entries(volume.Labels as Record<string, string>).map(([key, value]) => (
                <div key={key} className="p-2 rounded bg-muted/50">
                  <p className="font-mono text-xs text-primary">{key}</p>
                  <p className="font-mono text-xs text-muted-foreground">{value}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No labels</p>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border bg-card">
        <h3 className="font-semibold text-lg mb-4">Raw JSON</h3>
        <pre className="bg-muted/50 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
          {JSON.stringify(volume, null, 2)}
        </pre>
      </div>
    </div>
  );
}