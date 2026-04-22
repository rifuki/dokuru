import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { DashboardStats } from "../types/stats";

interface RecentRegistrationsTableProps {
  registrations: DashboardStats["recent_registrations"];
}

export function RecentRegistrationsTable({ registrations }: RecentRegistrationsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Recent Registrations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recent registrations
            </p>
          ) : (
            registrations.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.username || user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {user.email_verified ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
