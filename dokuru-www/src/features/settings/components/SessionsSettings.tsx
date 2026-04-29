import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface Session {
    id: string;
    device: string;
    device_type?: string | null;
    location: string;
    ip: string;
    created_at: string;
    last_active_at?: string;
    is_current: boolean;
}

const formatDateTime = (value?: string) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const sessionDetails = (session: Session, includeCreatedAt = false) => {
    const ip = session.ip && session.ip !== "0.0.0.0" ? session.ip : "Unknown IP";
    const details = [session.location || "Unknown Location", ip].filter(Boolean);
    if (includeCreatedAt) details.push(formatDateTime(session.created_at) || "Unknown time");

    return details.join(" • ");
};

const isTabletSession = (session: Session) =>
    session.device_type === "tablet" || session.device.toLowerCase().includes("ipad");

const isMobileSession = (session: Session) =>
    session.device_type === "mobile" ||
    session.device.toLowerCase().includes("iphone") ||
    session.device.toLowerCase().includes("android");

export function SessionsSettings() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const fetchSessions = async () => {
            setLoadingSessions(true);
            try {
                const response = await apiClient.get('/auth/sessions');
                if (!cancelled) {
                    setSessions(response.data?.data || []);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to fetch sessions", error);
                    toast.error("Failed to load sessions");
                }
            } finally {
                if (!cancelled) {
                    setLoadingSessions(false);
                }
            }
        };
        fetchSessions();
        return () => { cancelled = true; };
    }, [refreshTrigger]);

    const handleRevokeSession = async (sessionId: string) => {
        try {
            await apiClient.delete(`/auth/sessions/${sessionId}`);
            setSessions(sessions.filter(s => s.id !== sessionId));
            toast.success("Session revoked");
        } catch {
            toast.error("Failed to revoke session");
        }
    };

    const handleLogoutAll = async () => {
        try {
            await apiClient.delete('/auth/sessions');
            toast.success("All other sessions logged out");
            setLogoutAllDialogOpen(false);
            setRefreshTrigger(prev => prev + 1);
        } catch {
            toast.error("Failed to logout sessions");
        }
    };

    const otherSessions = sessions.filter(s => !s.is_current);

    return (
        <div className="space-y-10 animate-fade-in pb-10">
            <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">Devices</h2>
                <p className="text-[15px] text-muted-foreground">
                    Here are all the devices that are currently logged in with your account. You can log out of each one individually or all other devices.
                </p>
                <p className="text-[15px] text-muted-foreground mt-3 lg:max-w-2xl">
                    If you see an entry you don't recognize, log out of that device and change your account password immediately.
                </p>
            </div>

            <Separator className="bg-border/40" />

            {loadingSessions ? (
                <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                </div>
            ) : (
                <div className="space-y-8 max-w-2xl">
                    {/* Current Device section */}
                    <div className="space-y-4">
                        <h3 className="text-[16px] font-bold">Current Device</h3>
                        {sessions.filter(s => s.is_current).map((session) => (
                            <div key={session.id} className="flex items-center justify-between py-2 group">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 shrink-0 rounded-full bg-muted/50 flex items-center justify-center">
                                        {isTabletSession(session) ? (
                                            <Tablet className="h-6 w-6 text-foreground/80" />
                                        ) : isMobileSession(session) ? (
                                            <Smartphone className="h-6 w-6 text-foreground/80" />
                                        ) : (
                                            <Monitor className="h-6 w-6 text-foreground/80" />
                                        )}
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="text-[15px] font-bold">
                                            {session.device.toUpperCase()}
                                        </div>
                                        <div className="text-[14px] text-muted-foreground">
                                            {sessionDetails(session)}
                                        </div>
                                        {formatDateTime(session.last_active_at) && (
                                            <div className="text-[13px] text-muted-foreground/70">
                                                Last active {formatDateTime(session.last_active_at)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Other Devices section */}
                    {otherSessions.length > 0 && (
                        <>
                            <Separator className="bg-border/40" />
                            <div className="space-y-4">
                                <h3 className="text-[16px] font-bold">Other Devices</h3>
                                {otherSessions.map((session) => (
                                    <div key={session.id} className="flex items-center justify-between py-4 border-b border-border/20 last:border-0 group">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 shrink-0 rounded-full bg-muted/50 flex items-center justify-center">
                                                {isTabletSession(session) ? (
                                                    <Tablet className="h-6 w-6 text-foreground/80" />
                                                ) : isMobileSession(session) ? (
                                                    <Smartphone className="h-6 w-6 text-foreground/80" />
                                                ) : (
                                                    <Monitor className="h-6 w-6 text-foreground/80" />
                                                )}
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="text-[15px] font-bold">
                                                    {session.device.toUpperCase()}
                                                </div>
                                                <div className="text-[14px] text-muted-foreground">
                                                    {sessionDetails(session, true)}
                                                </div>
                                                {formatDateTime(session.last_active_at) && (
                                                    <div className="text-[13px] text-muted-foreground/70">
                                                        Last active {formatDateTime(session.last_active_at)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full text-destructive/80 hover:!bg-destructive/80 hover:!text-destructive-foreground focus-visible:ring-destructive/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleRevokeSession(session.id)}
                                            title="Log out device"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Logout All Devices - Only show if there are other sessions */}
                    {otherSessions.length > 0 && (
                        <div className="pt-6">
                            <div className="space-y-1.5 mb-4">
                                <h4 className="text-[16px] font-bold">
                                    Log out of all known devices
                                </h4>
                                <p className="text-[14px] text-muted-foreground">
                                    You'll have to log back in on all logged out devices.
                                </p>
                            </div>
                            
                            <Dialog open={logoutAllDialogOpen} onOpenChange={setLogoutAllDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant="destructive"
                                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium"
                                    >
                                        Log Out All Devices
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Log out of all devices?</DialogTitle>
                                        <DialogDescription>
                                            This will log you out of {otherSessions.length} other device{otherSessions.length > 1 ? 's' : ''}. 
                                            You'll need to log back in on those devices.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setLogoutAllDialogOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button variant="destructive" onClick={handleLogoutAll}>
                                            Log Out All
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
