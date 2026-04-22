import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Layers,
  Trash2,
  Scissors,
  HardDrive,
  Clock,
  ExternalLink,
} from "lucide-react";
import { dockerApi, type Image } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { PageHeader } from "@/components/ui/page-header";

export const Route = createFileRoute("/_authenticated/agents/$id/images/")({
  component: ImagesPage,
});

function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
}

function formatCreated(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseTag(repoTag: string) {
  const idx = repoTag.lastIndexOf(":");
  if (idx === -1) return { repo: repoTag, tag: "latest" };
  return { repo: repoTag.slice(0, idx), tag: repoTag.slice(idx + 1) };
}

function ImagesPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: images, isLoading } = useQuery({
    queryKey: ["images", id],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.listImages(agent.url, agent.token, true);
      return res.data;
    },
    enabled: !!agent?.token,
    refetchInterval: 10000,
  });

  const removeMutation = useMutation({
    mutationFn: (imageId: string) => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.removeImage(agent.url, agent.token, imageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images", id] });
      toast.success("Image removed");
    },
    onError: () => toast.error("Failed to remove image"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.pruneImages(agent.url, agent.token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images", id] });
      toast.success("Unused images pruned");
    },
    onError: () => toast.error("Failed to prune images"),
  });

  const handleDeleteSelected = async (ids: string[]) => {
    for (const imgId of ids) {
      await removeMutation.mutateAsync(imgId).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["images", id] });
    toast.success(`Removed ${ids.length} image(s)`);
  };

  const columns: ColumnDef<Image>[] = [
    {
      accessorKey: "repo_tags",
      header: "Repository:Tag",
      cell: ({ row }) => {
        const primaryTag = row.original.repo_tags?.[0] ?? "<none>:<none>";
        const extraTags = row.original.repo_tags?.slice(1) ?? [];
        const isNone = primaryTag === "<none>:<none>";
        const { repo, tag } = parseTag(primaryTag);
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              {isNone ? (
                <span className="text-sm text-muted-foreground italic">&lt;none&gt;</span>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to="/agents/$id/images/$imageId"
                    params={{ id, imageId: row.original.id }}
                    className="font-medium text-sm text-primary hover:underline truncate"
                  >
                    {repo}
                  </Link>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 font-mono shrink-0">
                    {tag}
                  </Badge>
                </div>
              )}
              {extraTags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {extraTags.slice(0, 2).map((t) => (
                    <Badge key={t} variant="outline" className="text-xs px-1.5 py-0 font-mono">
                      {parseTag(t).tag}
                    </Badge>
                  ))}
                  {extraTags.length > 2 && (
                    <span className="text-xs text-muted-foreground">+{extraTags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "id",
      header: "Image ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          {(getValue() as string).replace("sha256:", "").slice(0, 12)}
        </span>
      ),
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5 shrink-0" />
          <span>{formatSize(getValue() as number)}</span>
        </div>
      ),
    },
    {
      accessorKey: "created",
      header: "Created",
      cell: ({ getValue }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatCreated(getValue() as number)}</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <TooltipProvider>
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                  asChild
                >
                  <Link
                    to="/agents/$id/images/$imageId"
                    params={{ id, imageId: row.original.id }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    if (confirm("Remove this image?")) removeMutation.mutate(row.original.id);
                  }}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove image</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
      enableSorting: false,
      size: 80,
    },
  ];

  const totalSize = (images ?? []).reduce((sum, img) => sum + img.size, 0);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        icon={Layers}
        title="Images"
        loading={isLoading}
        stats={[
          { value: images?.length ?? 0, label: `image${(images?.length ?? 0) !== 1 ? "s" : ""}` },
          { value: formatSize(totalSize), label: "total" },
        ]}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 gap-2"
          onClick={() => { if (confirm("Remove all unused images?")) pruneMutation.mutate(); }}
          disabled={pruneMutation.isPending}
        >
          <Scissors className="h-3.5 w-3.5" />
          Prune Unused
        </Button>
      </PageHeader>

      <div className="space-y-6">

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-card animate-pulse border" />
          ))}
        </div>
      ) : !images || images.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-muted/20 p-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
              <Layers className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No images found</h3>
          <p className="text-muted-foreground text-sm">
            No Docker images are available on this agent.
          </p>
        </div>
      ) : (
        <DataTable
          data={images}
          columns={columns}
          rowId="id"
          searchPlaceholder="Search by tag or ID…"
          onDeleteSelected={handleDeleteSelected}
          deleteLabel="Remove images"
          isDeleting={removeMutation.isPending}
        />
      )}
      </div>
    </div>
  );
}
