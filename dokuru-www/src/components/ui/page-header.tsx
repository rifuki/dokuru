import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatItem {
  value: string | number;
  label: string;
  pulse?: boolean;
}

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  stats?: StatItem[];
  accent: "green" | "cyan" | "blue" | "violet" | "orange" | "rose";
  children?: React.ReactNode; // right-side actions/search
  loading?: boolean;
}

const accentMap = {
  green: {
    glow: "from-green-500/8 to-transparent",
    border: "border-green-500/20",
    icon: "bg-green-500/10 text-green-400 border-green-500/20",
    dot: "bg-green-400",
    ring: "shadow-green-500/20",
    pulse: "bg-green-400",
  },
  cyan: {
    glow: "from-cyan-500/8 to-transparent",
    border: "border-cyan-500/20",
    icon: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    dot: "bg-cyan-400",
    ring: "shadow-cyan-500/20",
    pulse: "bg-cyan-400",
  },
  blue: {
    glow: "from-blue-500/8 to-transparent",
    border: "border-blue-500/20",
    icon: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dot: "bg-blue-400",
    ring: "shadow-blue-500/20",
    pulse: "bg-blue-400",
  },
  violet: {
    glow: "from-violet-500/8 to-transparent",
    border: "border-violet-500/20",
    icon: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    dot: "bg-violet-400",
    ring: "shadow-violet-500/20",
    pulse: "bg-violet-400",
  },
  orange: {
    glow: "from-orange-500/8 to-transparent",
    border: "border-orange-500/20",
    icon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    dot: "bg-orange-400",
    ring: "shadow-orange-500/20",
    pulse: "bg-orange-400",
  },
  rose: {
    glow: "from-rose-500/8 to-transparent",
    border: "border-rose-500/20",
    icon: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    dot: "bg-rose-400",
    ring: "shadow-rose-500/20",
    pulse: "bg-rose-400",
  },
};

export function PageHeader({
  icon: Icon,
  title,
  stats,
  accent,
  children,
  loading,
}: PageHeaderProps) {
  const a = accentMap[accent];

  return (
    <div
      className={cn(
        "relative rounded-2xl border overflow-hidden mb-6",
        a.border,
      )}
    >
      {/* Gradient fill */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-r pointer-events-none",
          a.glow,
        )}
      />

      {/* Dot-grid decoration */}
      <div
        className="absolute right-0 top-0 h-full w-64 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-5">
        {/* Left: icon + title + stats */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Icon */}
          <div
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-xl border shrink-0",
              "shadow-lg",
              a.icon,
              a.ring,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>

          {/* Title + stats */}
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight leading-none mb-2">
              {title}
            </h2>

            {loading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full animate-pulse",
                    a.dot,
                  )}
                />
                Loading…
              </div>
            ) : stats && stats.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap">
                {stats.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {i === 0 && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          a.dot,
                          s.pulse && "animate-pulse",
                        )}
                      />
                    )}
                    {i > 0 && (
                      <span className="text-muted-foreground/30 text-xs">·</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {s.value}
                      </span>{" "}
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: actions */}
        {children && (
          <div className="flex items-center gap-2 shrink-0">{children}</div>
        )}
      </div>
    </div>
  );
}
