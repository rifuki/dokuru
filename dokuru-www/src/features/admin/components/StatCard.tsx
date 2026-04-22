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
  color?: "blue" | "purple" | "green" | "orange" | "cyan" | "pink";
}

const colorStyles = {
  blue: {
    icon: "bg-[hsl(220,50%,96%)] text-[hsl(220,50%,50%)] dark:bg-[hsl(220,50%,15%)] dark:text-[hsl(220,50%,60%)]",
    border: "border-[hsl(220,40%,90%)] dark:border-[hsl(220,40%,20%)]",
    hover: "hover:border-[hsl(220,45%,70%)] dark:hover:border-[hsl(220,45%,40%)]",
    accent: "from-[hsl(220,50%,60%)] to-transparent",
  },
  purple: {
    icon: "bg-[hsl(260,45%,96%)] text-[hsl(260,45%,55%)] dark:bg-[hsl(260,45%,15%)] dark:text-[hsl(260,45%,65%)]",
    border: "border-[hsl(260,35%,90%)] dark:border-[hsl(260,35%,20%)]",
    hover: "hover:border-[hsl(260,40%,70%)] dark:hover:border-[hsl(260,40%,40%)]",
    accent: "from-[hsl(260,45%,60%)] to-transparent",
  },
  green: {
    icon: "bg-[hsl(142,40%,96%)] text-[hsl(142,45%,45%)] dark:bg-[hsl(142,40%,15%)] dark:text-[hsl(142,45%,55%)]",
    border: "border-[hsl(142,35%,90%)] dark:border-[hsl(142,35%,20%)]",
    hover: "hover:border-[hsl(142,40%,70%)] dark:hover:border-[hsl(142,40%,40%)]",
    accent: "from-[hsl(142,40%,50%)] to-transparent",
  },
  orange: {
    icon: "bg-[hsl(30,45%,96%)] text-[hsl(30,50%,50%)] dark:bg-[hsl(30,45%,15%)] dark:text-[hsl(30,50%,60%)]",
    border: "border-[hsl(30,40%,90%)] dark:border-[hsl(30,40%,20%)]",
    hover: "hover:border-[hsl(30,45%,70%)] dark:hover:border-[hsl(30,45%,40%)]",
    accent: "from-[hsl(30,45%,55%)] to-transparent",
  },
  cyan: {
    icon: "bg-[hsl(180,40%,96%)] text-[hsl(180,40%,45%)] dark:bg-[hsl(180,40%,15%)] dark:text-[hsl(180,40%,55%)]",
    border: "border-[hsl(180,35%,90%)] dark:border-[hsl(180,35%,20%)]",
    hover: "hover:border-[hsl(180,40%,70%)] dark:hover:border-[hsl(180,40%,40%)]",
    accent: "from-[hsl(180,35%,55%)] to-transparent",
  },
  pink: {
    icon: "bg-[hsl(330,45%,96%)] text-[hsl(330,45%,55%)] dark:bg-[hsl(330,45%,15%)] dark:text-[hsl(330,45%,65%)]",
    border: "border-[hsl(330,35%,90%)] dark:border-[hsl(330,35%,20%)]",
    hover: "hover:border-[hsl(330,40%,70%)] dark:hover:border-[hsl(330,40%,40%)]",
    accent: "from-[hsl(330,40%,60%)] to-transparent",
  },
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
}: StatCardProps) {
  const style = colorStyles[color];

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
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
        "group relative rounded-lg border bg-card p-5 transition-all duration-200",
        style.border,
        href && `${style.hover} hover:shadow-md hover:-translate-y-0.5 cursor-pointer`
      )}
    >
      {/* Subtle top accent */}
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-60", style.accent)} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", style.icon)}>
          {icon}
        </div>
      </div>

      {/* Value & Description */}
      <div className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        
        <div className="flex items-center gap-2">
          {trend && (
            <span className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trendUp ? "text-[hsl(142,45%,45%)]" : "text-[hsl(0,45%,50%)]"
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

      {/* Arrow indicator for clickable cards */}
      {href && (
        <ArrowRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-1 transition-all duration-200" />
      )}
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return content;
}
