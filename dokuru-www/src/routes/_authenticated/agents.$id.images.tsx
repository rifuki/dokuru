import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import { dockerApi, type Image } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";

export const Route = createFileRoute("/_authenticated/agents/$id/images")({
  component: ImagesPage,
});

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
      const res = await dockerApi.listImages(agent!.url, agent!.token, true);
      return res.data;
    },
    enabled: !!agent,
    refetchInterval: 10000,
  });

  const removeMutation = useMutation({
    mutationFn: (imageId: string) => dockerApi.removeImage(agent!.url, agent!.token, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images", id] });
      toast.success("Image removed");
    },
    onError: () => toast.error("Failed to remove image"),
  });

  const pruneMutation = useMutation({
    mutationFn: () => dockerApi.pruneImages(agent!.url, agent!.token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images", id] });
      toast.success("Unused images pruned");
    },
    onError: () => toast.error("Failed to prune images"),
  });

  const formatSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Images</h2>
          <p className="text-muted-foreground text-sm mt-1">Loading images...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Images</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {images?.length || 0} images found
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Remove all unused images?")) {
              pruneMutation.mutate();
            }
          }}
          disabled={pruneMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Prune Unused
        </Button>
      </div>

      {!images || images.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center">
          <ImageIcon className="h-12 w-12 text-muted-foreground/40 mb-4 mx-auto" />
          <h3 className="text-lg font-semibold">No images found</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            No Docker images are available on this agent.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository:Tag</TableHead>
                <TableHead>Image ID</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {images.map((image: Image) => (
                <TableRow key={image.id}>
                  <TableCell className="font-medium">
                    {image.repo_tags[0] || "<none>:<none>"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {image.id.replace("sha256:", "").slice(0, 12)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatSize(image.size)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Are you sure you want to remove this image?")) {
                          removeMutation.mutate(image.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
