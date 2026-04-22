import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
  href?: string;
  color?: "blue" | "green" | "purple" | "amber" | "cyan" | "rose" | "indigo" | "teal";
  badge?: string;
}

const colorMap = {
  blue:   { icon: "bg-blue-500/15 text-blue-500",   border: "border-blue-500/30",   glow: "hover:border-blue-500/60",   top: "from-blue-500/20 to-transparent" },
  green:  { icon: "bg-emerald-500/15 text-emerald-500", border: "border-emerald-500/30", glow: "hover:border-emerald-500/60", top: "from-emerald-500/20 to-transparent" },
  purple: { icon: "bg-purple-500/15 text-purple-500", border: "border-purple-500/30", glow: "hover:border-purple-500/60", top: "from-purple-500/20 to-transparent" },
  amber:  { icon: "bg-amber-500/15 text-amber-500",  border: "border-amber-500/30",  glow: "hover:border-amber-500/60",  top: "from-amber-500/20 to-transparent" },
  cyan:   { icon: "bg-cyan-500/15 text-cyan-500",    border: "border-cyan-500/30",   glow: "hover:border-cyan-500/60",   top: "from-cyan-500/20 to-transparent" },
  rose:   { icon: "bg-rose-500/15 text-rose-500",    border: "border-rose-500/30",   glow: "hover:border-rose-500/60",   top: "from-rose-500/20 to-transparent" },
  indigo: { icon: "bg-indigo-500/15 text-indigo-500", border: "border-indigo-500/30", glow: "hover:border-indigo-500/60", top: "from-indigo-500/20 to-transparent" },
  teal:   { icon: "bg-teal-500/15 text-teal-500",    border: "border-teal-500/30",   glow: "hover:border-teal-500/60",   top: "from-teal-500/20 to-transparent" },
};

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  trendUp,
  loading,
  href,
  color = "blue",
  badge,
}: StatCardProps) {
  const colors = colorMap[color];

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const content = (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-5 overflow-hidden transition-all duration-200",
        colors.border,
        href && `${colors.glow} hover:shadow-lg hover:-translate-y-0.5 cursor-pointer`
      )}
    >
      {/* Top gradient accent */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", colors.top.replace("to-transparent", "to-transparent"), "opacity-80")} />
      <div className={cn("absolute inset-x-0 top-0 h-16 bg-gradient-to-b opacity-30", colors.top)} />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            {badge && (
              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", colors.icon)}>
                {badge}
              </span>
            )}
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", colors.icon)}>
            {icon}
          </div>
        </div>

        {/* Value */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold tracking-tight">
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {trend && (
                <span className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  trendUp ? "text-emerald-500" : "text-rose-500"
                )}>
                  {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {trend}
                </span>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {href && (
            <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return content;
}
