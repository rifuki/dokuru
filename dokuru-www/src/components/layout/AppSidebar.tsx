import { Link, useLocation, useNavigate } from "@tanstack/react-router";
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
  BotOff,
  Container,
  Network,
  HardDrive,
  Activity,
  ChevronDown,
  Server,
  ShieldCheck,
  Layers,
  Home,
  Box,
  Settings,
  FileText,
  Terminal,
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
import { useAuditStore, type AuditStreamState } from "@/stores/use-audit-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useRealtimeAgents } from "@/hooks/useRealtimeAgents";
import { useAgentConnections } from "@/hooks/useAgentConnections";
import { HOST_SHELL_ENABLED } from "@/lib/host-shell";
import { IS_LOCAL_AGENT_MODE } from "@/lib/env";

function auditSidebarStatus(stream?: AuditStreamState) {
  if (!stream) return null;

  if (stream.status === "running") {
    const pct = stream.total > 0 ? Math.min(99, Math.round((stream.current / stream.total) * 100)) : 0;
    return {
      label: stream.total > 0 ? `${pct}%` : "Live",
      title: stream.total > 0 ? `Audit running (${stream.current}/${stream.total})` : "Audit running",
      className: "border-[#2496ED]/30 bg-[#2496ED]/10 text-[#2496ED]",
    };
  }

  if (stream.status === "saving") {
    return {
      label: "Saving",
      title: "Audit complete, saving result",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    };
  }

  if (stream.status === "complete") {
    return {
      label: "Done",
      title: stream.savedAudit ? `Audit complete - ${stream.savedAudit.summary.score}/100` : "Audit complete",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    };
  }

  if (stream.status === "error") {
    return {
      label: "Error",
      title: stream.error ?? "Audit failed",
      className: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    };
  }

  return null;
}

const agentNavItems = (agentId: string) => {
  const items = [
    { title: "Dashboard",  href: `/agents/${agentId}`,            icon: LayoutDashboard, requiresOnline: false, devOnly: false },
    { title: "Audit",      href: `/agents/${agentId}/audit`,      icon: ShieldCheck,     requiresOnline: false, devOnly: false },
    { title: "Containers", href: `/agents/${agentId}/containers`, icon: Container,       requiresOnline: true,  devOnly: false },
    { title: "Stacks",     href: `/agents/${agentId}/stacks`,     icon: Layers,          requiresOnline: true,  devOnly: false },
    { title: "Images",     href: `/agents/${agentId}/images`,     icon: Box,             requiresOnline: true,  devOnly: false },
    { title: "Networks",   href: `/agents/${agentId}/networks`,   icon: Network,         requiresOnline: true,  devOnly: false },
    { title: "Volumes",    href: `/agents/${agentId}/volumes`,    icon: HardDrive,       requiresOnline: true,  devOnly: false },
    { title: "Events",     href: `/agents/${agentId}/events`,     icon: Activity,        requiresOnline: true,  devOnly: false },
    { title: "VPS Shell",  href: `/agents/${agentId}/shell`,      icon: Terminal,        requiresOnline: true,  devOnly: true },
  ];

  return HOST_SHELL_ENABLED ? items : items.filter((item) => !item.devOnly);
};

function rememberableAgentDetail(pathname: string) {
  const auditMatch = pathname.match(/^\/agents\/([^/]+)\/audits\/[^/]+$/);
  if (auditMatch) {
    return {
      defaultHref: `/agents/${auditMatch[1]}/audit`,
      detailHref: pathname,
    };
  }

  const detailMatch = pathname.match(/^\/agents\/([^/]+)\/(containers|images|networks|volumes)\/[^/]+$/);
  if (!detailMatch) return null;

  return {
    defaultHref: `/agents/${detailMatch[1]}/${detailMatch[2]}`,
    detailHref: pathname,
  };
}

export function AppSidebar() {
  const user = useAuthUser();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const navigate = useNavigate();
  const { agents, fetchAgents, agentOnlineStatus, agentConnectingStatus, setAgentOnline } = useAgentStore();
  const auditStreams = useAuditStore((state) => state.auditStreams);
  const viewedAuditResults = useAuditStore((state) => state.viewedAuditResults);
  const { state: sidebarState } = useSidebar();
  const isIconMode = sidebarState === "collapsed";
  const [openAgents, setOpenAgents] = useState<Record<string, boolean>>({});
  const [lastDetailHrefByDefaultHref, setLastDetailHrefByDefaultHref] = useState<Record<string, string>>({});

  // Backend WS: relay agents + server-level events (agent:connected / agent:disconnected)
  useRealtimeAgents();

  // Per-agent WS connections: one connection per non-relay agent for real-time
  // online/offline detection. Marks agent offline the instant the WS closes,
  // then reconnects with exponential backoff (2s → 4s → … → 30s).
  useAgentConnections(isAdmin ? [] : agents);

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
    const detail = rememberableAgentDetail(location.pathname);
    if (!detail) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLastDetailHrefByDefaultHref((prev) => {
        if (prev[detail.defaultHref] === detail.detailHref) return prev;
        return { ...prev, [detail.defaultHref]: detail.detailHref };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  // Seed relay agents as offline on load (their status comes from backend WS events only).
  useEffect(() => {
    if (isAdmin || agents.length === 0) return;
    for (const agent of agents) {
      if (agent.access_mode === "relay") {
        setAgentOnline(agent.id, false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.map(a => a.id).join(","), isAdmin]);

  const isActive = (href: string) => {
    if (href === "/admin") return location.pathname === "/admin";
    if (href === "/") return location.pathname === "/";
    if (href === "/agents") return location.pathname === "/agents";
    if (/^\/agents\/[^/]+$/.test(href)) return location.pathname === href;
    const auditMatch = href.match(/^\/agents\/([^/]+)\/audit$/);
    if (auditMatch) {
      const auditHistoryHref = `/agents/${auditMatch[1]}/audits`;
      return (
        location.pathname === href ||
        location.pathname.startsWith(`${href}/`) ||
        location.pathname === auditHistoryHref ||
        location.pathname.startsWith(`${auditHistoryHref}/`)
      );
    }
    if (href.startsWith("/agents/")) {
      return location.pathname === href || location.pathname.startsWith(`${href}/`);
    }
    return location.pathname === href;
  };

  const toggleAgent = (id: string) => {
    setOpenAgents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getAgentNavTarget = (href: string, active: boolean) => {
    if (active && location.pathname !== href) return href;
    return lastDetailHrefByDefaultHref[href] ?? href;
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
                      {isAdmin ? "Admin Dashboard" : "Docker Security Audit"}
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
        {/* Home */}
        <SidebarGroup>
          <SidebarGroupLabel>Home</SidebarGroupLabel>
          <div className={isIconMode ? "" : "px-2"}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(isAdmin ? "/admin" : "/agents")}
                  tooltip={isAdmin ? "Overview" : "Agents"}
                  className="text-sm! py-2! rounded-[10px]! data-[active=true]:bg-miku-primary/15 data-[active=true]:text-miku-primary data-[active=true]:font-medium"
                >
                  <Link to={isAdmin ? "/admin" : "/agents"}>
                    {isAdmin ? <Home className="size-4" /> : <Server className="size-4" />}
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
                  { title: "Agents", href: "/admin/agents", icon: Server },
                  { title: "Audits", href: "/admin/audits", icon: ShieldCheck },
                  { title: "Documents", href: "/admin/documents", icon: FileText },
                  { title: "API Keys", href: "/admin/api-keys", icon: Key },
                  { title: "Settings", href: "/admin/settings", icon: Settings },
                ].map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="text-sm! py-2! rounded-[10px]! data-[active=true]:bg-miku-primary/15 data-[active=true]:text-miku-primary data-[active=true]:font-medium"
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
              <div
                aria-disabled="true"
                className="flex cursor-default select-none items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/20 px-3 py-2 text-sm text-sidebar-foreground/60"
              >
                <BotOff className="size-4 text-muted-foreground" />
                <span>No agent connected</span>
              </div>
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
                const isConnecting = !!agentConnectingStatus[agent.id];
                const isOnline = agentOnlineStatus[agent.id] === true;
                const isOffline = !isConnecting && agentOnlineStatus[agent.id] === false;
                const AgentIcon = isOnline || isConnecting ? Bot : BotOff;
                const iconColor = isConnecting
                  ? "animate-pulse text-muted-foreground/45"
                  : isOnline
                  ? "text-primary"
                  : isOffline
                  ? "text-red-500"
                  : "text-muted-foreground";
                return (
                  <Collapsible
                    key={agent.id}
                    open={!!openAgents[agent.id]}
                    onOpenChange={() => toggleAgent(agent.id)}
                  >
                    <div>
                      {/* Card wrapper with border and background */}
                      <div
                        className={
                          isIconMode
                            ? ""
                            : `rounded-[12px] border overflow-hidden transition-colors ${
                                isAgentActive
                                  ? "border-miku-primary/40"
                                  : "border-sidebar-border"
                              }`
                        }
                      >
                        <CollapsibleTrigger asChild>
                          {isIconMode ? (
                            <SidebarMenuButton tooltip={agent.name} isActive={isAgentActive}>
                              <AgentIcon className={`size-5 ${iconColor}`} />
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
                              <AgentIcon className={`size-5 shrink-0 ${iconColor}`} />
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
                            <div className="border-t border-sidebar-border/60 overflow-hidden">
                              {agentNavItems(agent.id).map((item) => {
                                const auditStream = item.title === "Audit" ? auditStreams[agent.id] : undefined;
                                const isCurrentAuditPage = item.title === "Audit" && (
                                  location.pathname === `/agents/${agent.id}/audit` ||
                                  location.pathname.startsWith(`/agents/${agent.id}/audits`)
                                );
                                const completedAuditId = auditStream?.status === "complete" ? auditStream.savedAudit?.id : undefined;
                                const completedAuditViewed = !!completedAuditId && viewedAuditResults[agent.id] === completedAuditId;
                                const auditStatus = isCurrentAuditPage || completedAuditViewed ? null : auditSidebarStatus(auditStream);
                                const active = isActive(item.href);
                                const disabled = item.requiresOnline && !isOnline;
                                const targetHref = getAgentNavTarget(item.href, active);
                                return disabled ? (
                                  <span
                                    key={item.href}
                                    title="Agent offline"
                                     className="flex cursor-not-allowed select-none items-center gap-3 border-l-4 border-transparent px-3 py-2 text-sm text-sidebar-foreground/30"
                                  >
                                    <item.icon className="size-4 shrink-0" />
                                    <span>{item.title}</span>
                                  </span>
                                ) : (
                                  <Link
                                     key={item.href}
                                      to={targetHref}
                                     title={auditStatus?.title}
                                     onClick={(event) => {
                                       if (event.detail < 2 || targetHref === item.href) return;
                                       event.preventDefault();
                                       void navigate({ to: item.href });
                                     }}
                                      className={`flex items-center gap-3 border-l-4 px-3 py-2 text-sm transition-colors ${
                                        active
                                          ? "border-miku-primary bg-miku-primary/18 font-medium text-miku-primary"
                                          : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                                      }`}
                                    >
                                      <item.icon className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                    {auditStatus && (
                                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${auditStatus.className}`}>
                                        {auditStatus.label}
                                      </span>
                                    )}
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
        {!IS_LOCAL_AGENT_MODE && <SidebarGroup>
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
                    className="text-sm! py-2! rounded-[10px]!"
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
        </SidebarGroup>}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
