import { Outlet } from "@tanstack/react-router";

export function SettingsLayout() {
    return (
        <div className="max-w-4xl mx-auto w-full space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your account settings and preferences
                </p>
            </div>

            {/* Content */}
            <Outlet />
        </div>
    );
}
