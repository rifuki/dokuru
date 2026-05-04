import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface StatItem {
  value: string | number;
  label: string;
  pulse?: boolean;
}

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  stats?: StatItem[];
  children?: React.ReactNode;
  loading?: boolean;
}

export function PageHeader({
  icon: Icon,
  title,
  stats,
  children,
  loading,
}: PageHeaderProps) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6 sm:py-5">
        {/* Left: icon + title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="min-w-0 truncate text-xl font-bold tracking-tight">{title}</h2>
        </div>

        {/* Right: actions */}
        {children && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto">{children}</div>
        )}
      </div>

      {/* Stats bar — separated by a top border so it's clearly footer of the header card */}
      {(loading || (stats && stats.length > 0)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 bg-muted/20 px-4 py-2.5 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <span className="text-border/60 text-xs">|</span>
              <Skeleton className="h-3 w-16" />
            </div>
          ) : (
            stats?.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-border/60 text-xs">|</span>}
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {i === 0 && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0",
                        s.pulse && "animate-pulse",
                      )}
                    />
                  )}
                  <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
                  <span>{s.label}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
