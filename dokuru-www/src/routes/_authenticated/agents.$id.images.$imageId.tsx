import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dockerApi } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Box } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/images/$imageId")({
  component: ImageDetailPage,
});

function ImageDetailPage() {
  const { id, imageId } = Route.useParams();
  // Decode the imageId in case it's URL encoded
  const decodedImageId = decodeURIComponent(imageId);

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: image, isLoading } = useQuery({
    queryKey: ["image", id, decodedImageId],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.inspectImage(agent.url, agent.token, decodedImageId);
      return res.data;
    },
    enabled: !!agent?.token,
  });

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-card rounded-lg" />;
  }

  const tags = (image?.RepoTags as string[]) || [];
  const size = image?.Size ? `${(image.Size / 1024 / 1024).toFixed(2)} MB` : "N/A";

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="min-w-0">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3 min-w-0">
          <Box className="h-8 w-8 shrink-0" />
          <span className="truncate">{tags[0] || imageId}</span>
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Image Details</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-6 rounded-lg border bg-card">
          <h3 className="font-semibold text-lg">Image Information</h3>
          <div className="space-y-3 text-sm">
            <div className="min-w-0">
              <span className="text-muted-foreground">ID:</span>
              <p className="font-mono text-xs break-all">{image?.Id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Size:</span>
              <p className="font-mono">{size}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <p>{image?.Created ? new Date(image.Created).toLocaleString() : "N/A"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6 rounded-lg border bg-card">
          <h3 className="font-semibold text-lg">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-mono text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 rounded-lg border bg-card overflow-hidden">
        <h3 className="font-semibold text-lg mb-4">Raw JSON</h3>
        <pre className="bg-muted/50 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono w-full">
          {JSON.stringify(image, null, 2)}
        </pre>
      </div>
    </div>
  );
}