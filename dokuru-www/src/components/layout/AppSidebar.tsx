import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  PanelLeft,
  User,
  Shield,
  MonitorSmartphone,
  Users,
  Key,
  LayoutDashboard,
  Container,
  Image,
  Network,
  HardDrive,
  Activity,
  ChevronDown,
  Box,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";

const agentNavItems = (agentId: string) => [
  { title: "Dashboard", href: `/agents/${agentId}`, icon: LayoutDashboard },
  { title: "Containers", href: `/agents/${agentId}/containers`, icon: Container },
  { title: "Images", href: `/agents/${agentId}/images`, icon: Image },
  { title: "Networks", href: `/agents/${agentId}/networks`, icon: Network },
  { title: "Volumes", href: `/agents/${agentId}/volumes`, icon: HardDrive },
  { title: "Events", href: `/agents/${agentId}/events`, icon: Activity },
];

export function AppSidebar() {
  const user = useAuthUser();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const { agents, fetchAgents } = useAgentStore();
  const [openAgents, setOpenAgents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) {
      fetchAgents();
    }
  }, [fetchAgents, isAdmin]);

  useEffect(() => {
    const active: Record<string, boolean> = {};
    for (const agent of agents) {
      if (location.pathname.startsWith(`/agents/${agent.id}`)) {
        active[agent.id] = true;
      }
    }
    queueMicrotask(() => {
      setOpenAgents((prev) => ({ ...prev, ...active }));
    });
  }, [agents, location.pathname]);

  const isActive = (href: string) => {
    if (href === "/admin") return location.pathname === "/admin";
    if (href === "/") return location.pathname === "/";
    return location.pathname === href;
  };

  const toggleAgent = (id: string) => {
    setOpenAgents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between">
              <SidebarMenuButton size="lg" asChild>
                <Link to={isAdmin ? "/admin" : "/"}>
                  <img src="/favicon.svg" alt="Dokuru Logo" className="aspect-square size-8" />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Dokuru</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isAdmin ? "Admin Dashboard" : "Docker Security"}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
              <SidebarTrigger className="ml-1 h-8 w-8 hidden md:flex">
                <PanelLeft className="h-4 w-4" />
              </SidebarTrigger>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Platform */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <div className="px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(isAdmin ? "/admin" : "/")}
                  tooltip="Overview"
                  className="text-base"
                >
                  <Link to={isAdmin ? "/admin" : "/"}>
                    <LayoutDashboard className="size-4" />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarGroup>

        {/* Admin */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <div className="px-2">
              <SidebarMenu>
                {[
                  { title: "Users", href: "/admin/users", icon: Users },
                  { title: "API Keys", href: "/admin/api-keys", icon: Key },
                ].map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="text-base"
                    >
                      <Link to={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          </SidebarGroup>
        )}

        {/* Agents — card per agent */}
        {!isAdmin && agents.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <div className="px-2 space-y-1.5">
              {agents.map((agent) => (
                <Collapsible
                  key={agent.id}
                  open={openAgents[agent.id] ?? false}
                  onOpenChange={() => toggleAgent(agent.id)}
                >
                  {/* Card wrapper */}
                  <div
                    className={`rounded-lg border transition-colors overflow-hidden ${
                      location.pathname.startsWith(`/agents/${agent.id}`)
                        ? "border-sidebar-primary/30 bg-sidebar-accent/50"
                        : "border-sidebar-border bg-sidebar-accent/20 hover:bg-sidebar-accent/35"
                    }`}
                  >
                    {/* Agent header / trigger */}
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-3 text-left"
                      >
                        <Box className="size-5 shrink-0 text-blue-400" />
                        <span className="flex-1 truncate text-[13px] font-semibold text-sidebar-foreground">
                          {agent.name}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            agent.status === "online" ? "bg-green-500" : "bg-gray-500"
                          }`}
                        />
                        <ChevronDown
                          className={`size-4 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 ${
                            openAgents[agent.id] ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </CollapsibleTrigger>

                    {/* Sub-nav inside card */}
                    <CollapsibleContent>
                      <div className="border-t border-sidebar-border/60 pb-1.5 pt-1">
                        {agentNavItems(agent.id).map((item) => {
                          const active = isActive(item.href);
                          return (
                            <Link
                              key={item.href}
                              to={item.href}
                              className={`flex items-center gap-3 px-3 py-2 mx-1.5 rounded-md text-sm transition-colors ${
                                active
                                  ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                              }`}
                            >
                              <item.icon className="size-4 shrink-0" />
                              <span>{item.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </SidebarGroup>
        )}

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <div className="px-2">
            <SidebarMenu>
              {[
                { title: "Profile", href: "/settings/profile", icon: User },
                { title: "Security", href: "/settings/security", icon: Shield },
                { title: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
              ].map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title} className="text-base">
                    <Link to={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
