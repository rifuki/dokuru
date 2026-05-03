import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function hasValue(value: ReactNode) {
  return value !== null && value !== undefined && value !== "";
}

export function DetailSection({
  title,
  icon: Icon,
  children,
  className,
  contentClassName,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b bg-muted/30">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className={cn("px-5 py-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
}) {
  if (!hasValue(value)) return null;

  return (
    <div className="flex gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm w-32 shrink-0">{label}</span>
      <div
        className={cn(
          "text-sm min-w-0 flex-1 break-words",
          mono && "font-mono text-xs break-all",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 flex items-center gap-3 min-w-0">
      <Icon className="h-4 w-4 text-primary/70 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

export function RawJsonDetails({
  data,
  title = "Raw JSON",
}: {
  data: unknown;
  title?: string;
}) {
  return (
    <details className="rounded-xl border bg-card overflow-hidden group">
      <summary className="flex items-center justify-between gap-3 px-5 py-4 bg-muted/30 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5 font-semibold text-sm">
          <span className="font-mono text-primary text-base leading-none">{`{}`}</span>
          {title}
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">Click to expand</span>
      </summary>
      <div className="border-t p-5">
        <pre className="bg-muted/40 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono leading-relaxed max-w-full">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function SkeletonPanel({ rows = 4, list = false }: { rows?: number; list?: boolean }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b bg-muted/30 px-5 py-4">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="px-5 py-4">
        {list ? (
          <div className="space-y-2">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3.5 py-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-5 w-20 rounded" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="flex gap-3 border-b border-border/50 py-2.5 last:border-0">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className={cn("h-4 flex-1", index % 2 === 0 ? "max-w-[72%]" : "max-w-[52%]")} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DetailPageSkeleton({
  statsCount = 4,
  usageRows = 1,
  showUsageSection = true,
  showConfigSection = false,
  showTableSection = false,
  showRawSection = true,
}: {
  statsCount?: 4 | 5;
  usageRows?: number;
  showUsageSection?: boolean;
  showConfigSection?: boolean;
  showTableSection?: boolean;
  showRawSection?: boolean;
} = {}) {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-72 max-w-[48vw]" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-28 rounded" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      <div className={cn("grid gap-3", statsCount === 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
        {Array.from({ length: statsCount }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24 max-w-full" />
            </div>
          </div>
        ))}
      </div>

      {showUsageSection && <SkeletonPanel rows={usageRows} list />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonPanel rows={6} />
        <SkeletonPanel rows={4} list />
      </div>

      {showConfigSection && <SkeletonPanel rows={5} />}
      {showTableSection && <SkeletonPanel rows={4} list />}

      {showRawSection && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 bg-muted/30 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-7 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )}
    </div>
  );
}
