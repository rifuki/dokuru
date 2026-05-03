import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { canUseDockerAgent, dockerApi, dockerCredential, type ImageHistoryItem } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DetailPageSkeleton } from "@/components/ui/detail-layout";
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
  Layers,
  HardDrive,
  Clock,
  Cpu,
  Monitor,
  Tag,
  Terminal,
  FolderOpen,
  Globe,
  Hash,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";

export const Route = createFileRoute(
  "/_authenticated/agents/$id/images/$imageId"
)({
  component: ImageDetailPage,
});

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const mb = bytes / 1024 / 1024;
  if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(1)} kB`;
  return `${bytes} B`;
}

function cleanCmd(raw: string) {
  return raw
    .replace(/^\/bin\/sh -c #\(nop\)\s*/i, "")
    .replace(/^\/bin\/sh -c /i, "RUN ")
    .trim() || "<missing>";
}

// ── Row type for the history table ───────────────────────────────────────────
interface HistoryRow {
  order: number;
  size: number;        // raw bytes for sorting
  sizeLabel: string;   // formatted
  command: string;
  tags: string[] | null;
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm w-32 shrink-0">{label}</span>
      <span className={`text-sm break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b bg-muted/30">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ImageDetailPage() {
  const { id, imageId } = Route.useParams();
  const decodedImageId = decodeURIComponent(imageId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: image, isLoading: imageLoading } = useQuery({
    queryKey: ["image", id, decodedImageId],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      const res = await dockerApi.inspectImage(agent.url, credential, decodedImageId);
      return res.data as Record<string, unknown>;
    },
    enabled: canUseDockerAgent(agent),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["image-history", id, decodedImageId],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error();
      const res = await dockerApi.imageHistory(agent.url, credential, decodedImageId);
      return res.data as ImageHistoryItem[];
    },
    enabled: canUseDockerAgent(agent),
  });
  useWindowScrollMemory(`agent:${id}:image-detail:${imageId}`, !imageLoading && !!image);

  const removeMutation = useMutation({
    mutationFn: () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      return dockerApi.removeImage(agent.url, credential, decodedImageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images", id] });
      toast.success("Image removed");
      navigate({ to: "/agents/$id/images", params: { id } });
    },
    onError: () => toast.error("Failed to remove image"),
    onSettled: () => setRemoveDialogOpen(false),
  });

  if (imageLoading) {
    return <DetailPageSkeleton showUsageSection={false} showConfigSection showTableSection showRawSection={false} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (image?.Config ?? {}) as Record<string, any>;
  const tags = (image?.RepoTags as string[]) ?? [];
  const digests = (image?.RepoDigests as string[]) ?? [];
  const envs = (cfg.Env as string[]) ?? [];
  const cmd = Array.isArray(cfg.Cmd) ? (cfg.Cmd as string[]).join(" ") : null;
  const entrypoint = Array.isArray(cfg.Entrypoint) ? (cfg.Entrypoint as string[]).join(" ") : null;
  const workdir = (cfg.WorkingDir as string) || null;
  const exposedPorts = cfg.ExposedPorts ? Object.keys(cfg.ExposedPorts as object) : [];

  const shortId = (image?.Id as string)?.replace("sha256:", "").slice(0, 12) ?? "";
  const fullSize = image?.Size ? formatSize(image.Size as number) : "N/A";
  const virtualSize = image?.VirtualSize ? formatSize(image.VirtualSize as number) : null;
  const arch = image?.Architecture as string;
  const os = image?.Os as string;
  const variant = image?.Variant as string | undefined;
  const dockerVersion = image?.DockerVersion as string | undefined;
  const author = image?.Author as string | undefined;
  const created = image?.Created ? new Date(image.Created as string).toLocaleString() : null;
  const primaryTag = tags[0] ?? decodedImageId.replace("sha256:", "").slice(0, 12);

  // Build history table rows — reverse so order 0 = oldest/base layer
  const historyRows: HistoryRow[] = history
    ? [...history].reverse().map((item, i) => ({
        order: i,
        size: item.Size,
        sizeLabel: formatSize(item.Size),
        command: cleanCmd(item.CreatedBy || ""),
        tags: item.Tags,
      }))
    : [];

  const historyColumns: ColumnDef<HistoryRow>[] = [
    {
      accessorKey: "order",
      header: "Order",
      size: 72,
      cell: ({ getValue }) => (
        <span className="text-sm font-mono text-muted-foreground tabular-nums">
          {getValue() as number}
        </span>
      ),
    },
    {
      accessorKey: "size",
      header: "Size",
      size: 110,
      cell: ({ row }) => (
        <span className={`text-sm font-mono tabular-nums ${row.original.size > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {row.original.sizeLabel}
        </span>
      ),
    },
    {
      accessorKey: "command",
      header: "Layer",
      cell: ({ getValue, row }) => {
        const cmd = getValue() as string;
        const truncated = cmd.length > 80 ? cmd.slice(0, 80) + " …" : cmd;
        return (
          <div className="flex items-start gap-2 min-w-0">
            <code className="text-xs font-mono break-all leading-relaxed" title={cmd}>
              {truncated}
            </code>
            {row.original.tags && row.original.tags.length > 0 && (
              <div className="flex gap-1 shrink-0 flex-wrap">
                {row.original.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs px-1.5 py-0">{t}</Badge>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const hasConfig = cmd || entrypoint || workdir || exposedPorts.length > 0 || envs.length > 0;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: "/agents/$id/images", params: { id } });
  };

  return (
    <>
    <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Image</AlertDialogTitle>
          <AlertDialogDescription>
            Remove image "{primaryTag}"? Containers that depend on it may need to pull it again.
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary shrink-0">
            <Layers className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight truncate">{primaryTag}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {shortId}
              </span>
              {arch && (
                <Badge variant="outline" className="text-xs">
                  {os}/{arch}{variant ? `/${variant}` : ""}
                </Badge>
              )}
              {dockerVersion && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Docker {dockerVersion}
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

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: HardDrive, label: "Size", value: fullSize },
          { icon: Clock, label: "Created", value: created ?? "N/A" },
          { icon: Cpu, label: "Architecture", value: arch ? `${arch}${variant ? `/${variant}` : ""}` : "N/A" },
          { icon: Monitor, label: "OS", value: os ?? "N/A" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3 flex items-center gap-3">
            <Icon className="h-4 w-4 text-primary/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Image Details + Tags ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Image Details" icon={Hash}>
          <InfoRow label="Full ID" value={(image?.Id as string) ?? null} mono />
          {virtualSize && <InfoRow label="Virtual Size" value={virtualSize} />}
          {author && <InfoRow label="Author" value={author} />}
          <InfoRow label="Docker Version" value={dockerVersion} />
          <InfoRow label="Parent ID" value={(image?.Parent as string) || null} mono />
        </Section>

        <Section title="Tags & Digests" icon={Tag}>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-mono text-xs">{t}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic mb-3">No tags</p>
          )}
          {digests.length > 0 && (
            <div className="space-y-1">
              {digests.map((d) => (
                <p key={d} className="font-mono text-xs text-muted-foreground break-all">{d}</p>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Dockerfile Config ─────────────────────────────────────────────── */}
      {hasConfig && (
        <Section title="Dockerfile Config" icon={Terminal}>
          <div className="space-y-0">
            <InfoRow label="Entrypoint" value={entrypoint} mono />
            <InfoRow label="CMD" value={cmd} mono />
            {workdir && (
              <div className="flex gap-3 py-2.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm w-32 shrink-0 flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Workdir
                </span>
                <span className="font-mono text-xs break-all">{workdir}</span>
              </div>
            )}
            {exposedPorts.length > 0 && (
              <div className="flex gap-3 py-2.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm w-32 shrink-0 flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  Ports
                </span>
                <div className="flex flex-wrap gap-1">
                  {exposedPorts.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {envs.length > 0 && (
              <div className="flex gap-3 py-2.5">
                <span className="text-muted-foreground text-sm w-32 shrink-0">Env</span>
                <div className="space-y-0.5 min-w-0">
                  {envs.map((e) => (
                    <p key={e} className="font-mono text-xs text-muted-foreground break-all">{e}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Build History — DataTable ────────────────────────────────────── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b bg-muted/30">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">
            Build History {historyRows.length > 0 ? `(${historyRows.length} layers)` : ""}
          </h3>
        </div>
        <div className="p-5">
          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history available.</p>
          ) : (
            <DataTable
              data={historyRows}
              columns={historyColumns}
              rowId="order"
              searchPlaceholder="Search layers…"
            />
          )}
        </div>
      </div>

    </div>
    </>
  );
}
