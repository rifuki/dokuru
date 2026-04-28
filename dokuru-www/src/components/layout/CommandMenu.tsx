import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  Container,
  HardDrive,
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  LogOut,
  Network,
  Search,
  ShieldCheck,
  Terminal,
  Moon,
  ScrollText,
  Server,
  Sun,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/use-theme";
import { useAuthUser } from "@/stores/use-auth-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useLogout } from "@/features/auth/hooks/use-logout";

interface CommandMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function CommandMenu({ open, setOpen }: CommandMenuProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const user = useAuthUser();
  const logout = useLogout();
  const { agents, fetchAgents } = useAgentStore();
  const isAdmin = user?.role === "admin";

  const agentFeatures = [
    {
      label: "Dashboard",
      description: "Overview, resource usage, and health",
      keywords: "overview stats dashboard",
      icon: LayoutDashboard,
      run: (id: string) => navigate({ to: "/agents/$id", params: { id } }),
    },
    {
      label: "Containers",
      description: "Container inventory and details",
      keywords: "docker containers inventory",
      icon: Container,
      run: (id: string) => navigate({ to: "/agents/$id/containers", params: { id } }),
    },
    {
      label: "Images",
      description: "Docker image inventory",
      keywords: "docker images registry",
      icon: ImageIcon,
      run: (id: string) => navigate({ to: "/agents/$id/images", params: { id } }),
    },
    {
      label: "Volumes",
      description: "Docker volumes",
      keywords: "storage volumes",
      icon: HardDrive,
      run: (id: string) => navigate({ to: "/agents/$id/volumes", params: { id } }),
    },
    {
      label: "Networks",
      description: "Docker networks",
      keywords: "network bridge overlay",
      icon: Network,
      run: (id: string) => navigate({ to: "/agents/$id/networks", params: { id } }),
    },
    {
      label: "Stacks",
      description: "Compose stack overview",
      keywords: "compose stacks services",
      icon: Boxes,
      run: (id: string) => navigate({ to: "/agents/$id/stacks", params: { id } }),
    },
    {
      label: "Events",
      description: "Docker event stream",
      keywords: "events activity logs",
      icon: Activity,
      run: (id: string) => navigate({ to: "/agents/$id/events", params: { id } }),
    },
    {
      label: "Run Audit",
      description: "Start a new security audit",
      keywords: "security audit scan",
      icon: ShieldCheck,
      run: (id: string) => navigate({ to: "/agents/$id/audit", params: { id } }),
    },
    {
      label: "Audit History",
      description: "Saved audit results",
      keywords: "audits history findings",
      icon: ScrollText,
      run: (id: string) => navigate({ to: "/agents/$id/audits", params: { id } }),
    },
    {
      label: "Shell",
      description: "Open remote shell",
      keywords: "terminal shell exec",
      icon: Terminal,
      run: (id: string) => navigate({ to: "/agents/$id/shell", params: { id } }),
    },
  ];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && !isAdmin && agents.length === 0) {
      void fetchAgents();
    }
  }, [agents.length, fetchAgents, isAdmin, open]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => navigate({ to: "/" }))}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            App Home
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          {!isAdmin && (
            <CommandItem
              onSelect={() => runCommand(() => navigate({ to: "/agents" }))}
            >
              <Server className="mr-2 h-4 w-4" />
              Agents
            </CommandItem>
          )}
          <CommandItem
            onSelect={() =>
              runCommand(() => navigate({ to: "/settings/profile" }))
            }
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          {isAdmin && (
            <CommandItem
              onSelect={() =>
                runCommand(() => navigate({ to: "/admin" }))
              }
            >
              <Settings className="mr-2 h-4 w-4" />
              Admin Panel
              <CommandShortcut>⌘A</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        {!isAdmin && agents.length > 0 && (
          <>
            <CommandSeparator />

            <CommandGroup heading="Agents">
              {agents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  value={`${agent.name} agent dashboard overview ${agent.access_mode}`}
                  onSelect={() => runCommand(() => navigate({ to: "/agents/$id", params: { id: agent.id } }))}
                >
                  <Server className="mr-2 h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  <CommandShortcut>{agent.access_mode}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Agent Features">
              {agents.flatMap((agent) =>
                agentFeatures.map((feature) => {
                  const Icon = feature.icon;

                  return (
                    <CommandItem
                      key={`${agent.id}-${feature.label}`}
                      value={`${agent.name} ${feature.label} ${feature.description} ${feature.keywords}`}
                      onSelect={() => runCommand(() => feature.run(agent.id))}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">
                        {feature.label} · {agent.name}
                      </span>
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() =>
              runCommand(() => setTheme(theme === "dark" ? "light" : "dark"))
            }
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle Theme
            <CommandShortcut>⌘T</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Session">
          <CommandItem
            onSelect={() => runCommand(() => logout.mutate())}
            className="text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
            <CommandShortcut>⌘Q</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandMenuTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search...</span>
      <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
