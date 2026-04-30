import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { canUseDockerAgent, dockerApi, dockerCredential } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Clock, FolderOpen, HardDrive, Hash, Tag } from "lucide-react";
import {
  DetailPageSkeleton,
  DetailRow,
  DetailSection,
  DetailStat,
  RawJsonDetails,
} from "@/components/ui/detail-layout";

export const Route = createFileRoute("/_authenticated/agents/$id/volumes/$volumeName")({
  component: VolumeDetailPage,
});

type VolumeInspect = {
  Name?: string;
  Driver?: string;
  Mountpoint?: string;
  Scope?: string;
  CreatedAt?: string;
  Labels?: Record<string, string>;
  Options?: Record<string, string>;
};

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function shortValue(value?: string) {
  return value ? value.slice(0, 12) : null;
}

function VolumeDetailPage() {
  const { id, volumeName } = Route.useParams();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: volume, isLoading } = useQuery({
    queryKey: ["volume", id, volumeName],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.inspectVolume(agent.url, credential, volumeName);
      return res.data as VolumeInspect;
    },
    enabled: canUseDockerAgent(agent),
  });

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  const labels = volume?.Labels ?? {};
  const labelEntries = Object.entries(labels);
  const optionEntries = Object.entries(volume?.Options ?? {});
  const created = formatDate(volume?.CreatedAt);
  const title = volume?.Name || volumeName;
  const shortName = shortValue(title);
  const isAnonymous = Object.prototype.hasOwnProperty.call(
    labels,
    "com.docker.volume.anonymous",
  );

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary shrink-0">
          <HardDrive className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {shortName && (
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {shortName}
              </span>
            )}
            {volume?.Driver && (
              <Badge variant="outline" className="text-xs">
                {volume.Driver}
              </Badge>
            )}
            {isAnonymous && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                anonymous
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DetailStat icon={HardDrive} label="Driver" value={volume?.Driver ?? "N/A"} />
        <DetailStat icon={Hash} label="Scope" value={volume?.Scope ?? "N/A"} />
        <DetailStat icon={Tag} label="Labels" value={labelEntries.length} />
        <DetailStat icon={Clock} label="Created" value={created ?? "N/A"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DetailSection title="Volume Details" icon={HardDrive}>
          <DetailRow label="Name" value={volume?.Name} mono />
          <DetailRow
            label="Driver"
            value={
              volume?.Driver ? (
                <Badge variant="outline" className="font-mono text-xs">
                  {volume.Driver}
                </Badge>
              ) : null
            }
          />
          <DetailRow
            label="Mountpoint"
            value={
              volume?.Mountpoint ? (
                <span className="inline-flex items-start gap-2 min-w-0">
                  <FolderOpen className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="break-all">{volume.Mountpoint}</span>
                </span>
              ) : null
            }
            mono
          />
          <DetailRow
            label="Scope"
            value={
              volume?.Scope ? (
                <Badge variant="outline" className="font-mono text-xs">
                  {volume.Scope}
                </Badge>
              ) : null
            }
          />
          <DetailRow label="Created" value={created} />
        </DetailSection>

        <DetailSection
          title={`Labels (${labelEntries.length})`}
          icon={Tag}
          contentClassName="space-y-2"
        >
          {labelEntries.length > 0 ? (
            labelEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/40 p-3 min-w-0">
                <p className="font-mono text-xs text-primary break-all">{key}</p>
                {value && (
                  <p className="font-mono text-xs text-muted-foreground break-all mt-1">
                    {value}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">No labels.</p>
          )}
        </DetailSection>
      </div>

      {optionEntries.length > 0 && (
        <DetailSection title="Options" icon={Hash} contentClassName="space-y-2">
          {optionEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted/40 p-3 min-w-0">
              <p className="font-mono text-xs text-primary break-all">{key}</p>
              {value && (
                <p className="font-mono text-xs text-muted-foreground break-all mt-1">
                  {value}
                </p>
              )}
            </div>
          ))}
        </DetailSection>
      )}

      <RawJsonDetails data={volume} />
    </div>
  );
}
