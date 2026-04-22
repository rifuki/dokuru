import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Muted colors
  const colors = [
    "bg-[hsl(220,45%,96%)] text-[hsl(220,50%,50%)] dark:bg-[hsl(220,45%,15%)] dark:text-[hsl(220,50%,60%)]",
    "bg-[hsl(260,40%,96%)] text-[hsl(260,45%,55%)] dark:bg-[hsl(260,40%,15%)] dark:text-[hsl(260,45%,65%)]",
    "bg-[hsl(142,40%,96%)] text-[hsl(142,45%,45%)] dark:bg-[hsl(142,40%,15%)] dark:text-[hsl(142,45%,55%)]",
    "bg-[hsl(30,45%,96%)] text-[hsl(30,50%,50%)] dark:bg-[hsl(30,45%,15%)] dark:text-[hsl(30,50%,60%)]",
    "bg-[hsl(330,40%,96%)] text-[hsl(330,45%,55%)] dark:bg-[hsl(330,40%,15%)] dark:text-[hsl(330,45%,65%)]",
    "bg-[hsl(180,40%,96%)] text-[hsl(180,40%,45%)] dark:bg-[hsl(180,40%,15%)] dark:text-[hsl(180,40%,55%)]",
  ];
  const idx = initials.charCodeAt(0) % colors.length;

  return (
    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0", colors[idx])}>
      {initials}
    </div>
  );
}

export function RecentRegistrationsTable({ registrations, loading }: RecentRegistrationsTableProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[hsl(220,50%,96%)] dark:bg-[hsl(220,50%,15%)] flex items-center justify-center">
              <Users className="h-4 w-4 text-[hsl(220,50%,55%)]" />
            </div>
            <CardTitle className="text-base font-semibold">Recent Users</CardTitle>
          </div>
          <Link
            to="/admin/users"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            View all
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-6 pb-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-9 w-9 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-2 w-24 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !registrations || registrations.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No recent registrations
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {registrations.map((user) => (
              <div key={user.id} className="px-6 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <UserAvatar name={user.username} email={user.email} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.username || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user.email_verified ? (
                    <Badge variant="outline" className="gap-1 text-[hsl(142,45%,45%)] border-[hsl(142,40%,85%)] bg-[hsl(142,40%,96%)] dark:bg-[hsl(142,40%,15%)]">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[hsl(38,50%,50%)] border-[hsl(38,45%,85%)] bg-[hsl(38,45%,96%)] dark:bg-[hsl(38,45%,15%)]">
                      <Clock className="h-3 w-3" />
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
