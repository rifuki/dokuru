import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function DetailPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border bg-card animate-pulse h-40" />
      ))}
    </div>
  );
}
