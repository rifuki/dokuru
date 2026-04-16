import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Search,
  Moon,
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
  const isAdmin = user?.role === "admin";

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
