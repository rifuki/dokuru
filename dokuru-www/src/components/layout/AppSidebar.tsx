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
  Bot,
  Container,
  Network,
  HardDrive,
  Activity,
  ChevronDown,
  Box,
  ShieldCheck,
  Layers,
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { agentDirectApi } from "@/lib/api/agent-direct";

const agentNavItems = (agentId: string) => [
  { title: "Dashboard",  href: `/agents/${agentId}`,            icon: LayoutDashboard, requiresOnline: false },
  { title: "Audit",      href: `/agents/${agentId}/audit`,      icon: ShieldCheck,     requiresOnline: false },
  { title: "Containers", href: `/agents/${agentId}/containers`, icon: Container,       requiresOnline: true },
  { title: "Stacks",     href: `/agents/${agentId}/stacks`,     icon: Layers,          requiresOnline: true },
  { title: "Images",     href: `/agents/${agentId}/images`,     icon: Box,             requiresOnline: true },
  { title: "Networks",   href: `/agents/${agentId}/networks`,   icon: Network,         requiresOnline: true },
  { title: "Volumes",    href: `/agents/${agentId}/volumes`,    icon: HardDrive,       requiresOnline: true },
  { title: "Events",     href: `/agents/${agentId}/events`,     icon: Activity,        requiresOnline: true },
];

export function AppSidebar() {
  const user = useAuthUser();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const { agents, fetchAgents, agentOnlineStatus, setAgentOnline } = useAgentStore();
  const { state: sidebarState } = useSidebar();
  const isIconMode = sidebarState === "collapsed";
  const [openAgents, setOpenAgents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) fetchAgents();
  }, [fetchAgents, isAdmin]);

  useEffect(() => {
    const active: Record<string, boolean> = {};
    for (const agent of agents) {
      if (location.pathname.startsWith(`/agents/${agent.id}`)) {
        active[agent.id] = true;
      }
    }
    if (Object.keys(active).length > 0) {
      queueMicrotask(() => {
        setOpenAgents((prev) => {
          const hasChanges = Object.keys(active).some(id => !prev[id]);
          return hasChanges ? { ...prev, ...active } : prev;
        });
      });
    }
  }, [agents, location.pathname]);

  useEffect(() => {
    if (isAdmin || agents.length === 0) return;
    for (const agent of agents) {
      agentDirectApi.checkHealth(agent.url)
        .then((ok) => setAgentOnline(agent.id, ok))
        .catch(() => setAgentOnline(agent.id, false));
    }
  }, [agents, isAdmin, setAgentOnline]);

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
          <div className={isIconMode ? "" : "px-2"}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(isAdmin ? "/admin" : "/agents")}
                  tooltip={isAdmin ? "Overview" : "Agents"}
                  className="text-sm! py-2! data-[active=true]:bg-miku-primary/15 data-[active=true]:text-miku-primary data-[active=true]:font-medium"
                >
                  <Link to={isAdmin ? "/admin" : "/agents"}>
                    {isAdmin ? <LayoutDashboard className="size-4" /> : <Bot className="size-4" />}
                    <span>{isAdmin ? "Overview" : "Agents"}</span>
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
            <div className={isIconMode ? "" : "px-2"}>
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
            </div>
          </SidebarGroup>
        )}

        {/* Agents — empty state */}
        {!isAdmin && agents.length === 0 && !isIconMode && (
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <div className="px-2">
              <Link
                to="/"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-accent/20 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/35 transition-colors"
              >
                <span className="font-medium text-sidebar-foreground/80">Agent:</span>
                <span className="text-sidebar-foreground/40">/</span>
                <span>None selected</span>
              </Link>
            </div>
          </SidebarGroup>
        )}

        {/* Agents — card per agent */}
        {!isAdmin && agents.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Agents</SidebarGroupLabel>
            <div className={isIconMode ? "flex flex-col gap-1.5" : "px-2 flex flex-col gap-1.5"}>
              {agents.map((agent) => {
                const isAgentActive = location.pathname.startsWith(`/agents/${agent.id}`);
                const isOnline = !!agentOnlineStatus[agent.id];
                return (
                  <Collapsible
                    key={agent.id}
                    open={!!openAgents[agent.id]}
                    onOpenChange={() => toggleAgent(agent.id)}
                  >
                    <div>
                      {/* Card wrapper — only shown when sidebar is expanded */}
                      <div
                        className={
                          isIconMode
                            ? ""
                            : `rounded-lg border overflow-hidden transition-colors ${
                                isAgentActive
                                  ? "border-sidebar-primary/40"
                                  : "border-sidebar-border"
                              }`
                        }
                      >
                        <CollapsibleTrigger asChild>
                          {isIconMode ? (
                            <SidebarMenuButton tooltip={agent.name} isActive={isAgentActive}>
                              <Box className="size-5 text-miku-primary" />
                            </SidebarMenuButton>
                          ) : (
                            <button
                              type="button"
                              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-none transition-colors ${
                                isAgentActive
                                  ? "text-miku-primary"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent/40"
                              }`}
                            >
                              <Box className="size-5 shrink-0 text-miku-primary" />
                              <span className="flex-1 truncate text-left">{agent.name}</span>
                              <ChevronDown
                                className={`size-5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 ${
                                  openAgents[agent.id] ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          )}
                        </CollapsibleTrigger>

                        {!isIconMode && (
                          <CollapsibleContent>
                            <div className="border-t border-sidebar-border/60 pb-1.5 pt-1">
                              {agentNavItems(agent.id).map((item) => {
                                const active = isActive(item.href);
                                const disabled = item.requiresOnline && !isOnline;
                                return disabled ? (
                                  <span
                                    key={item.href}
                                    title="Agent offline"
                                    className="flex items-center gap-3 py-2 text-sm px-3 mx-1.5 rounded-md text-sidebar-foreground/30 cursor-not-allowed select-none"
                                  >
                                    <item.icon className="size-4 shrink-0" />
                                    <span>{item.title}</span>
                                  </span>
                                ) : (
                                  <Link
                                    key={item.href}
                                    to={item.href}
                                    className={`flex items-center gap-3 py-1.5 text-sm transition-colors ${
                                      active
                                        ? "px-3 mx-0 rounded-none border-l-[3px] border-miku-primary bg-miku-primary/20 text-miku-primary font-medium"
                                        : "px-3 mx-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                                    }`}
                                  >
                                    <item.icon className="size-4 shrink-0" />
                                    <span>{item.title}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        )}
                      </div>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </SidebarGroup>
        )}

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <div className={isIconMode ? "" : "px-2"}>
            <SidebarMenu>
              {[
                { title: "Profile", href: "/settings/profile", icon: User },
                { title: "Security", href: "/settings/security", icon: Shield },
                { title: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
              ].map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    className="text-sm! py-2!"
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
