import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dockerApi, type ImageHistoryItem } from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  HardDrive,
  Clock,
  Cpu,
  Monitor,
  Tag,
  Terminal,
  FolderOpen,
  Globe,
  ChevronRight,
  Hash,
} from "lucide-react";

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
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function cleanCmd(cmd: string) {
  return cmd
    .replace(/^\/bin\/sh -c #\(nop\)\s*/i, "")
    .replace(/^\/bin\/sh -c /i, "RUN ")
    .trim();
}

function LayerRow({ item, index, total }: { item: ImageHistoryItem; index: number; total: number }) {
  const isBase = index === total - 1;
  const cmd = cleanCmd(item.CreatedBy || "<missing>");
  const isNop = item.CreatedBy?.includes("#(nop)");
  const layerNum = total - index;

  return (
    <div className="flex gap-3 group">
      {/* Timeline */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isBase
            ? "bg-primary text-primary-foreground"
            : item.Size > 0
            ? "bg-primary/20 text-primary border border-primary/30"
            : "bg-muted text-muted-foreground border border-border"
        }`}>
          {layerNum}
        </div>
        {!isBase && <div className="w-px flex-1 bg-border mt-1 min-h-[1rem]" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 min-w-0 ${isBase ? "" : ""}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <code className={`text-xs font-mono break-all leading-relaxed ${
            isNop ? "text-muted-foreground" : "text-foreground"
          }`}>
            {cmd}
          </code>
          {item.Size > 0 && (
            <Badge variant="outline" className="text-xs shrink-0 font-mono">
              +{formatSize(item.Size)}
            </Badge>
          )}
        </div>
        {item.Tags && item.Tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {item.Tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {new Date(item.Created * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
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

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: image, isLoading: imageLoading } = useQuery({
    queryKey: ["image", id, decodedImageId],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.inspectImage(agent.url, agent.token, decodedImageId);
      return res.data as Record<string, unknown>;
    },
    enabled: !!agent?.token,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["image-history", id, decodedImageId],
    queryFn: async () => {
      if (!agent?.token) throw new Error("Agent token not available");
      const res = await dockerApi.imageHistory(agent.url, agent.token, decodedImageId);
      return res.data as ImageHistoryItem[];
    },
    enabled: !!agent?.token,
  });

  if (imageLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card animate-pulse h-40" />
        ))}
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (image?.Config ?? {}) as Record<string, any>;
  const rootfs = (image?.RootFS ?? {}) as Record<string, unknown>;
  const tags = (image?.RepoTags as string[]) ?? [];
  const digests = (image?.RepoDigests as string[]) ?? [];
  const envs = (cfg.Env as string[]) ?? [];
  const cmd = Array.isArray(cfg.Cmd) ? (cfg.Cmd as string[]).join(" ") : null;
  const entrypoint = Array.isArray(cfg.Entrypoint) ? (cfg.Entrypoint as string[]).join(" ") : null;
  const workdir = cfg.WorkingDir as string | null;
  const exposedPorts = cfg.ExposedPorts ? Object.keys(cfg.ExposedPorts as object) : [];
  const layers = (rootfs.Layers as string[]) ?? [];

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

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
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

      {/* Stats strip */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image Details */}
        <Section title="Image Details" icon={Hash}>
          <InfoRow label="Full ID" value={(image?.Id as string) ?? null} mono />
          {virtualSize && <InfoRow label="Virtual Size" value={virtualSize} />}
          {author && <InfoRow label="Author" value={author} />}
          <InfoRow label="Docker Version" value={dockerVersion} />
          <InfoRow label="Parent ID" value={(image?.Parent as string) || null} mono />
        </Section>

        {/* Tags & Digests */}
        <Section title="Tags & Digests" icon={Tag}>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-mono text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic mb-3">No tags</p>
          )}
          {digests.length > 0 && (
            <div className="space-y-1">
              {digests.map((d) => (
                <p key={d} className="font-mono text-xs text-muted-foreground break-all">
                  {d}
                </p>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Config */}
      {(cmd || entrypoint || workdir || exposedPorts.length > 0 || envs.length > 0) && (
        <Section title="Container Config" icon={Terminal}>
          <div className="space-y-0">
            {entrypoint && <InfoRow label="Entrypoint" value={entrypoint} mono />}
            {cmd && <InfoRow label="CMD" value={cmd} mono />}
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
                    <Badge key={p} variant="outline" className="font-mono text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {envs.length > 0 && (
              <div className="flex gap-3 py-2.5">
                <span className="text-muted-foreground text-sm w-32 shrink-0">Env</span>
                <div className="space-y-0.5 min-w-0">
                  {envs.map((e) => (
                    <p key={e} className="font-mono text-xs text-muted-foreground break-all">
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* RootFS Layers */}
      {layers.length > 0 && (
        <Section title={`RootFS Layers (${layers.length})`} icon={ChevronRight}>
          <div className="space-y-1">
            {layers.map((layer, i) => (
              <div key={layer} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                <code className="font-mono text-xs text-muted-foreground break-all">
                  {layer.replace("sha256:", "").slice(0, 64)}
                </code>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* History / Dockerfile Layers */}
      <Section title={`Build History (${history?.length ?? 0} layers)`} icon={Layers}>
        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : !history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history available.</p>
        ) : (
          <div className="pt-1">
            {history.map((item, i) => (
              <LayerRow key={`${item.Id}-${i}`} item={item} index={i} total={history.length} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
