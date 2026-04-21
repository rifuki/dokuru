import { useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useAuthUser } from "@/stores/use-auth-store";

const settingsNavigation = [
    { name: "My Account", href: "/settings/profile" },
    { name: "Security", href: "/settings/security" },
    { name: "Devices", href: "/settings/sessions" },
];

export function SettingsLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const user = useAuthUser();

    // Handle ESC key to exit settings
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                navigate({ to: user?.role === 'admin' ? '/admin' : '/' });
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [navigate, user?.role]);

    return (
        <div className="fixed inset-0 z-50 flex w-full bg-background overflow-hidden">
            {/* Sidebar Area */}
            <aside className="flex w-[230px] md:w-[280px] lg:w-[30%] lg:min-w-[280px] lg:max-w-[340px] justify-end bg-muted/30 pb-10 border-r border-border/50">
                <nav className="w-full max-w-[240px] px-2 md:px-4 pt-16 flex flex-col gap-0.5">
                    <div className="px-3 pb-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                        User Settings
                    </div>
                    {settingsNavigation.map((item) => {
                        const isActive = location.pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={`
                                        flex items-center gap-3 rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors
                                        ${isActive
                                        ? "bg-primary/15 text-primary"
                                        : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                                    }
                                    `}
                            >
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative pb-20">
                <div className="px-10 md:px-14 pt-16 max-w-[740px]">
                    <Outlet />
                </div>

                {/* Close Button */}
                <div className="fixed top-14 right-8 lg:right-16 hidden sm:block z-50">
                    <button
                        type="button"
                        aria-label="Close settings"
                        onClick={() => navigate({ to: user?.role === 'admin' ? '/admin' : '/' })}
                        className="group flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-muted-foreground/40 group-hover:bg-muted/50 transition-colors">
                            <X className="h-4 w-4" />
                        </div>
                        <span className="text-[12px] font-bold">ESC</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
