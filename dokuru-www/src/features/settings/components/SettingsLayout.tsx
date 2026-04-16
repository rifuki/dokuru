import { Outlet, Link, useLocation } from "@tanstack/react-router";
import { User, Shield, MonitorSmartphone } from "lucide-react";

const settingsNavigation = [
    { name: "Profile", href: "/settings/profile", icon: User, description: "Manage your account" },
    { name: "Security", href: "/settings/security", icon: Shield, description: "Password & authentication" },
    { name: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone, description: "Active devices" },
];

export function SettingsLayout() {
    const location = useLocation();

    return (
        <div className="max-w-7xl mx-auto w-full">
            <div className="space-y-6">
                {/* Header */}
                <div className="border-b pb-6">
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your account settings and preferences
                    </p>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar Navigation */}
                    <aside className="lg:col-span-1">
                        <nav className="space-y-1 sticky top-6">
                            {settingsNavigation.map((item) => {
                                const isActive = location.pathname === item.href;
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        className={`
                                            flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all
                                            ${isActive
                                                ? "bg-miku-primary/10 text-miku-primary border border-miku-primary/20"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                            }
                                        `}
                                    >
                                        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isActive ? "text-miku-primary" : ""}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium ${isActive ? "text-miku-primary" : ""}`}>
                                                {item.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {item.description}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>
                    </aside>

                    {/* Main Content */}
                    <main className="lg:col-span-3">
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    );
}
