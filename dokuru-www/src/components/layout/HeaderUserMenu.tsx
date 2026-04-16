import { useAuthUser } from "@/stores/use-auth-store";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useTheme } from "next-themes";
import { useNavigate } from "@tanstack/react-router";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAvatarUrl } from "@/lib/utils";
import {
    Settings,
    Monitor,
    Moon,
    Sun,
    Palette,
    LogOut
} from "lucide-react";

export function HeaderUserMenu() {
    const user = useAuthUser();
    const logout = useLogout();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full ml-1 hover:bg-primary/10">
                    <Avatar className="h-8 w-8 object-cover">
                        <AvatarImage src={getAvatarUrl(user?.avatar_url)} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {user?.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => navigate({ to: "/settings/profile" })} className="focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>User Settings</span>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <Palette className="mr-2 h-4 w-4" />
                            <span>Theme</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={() => setTheme("light")} className="focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary">
                                    <Sun className="mr-2 h-4 w-4" />
                                    <span>Light</span>
                                    {theme === "light" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("dark")} className="focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary">
                                    <Moon className="mr-2 h-4 w-4" />
                                    <span>Dark</span>
                                    {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme("system")} className="focus:bg-primary/10 dark:focus:bg-primary/20 focus:text-primary">
                                    <Monitor className="mr-2 h-4 w-4" />
                                    <span>System</span>
                                    {theme === "system" && <span className="ml-auto text-xs">✓</span>}
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
