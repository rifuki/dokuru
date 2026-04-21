import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const routeLabels: Record<string, string> = {
  app: "App", dashboard: "Dashboard",
  profile: "Profile",
  admin: "Admin",
};

export function BreadcrumbNav() {
  const location = useLocation();
  const pathname = location.pathname;

  // Determine base path for home icon
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/";

  // Get path segments after the base path
  const relativePath = pathname.replace(basePath, "");
  const segments = relativePath.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to={basePath}>
              <Home className="h-4 w-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {segments.length > 0 && (
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
        )}

        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const href = basePath + "/" + segments.slice(0, index + 1).join("/");
          const decoded = decodeURIComponent(segment);
          // Truncate long hashes/IDs (UUIDs, sha256, container IDs, etc.)
          const truncated = decoded.length > 20 ? decoded.slice(0, 20) + "…" : decoded;
          const label = routeLabels[segment] || truncated.charAt(0).toUpperCase() + truncated.slice(1);

          return (
            <div key={segment} className="flex items-center gap-2">
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
              )}
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
