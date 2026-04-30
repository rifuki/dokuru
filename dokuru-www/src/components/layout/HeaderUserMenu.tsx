import { useAuthUser } from "@/stores/use-auth-store";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useTheme } from "next-themes";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const displayName = user?.name || user?.email?.split("@")[0] || "User";
    const email = user?.email || "No email set";
    const menuItemClass = "h-11 cursor-pointer rounded-none px-5 text-sm font-medium focus:bg-primary/15 focus:text-primary dark:focus:bg-primary/20 [&_svg]:text-muted-foreground focus:[&_svg]:text-primary";

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full ml-1 hover:bg-primary/10">
                        <Avatar className="h-8 w-8 object-cover">
                            <AvatarImage src={getAvatarUrl(user?.avatar_url)} className="object-cover" />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {displayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 overflow-hidden rounded-[14px] p-0 shadow-xl" sideOffset={8}>
                    <DropdownMenuLabel className="px-5 py-4 font-normal">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar className="h-9 w-9 shrink-0 object-cover">
                                <AvatarImage src={getAvatarUrl(user?.avatar_url)} className="object-cover" />
                                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                                    {displayName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 pr-1">
                                <p className="truncate text-sm font-semibold leading-5 text-foreground" title={displayName}>{displayName}</p>
                                <p className="truncate text-xs leading-5 text-muted-foreground" title={email}>{email}</p>
                            </div>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="mx-0 my-0" />
                    <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => navigate({ to: "/settings/profile" })} className={menuItemClass}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>User Settings</span>
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator className="mx-0 my-0" />
                    <DropdownMenuGroup>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className={menuItemClass}>
                                <Palette className="mr-2 h-4 w-4" />
                                <span>Theme</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent className="w-40 overflow-hidden rounded-[12px] p-0">
                                    <DropdownMenuItem onClick={() => setTheme("light")} className={menuItemClass}>
                                        <Sun className="mr-2 h-4 w-4" />
                                        <span>Light</span>
                                        {theme === "light" && <span className="ml-auto text-xs">✓</span>}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("dark")} className={menuItemClass}>
                                        <Moon className="mr-2 h-4 w-4" />
                                        <span>Dark</span>
                                        {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("system")} className={menuItemClass}>
                                        <Monitor className="mr-2 h-4 w-4" />
                                        <span>System</span>
                                        {theme === "system" && <span className="ml-auto text-xs">✓</span>}
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator className="mx-0 my-0" />
                    <DropdownMenuItem onSelect={() => setLogoutDialogOpen(true)} className="h-11 cursor-pointer rounded-none px-5 text-sm font-medium text-destructive focus:bg-destructive/10 focus:text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
                <AlertDialogContent size="sm" className="rounded-[16px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Log out?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You will need to sign in again to access Dokuru.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={logout.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={logout.isPending}
                            onClick={() => logout.mutate()}
                        >
                            {logout.isPending ? "Logging out..." : "Log out"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
