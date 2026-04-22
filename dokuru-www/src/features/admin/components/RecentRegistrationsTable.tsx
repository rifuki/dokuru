import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, ArrowRight } from "lucide-react";
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

  const colors = [
    "bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400",
    "bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400",
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    "bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    "bg-pink-100 text-pink-600 dark:bg-pink-950/30 dark:text-pink-400",
    "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400",
  ];
  const idx = initials.charCodeAt(0) % colors.length;

  return (
    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0", colors[idx])}>
      {initials}
    </div>
  );
}

export function RecentRegistrationsTable({ registrations, loading }: RecentRegistrationsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Users</CardTitle>
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
          <div className="px-6 pb-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 bg-muted rounded" />
                  <div className="h-2 w-20 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !registrations || registrations.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-muted-foreground">
            No recent registrations
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {registrations.map((user) => (
              <div key={user.id} className="px-6 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <UserAvatar name={user.username} email={user.email} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.username || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user.email_verified ? (
                    <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                      <Clock className="h-2.5 w-2.5" />
                      Pending
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
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
