import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Image as ImageIcon, Trash2, Scissors } from "lucide-react";
import { dockerApi, type Image } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/images/")({
  component: ImagesPage,
});

function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["images", id] }); toast.success("Image removed"); },
    onError: () => toast.error("Failed to remove image"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => {
      if (!agent?.token) throw new Error("Agent token not available");
      return dockerApi.pruneImages(agent.url, agent.token);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["images", id] }); toast.success("Unused images pruned"); },
    onError: () => toast.error("Failed to prune images"),
  });

  const handleDeleteSelected = async (ids: string[]) => {
    for (const id of ids) {
      await removeMutation.mutateAsync(id).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["images", id] });
    toast.success(`Removed ${ids.length} image(s)`);
  };

  const columns: ColumnDef<Image>[] = [
    {
      accessorKey: "repo_tags",
      header: "Repository:Tag",
      cell: ({ row }) => (
        <Link
          to="/agents/$id/images/$imageId"
          params={{ id, imageId: row.original.id }}
          className="text-primary hover:underline font-medium text-sm"
        >
          {row.original.repo_tags[0] || "<none>:<none>"}
        </Link>
      ),
    },
    {
      accessorKey: "id",
      header: "Image ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {(getValue() as string).replace("sha256:", "").slice(0, 12)}
        </span>
      ),
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{formatSize(getValue() as number)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
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
        </div>
      ),
      enableSorting: false,
      size: 48,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Images</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {isLoading ? "Loading…" : `${images?.length ?? 0} images found`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { if (confirm("Remove all unused images?")) pruneMutation.mutate(); }}
          disabled={pruneMutation.isPending}
        >
          <Scissors className="h-4 w-4 mr-2" />
          Prune Unused
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-lg bg-card animate-pulse border" />)}</div>
      ) : !images || images.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No images found</h3>
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
  );
}
