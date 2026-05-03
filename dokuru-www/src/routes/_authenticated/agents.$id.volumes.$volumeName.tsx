import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canUseDockerAgent,
  dockerApi,
  dockerCredential,
  type Container as DockerContainer,
} from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Container as ContainerIcon,
  FolderOpen,
  HardDrive,
  Hash,
  Tag,
  Trash2,
} from "lucide-react";
import {
  DetailPageSkeleton,
  DetailRow,
  DetailSection,
  DetailStat,
  RawJsonDetails,
} from "@/components/ui/detail-layout";
import { toast } from "sonner";
import { useState } from "react";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";

export const Route = createFileRoute("/_authenticated/agents/$id/volumes/$volumeName")({
  validateSearch: (search: Record<string, unknown>): VolumeDetailSearch => ({
    from: search.from === "container" ? search.from : undefined,
    containerId: typeof search.containerId === "string" ? search.containerId : undefined,
  }),
  component: VolumeDetailPage,
});

type VolumeDetailSearch = {
  from?: "container";
  containerId?: string;
};

type VolumeInspect = {
  Name?: string;
  Driver?: string;
  Mountpoint?: string;
  Scope?: string;
  CreatedAt?: string;
  Labels?: Record<string, string>;
  Options?: Record<string, string>;
};

type ContainerMount = {
  Type?: string;
  Name?: string;
  Source?: string;
  Destination?: string;
  RW?: boolean;
};

type ContainerInspect = {
  Id?: string;
  Name?: string;
  Config?: { Image?: string };
  State?: { Status?: string };
  Mounts?: ContainerMount[];
};

type VolumeContainerUsage = {
  id: string;
  name: string;
  image?: string;
  state?: string;
  mounts: ContainerMount[];
};

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function shortValue(value?: string) {
  return value ? value.slice(0, 12) : null;
}

function cleanContainerName(value?: string) {
  return value?.replace(/^\/+/, "") || null;
}

function containerName(container: DockerContainer, inspect?: ContainerInspect) {
  return (
    cleanContainerName(container.names[0]) ??
    cleanContainerName(inspect?.Name) ??
    container.id.slice(0, 12)
  );
}

function stateColor(state?: string) {
  switch (state?.toLowerCase()) {
    case "running":
      return "bg-primary/10 text-primary border-primary/25";
    case "exited":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

function mountMatchesVolume(mount: ContainerMount, volumeName: string, mountpoint?: string) {
  if (!volumeName) return false;
  if (mount.Name === volumeName) return true;
  if (mountpoint && mount.Source === mountpoint) return true;
  return mount.Type === "volume" && mount.Source?.endsWith(`/volumes/${volumeName}/_data`);
}

function VolumeDetailPage() {
  const { id, volumeName } = Route.useParams();
  const { from, containerId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

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

  const targetVolumeName = volume?.Name || volumeName;
  const targetMountpoint = volume?.Mountpoint;

  const { data: usedContainers = [], isLoading: usedContainersLoading } = useQuery({
    queryKey: ["volume-containers", id, targetVolumeName, targetMountpoint],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");

      const res = await dockerApi.listContainers(agent.url, credential, true);
      const inspected = await Promise.allSettled(
        res.data.map(async (container) => {
          const inspectRes = await dockerApi.inspectContainer(agent.url, credential, container.id);
          const inspect = inspectRes.data as ContainerInspect;
          const mounts = (inspect.Mounts ?? []).filter((mount) =>
            mountMatchesVolume(mount, targetVolumeName, targetMountpoint),
          );

          if (mounts.length === 0) return null;

          return {
            id: container.id,
            name: containerName(container, inspect),
            image: container.image || inspect.Config?.Image,
            state: container.state || inspect.State?.Status,
            mounts,
          } satisfies VolumeContainerUsage;
        }),
      );

      return inspected.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : [],
      );
    },
    enabled: canUseDockerAgent(agent) && !!volume,
  });
  useWindowScrollMemory(`agent:${id}:volume-detail:${volumeName}`, !isLoading && !!volume);

  const removeMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      return dockerApi.removeVolume(agent.url, credential, targetVolumeName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["volumes", id] });
      toast.success("Volume removed");
      navigate({ to: "/agents/$id/volumes", params: { id } });
    },
    onError: () => toast.error("Failed to remove volume"),
    onSettled: () => setRemoveDialogOpen(false),
  });

  if (isLoading) {
    return <DetailPageSkeleton statsCount={5} usageRows={1} />;
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

  const handleBack = () => {
    if (from === "container" && containerId) {
      navigate({ to: "/agents/$id/containers/$containerId", params: { id, containerId } });
      return;
    }
    navigate({ to: "/agents/$id/volumes", params: { id } });
  };

  return (
    <>
    <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Volume</AlertDialogTitle>
          <AlertDialogDescription>
            Remove volume "{title}"? Docker may block this if containers still use it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            {removeMutation.isPending ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
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
        <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setRemoveDialogOpen(true)} disabled={removeMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Remove
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <DetailStat icon={HardDrive} label="Driver" value={volume?.Driver ?? "N/A"} />
        <DetailStat icon={Hash} label="Scope" value={volume?.Scope ?? "N/A"} />
        <DetailStat
          icon={ContainerIcon}
          label="Containers"
          value={usedContainersLoading ? "..." : usedContainers.length}
        />
        <DetailStat icon={Tag} label="Labels" value={labelEntries.length} />
        <DetailStat icon={Clock} label="Created" value={created ?? "N/A"} />
      </div>

      <DetailSection
        title={`Used by Containers (${usedContainers.length})`}
        icon={ContainerIcon}
        contentClassName="space-y-2"
      >
        {usedContainersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : usedContainers.length > 0 ? (
          usedContainers.map((container) => (
            <Link
              key={container.id}
              to="/agents/$id/containers/$containerId"
              params={{ id, containerId: container.id }}
              search={{ from: "volume", volumeName: targetVolumeName }}
              className="group flex items-center gap-3 rounded-lg border bg-muted/20 px-3.5 py-3 min-w-0 transition-colors hover:border-primary/45 hover:bg-primary/5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <ContainerIcon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-mono text-sm font-medium truncate">{container.name}</p>
                  <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {shortValue(container.id)}
                  </span>
                  {container.state && (
                    <Badge variant="outline" className={`text-xs shrink-0 ${stateColor(container.state)}`}>
                      {container.state}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {container.image && (
                    <span className="font-mono text-xs text-muted-foreground truncate max-w-full">
                      {container.image}
                    </span>
                  )}
                  {container.mounts.map((mount, index) => (
                    <Badge key={`${mount.Destination}-${index}`} variant="outline" className="font-mono text-xs">
                      {mount.Destination ?? "mounted"}{mount.RW === false ? ":ro" : ""}
                    </Badge>
                  ))}
                </div>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No containers currently mount this volume.
          </p>
        )}
      </DetailSection>

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
    </>
  );
}
