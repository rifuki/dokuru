import { useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useAuthUser } from "@/stores/use-auth-store";

const settingsNavigation = [
    { name: "My Account", href: "/settings/profile" },
    { name: "Security", href: "/settings/security" },
    { name: "Devices", href: "/settings/sessions" },
];

const ESCAPE_BLOCKING_SELECTOR = [
    '[data-settings-escape-layer="true"]',
    '[data-slot="dialog-content"]',
    '[data-slot="alert-dialog-content"]',
    '[role="dialog"][aria-modal="true"]',
    '[role="alertdialog"][aria-modal="true"]',
].join(',');

function hasOpenEscapeBlockingLayer(event: KeyboardEvent) {
    if (event.defaultPrevented) return true;

    const eventPathHasLayer = event.composedPath().some((target) => {
        if (!(target instanceof Element)) return false;
        return target.matches(ESCAPE_BLOCKING_SELECTOR) || !!target.closest(ESCAPE_BLOCKING_SELECTOR);
    });

    return eventPathHasLayer || !!document.querySelector(ESCAPE_BLOCKING_SELECTOR);
}

export function SettingsLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const user = useAuthUser();

    // Handle ESC key to exit settings
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (hasOpenEscapeBlockingLayer(e)) return;
                navigate({ to: user?.role === 'admin' ? '/admin' : '/' });
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [navigate, user?.role]);

    return (
        <div className="fixed inset-0 z-50 flex w-full flex-col overflow-hidden bg-background sm:flex-row">
            {/* Sidebar Area */}
            <aside className="flex w-full shrink-0 justify-start border-b border-border/50 bg-muted/30 px-4 py-3 sm:w-[230px] sm:justify-end sm:border-b-0 sm:border-r sm:px-0 sm:pb-10 sm:pt-0 md:w-[280px] lg:w-[30%] lg:min-w-[280px] lg:max-w-[340px]">
                <nav className="flex w-full flex-col gap-2 sm:max-w-[240px] sm:gap-0.5 sm:px-2 sm:pt-16 md:px-4">
                    <div className="flex items-center justify-between gap-3 px-1 sm:block sm:px-3 sm:pb-2">
                        <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                            User Settings
                        </div>
                        <button
                            type="button"
                            aria-label="Close settings"
                            onClick={() => navigate({ to: user?.role === 'admin' ? '/admin' : '/' })}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-0.5 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0">
                        {settingsNavigation.map((item) => {
                            const isActive = location.pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={`
                                            flex shrink-0 items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition-colors sm:py-1.5 sm:text-[15px]
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
                    </div>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="relative min-h-0 flex-1 overflow-y-auto">
                <div className="w-full max-w-none px-5 py-6 sm:max-w-[740px] sm:px-10 sm:py-16 md:px-14">
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
