import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ImageUploadModal } from "./ImageUploadModal";
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
import { Camera, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useProfile, settingsKeys } from "@/features/settings/hooks/use-profile";
import { useUpdateProfile } from "@/features/settings/hooks/use-update-profile";
import { useEmailChange } from "@/features/settings/hooks/use-email-change";
import { useAuthStore } from "@/stores/use-auth-store";
import { getAvatarUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function ProfileSettings() {
    const queryClient = useQueryClient();
    const { data: user, isLoading } = useProfile();
    const { isPending: isUpdating, mutateAsync: updateUser } = useUpdateProfile();
    const { isPending: isChangingEmail, mutateAsync: changeEmail } = useEmailChange();

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
    const [isResendingVerification, setIsResendingVerification] = useState(false);

    // Form fields
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");

    // Sync form fields only when user ID changes (initial load), not on every render
    const [initializedId, setInitializedId] = useState<string | null>(null);
    if (user && user.id.toString() !== initializedId) {
        setName(user.name || "");
        setUsername(user.username || "");
        setEmail(user.email || "");
        setInitializedId(user.id.toString());
    }

    if (isLoading || !user) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    const avatarUrl = user?.avatar_url;

    const handleAvatarUpload = async (file: File) => {
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await apiClient.post('/users/avatar', formData, {
                headers: { 'Content-Type': undefined },
            });
            const newAvatarUrl = response.data?.data?.avatar_url;
            if (newAvatarUrl && user) {
                if (typeof window !== "undefined") {
                    localStorage.setItem("avatar_update_ts", Date.now().toString());
                }
                // Pre-update cache to avoid flicker
                const updatedUser = { ...user, avatar_url: newAvatarUrl };
                queryClient.setQueryData(settingsKeys.profile(), updatedUser);
                useAuthStore.getState().actions.setUser(updatedUser);
            }
            toast.success("Avatar updated successfully");
        } catch {
            toast.error("Failed to upload avatar");
        }
    };

    const handleAvatarRemove = async () => {
        setIsRemovingAvatar(true);
        try {
            await apiClient.delete('/users/avatar');
            if (user) {
                if (typeof window !== "undefined") {
                    localStorage.setItem("avatar_update_ts", Date.now().toString());
                }
                // Pre-update cache explicitly setting avatar to undefined
                const updatedUser = { ...user, avatar_url: undefined };
                queryClient.setQueryData(settingsKeys.profile(), updatedUser);
                useAuthStore.getState().actions.setUser(updatedUser);
            }
            toast.success("Avatar removed successfully");
            setIsRemoveModalOpen(false);
        } catch {
            toast.error("Failed to remove avatar");
        } finally {
            setIsRemovingAvatar(false);
        }
    };

    const handleResendVerification = async () => {
        setIsResendingVerification(true);
        try {
            await apiClient.post('/auth/resend-verification', { email: user.email });
            toast.success("Verification email sent! Check your inbox.");
        } catch (error: unknown) {
            const msg = error instanceof Error && 'response' in error 
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message 
                : undefined;
            
            if (msg === "Email already verified") {
                // Refresh user data
                queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
                toast.success("Email is already verified!");
            } else {
                toast.error(msg || "Failed to send verification email");
            }
        } finally {
            setIsResendingVerification(false);
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Handle email change separately
        if (email !== user.email) {
            try {
                await changeEmail(email);
                toast.success(`Verification email sent to ${email}. Check your inbox to confirm the change.`);
                setEmail(user.email);
                queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
            } catch (error: unknown) {
                const msg = error instanceof Error && 'response' in error 
                    ? (error as { response?: { data?: { message?: string } } }).response?.data?.message 
                    : undefined;
                toast.error(msg || "Failed to initiate email change");
            }
            return;
        }

        // Handle other updates
        const updates: { name?: string; username?: string } = {};
        if (name !== user.name) updates.name = name;
        if (username !== user.username) updates.username = username;

        if (Object.keys(updates).length > 0) {
            try {
                await updateUser(updates);
                if (user) {
                    useAuthStore.getState().actions.setUser({ ...user, ...updates });
                }
                queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
                toast.success("Profile updated successfully");
            } catch {
                toast.error("Failed to update profile");
            }
        }
    };

    const isProfileChanged =
        name !== user.name ||
        username !== (user.username || "") ||
        email !== user.email;

    return (
        <div className="space-y-10 animate-fade-in">
            <ImageUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleAvatarUpload}
                title="Upload Profile Photo"
                description="Select a profile photo. Recommended: Square image, at least 200x200px."
                maxSizeMB={2}
                isAvatar={true}
            />

            <AlertDialog open={isRemoveModalOpen} onOpenChange={setIsRemoveModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Profile Picture?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove your profile picture? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemovingAvatar}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleAvatarRemove();
                            }}
                            disabled={isRemovingAvatar}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRemovingAvatar ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">My Account</h2>
                <p className="text-[15px] text-muted-foreground">
                    This is how others will see you on the site.
                </p>
            </div>

            <Separator className="bg-border/40" />

            <form onSubmit={handleProfileSubmit} className="space-y-8 max-w-2xl">
                {/* Avatar Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-6 rounded-xl bg-muted/20 border border-border/30">
                    <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background shadow-md">
                        <AvatarImage src={getAvatarUrl(avatarUrl)} />
                        <AvatarFallback className="bg-muted text-muted-foreground text-3xl sm:text-4xl font-medium">
                            {user?.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="space-y-3">
                        <h4 className="text-[15px] font-bold">Profile Picture</h4>
                        <div className="flex items-center gap-3">
                            <Button
                                type="button"
                                size="sm"
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                                onClick={() => setIsUploadModalOpen(true)}
                            >
                                <Camera className="mr-2 h-4 w-4" /> Change Avatar
                            </Button>
                            {avatarUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => setIsRemoveModalOpen(true)}
                                    disabled={isRemovingAvatar}
                                >
                                    {isRemovingAvatar ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Remove"
                                    )}
                                </Button>
                            )}
                        </div>
                        <p className="text-[13px] text-muted-foreground">
                            We support JPG, PNG, or GIF. Max size 2MB.
                        </p>
                    </div>
                </div>

                {/* Form Fields */}
                <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Display Name
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your display name"
                            className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Username
                        </Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60"
                        />
                        <p className="text-[13px] text-muted-foreground mt-1">
                            You can only change this once every 30 days.
                        </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Email Address
                            </Label>
                            {!user.email_verified && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                    <AlertCircle className="h-3 w-3" />
                                    Unverified
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                disabled={!user.email_verified}
                                className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60 disabled:opacity-70 disabled:cursor-not-allowed pr-24"
                            />
                            {!user.email_verified && (
                                <button
                                    type="button"
                                    onClick={handleResendVerification}
                                    disabled={isResendingVerification}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3 text-[12px] font-medium rounded-md bg-muted hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {isResendingVerification ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <><RefreshCw className="h-3 w-3" />Resend</>
                                    )}
                                </button>
                            )}
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-1">
                            {!user.email_verified
                                ? "Verify your email to enable editing and notifications."
                                : "We use this for authentication and notifications."
                            }
                        </p>
                    </div>
                </div>

                <div className="pt-6">
                    <Button
                        type="submit"
                        disabled={isUpdating || isChangingEmail || !isProfileChanged}
                        className="h-10 px-8 font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md"
                    >
                        {isUpdating || isChangingEmail ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
