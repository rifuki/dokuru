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
  ChevronRight,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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

  // Auto-open the agent whose sub-route is currently active
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
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive(isAdmin ? "/admin" : "/")}
                tooltip="Overview"
              >
                <Link to={isAdmin ? "/admin" : "/"}>
                  <LayoutDashboard className="size-4" />
                  <span>Overview</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
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
                  >
                    <Link to={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {!isAdmin && agents.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Environments</SidebarGroupLabel>
            <SidebarMenu>
              {agents.map((agent) => (
                <Collapsible
                  key={agent.id}
                  open={openAgents[agent.id] ?? false}
                  onOpenChange={() => toggleAgent(agent.id)}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={agent.name}
                        isActive={location.pathname.startsWith(`/agents/${agent.id}`)}
                        className="group/agent"
                      >
                        <Box className="size-4 shrink-0 text-blue-400" />
                        <span className="truncate">{agent.name}</span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              agent.status === "online"
                                ? "bg-green-500"
                                : "bg-gray-400"
                            }`}
                          />
                          <ChevronRight
                            className={`size-3 shrink-0 transition-transform duration-200 ${
                              openAgents[agent.id] ? "rotate-90" : ""
                            }`}
                          />
                        </div>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {agentNavItems(agent.id).map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                              <Link to={item.href}>
                                <item.icon className="size-3.5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarMenu>
            {[
              { title: "Profile", href: "/settings/profile", icon: User },
              { title: "Security", href: "/settings/security", icon: Shield },
              { title: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
            ].map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                  <Link to={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
