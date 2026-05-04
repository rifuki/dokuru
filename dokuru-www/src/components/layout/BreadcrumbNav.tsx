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
import { cn } from "@/lib/utils";

const routeLabels: Record<string, string> = {
  app: "App", dashboard: "Dashboard",
  profile: "Profile",
  admin: "Admin",
  agents: "Agents",
  audit: "Audit",
  audits: "Audits",
  containers: "Containers",
  stacks: "Stacks",
  images: "Images",
  networks: "Networks",
  volumes: "Volumes",
  events: "Events",
  shell: "VPS Shell",
};

const resourceLabels: Record<string, string> = {
  agents: "Agent",
  audits: "Audit Result",
  containers: "Container",
  images: "Image",
  networks: "Network",
  volumes: "Volume",
};

function labelForSegment(segment: string, previousSegment?: string) {
  const decoded = decodeURIComponent(segment);
  const resourceLabel = previousSegment ? resourceLabels[previousSegment] : undefined;

  if (resourceLabel && decoded.length > 16) return resourceLabel;

  const truncated = decoded.length > 20 ? decoded.slice(0, 20) + "…" : decoded;
  return routeLabels[segment] || truncated.charAt(0).toUpperCase() + truncated.slice(1);
}

export function BreadcrumbNav() {
  const location = useLocation();
  const pathname = location.pathname;

  // Determine base path for home icon
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/";

  // Get path segments after the base path
  const relativePath = pathname.replace(basePath, "");
  const segments = relativePath.split("/").filter(Boolean);

  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden break-normal">
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
          const label = labelForSegment(segment, segments[index - 1]);

          return (
            <div
              key={`${segment}-${index}`}
              className={cn("min-w-0 items-center gap-2", !isLast && segments.length > 1 ? "hidden sm:flex" : "flex")}
            >
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage className="block max-w-[9rem] truncate sm:max-w-[14rem] lg:max-w-[24rem]">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="block max-w-[8rem] truncate lg:max-w-[14rem]">
                    <Link to={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className="shrink-0">
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
