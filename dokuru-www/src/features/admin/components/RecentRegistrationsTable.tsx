import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Users, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "../types/stats";

interface RecentRegistrationsTableProps {
  registrations?: DashboardStats["recent_registrations"];
  loading?: boolean;
}

function UserAvatar({ name, email }: { name?: string | null; email: string }) {
  const initials = name
    ? name.slice(0, 2).toUpperCase()
    : email.slice(0, 2).toUpperCase();

  // Deterministic color based on initials
  const colors = [
    "bg-blue-500/20 text-blue-500",
    "bg-purple-500/20 text-purple-500",
    "bg-emerald-500/20 text-emerald-500",
    "bg-amber-500/20 text-amber-500",
    "bg-rose-500/20 text-rose-500",
    "bg-cyan-500/20 text-cyan-500",
  ];
  const idx = initials.charCodeAt(0) % colors.length;

  return (
    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0", colors[idx])}>
      {initials}
    </div>
  );
}

export function RecentRegistrationsTable({ registrations, loading }: RecentRegistrationsTableProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Recent Registrations
            </CardTitle>
            <CardDescription className="mt-0.5">Latest users who joined the platform</CardDescription>
          </div>
          <Link
            to="/admin/users"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 space-y-3 pb-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-2.5 w-48 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !registrations || registrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Users className="h-8 w-8 opacity-20" />
            <p className="text-sm">No registrations yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {registrations.map((user) => (
              <div key={user.id} className="flex items-center gap-3 px-6 py-3 hover:bg-accent/30 transition-colors">
                <UserAvatar name={user.username} email={user.email} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {user.username || user.email.split("@")[0]}
                    </p>
                    {user.role === "admin" && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-indigo-500/40 text-indigo-500 bg-indigo-500/10">
                        admin
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {user.email_verified ? (
                    <div className="flex items-center gap-1 text-emerald-500 text-[11px]">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-500 text-[11px]">
                      <Clock className="h-3 w-3" />
                      <span>Pending</span>
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
