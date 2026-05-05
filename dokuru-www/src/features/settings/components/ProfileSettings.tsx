import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { Camera, Loader2, AlertCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useProfile, settingsKeys } from "@/features/settings/hooks/use-profile";
import { useUpdateProfile } from "@/features/settings/hooks/use-update-profile";
import { useEmailChange } from "@/features/settings/hooks/use-email-change";
import { useAuthStore } from "@/stores/use-auth-store";
import { cn, getAvatarUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileSettings() {
    const queryClient = useQueryClient();
    const { data: user, isLoading } = useProfile();
    const { isPending: isUpdating, mutateAsync: updateUser } = useUpdateProfile();
    const { isPending: isChangingEmail, mutateAsync: changeEmail } = useEmailChange();

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
    const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
    const [isResendingVerification, setIsResendingVerification] = useState(false);

    // Form fields
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [verificationSentEmail, setVerificationSentEmail] = useState<string | null>(null);

    // Sync form fields only when user ID changes (initial load), not on every render
    const [initializedId, setInitializedId] = useState<string | null>(null);
    if (user && user.id.toString() !== initializedId) {
        setName(user.name || "");
        setUsername(user.username || "");
        setEmail(user.email || "");
        setVerificationSentEmail(null);
        setInitializedId(user.id.toString());
    }

    useEffect(() => {
        if (!isAvatarPreviewOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setIsAvatarPreviewOpen(false);
        };
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isAvatarPreviewOpen]);

    if (isLoading || !user) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    const avatarUrl = user?.avatar_url;
    const avatarSrc = getAvatarUrl(avatarUrl);

    const handleAvatarUpload = async (file: File, onUploadProgress?: (progress: number) => void) => {
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await apiClient.post('/users/avatar', formData, {
                headers: { 'Content-Type': undefined },
                onUploadProgress: (event: AxiosProgressEvent) => {
                    if (!event.total || event.total <= 0) return;
                    onUploadProgress?.((event.loaded / event.total) * 100);
                },
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
        } catch (error) {
            toast.error("Failed to upload avatar");
            throw error instanceof Error ? error : new Error("Failed to upload avatar");
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

    const getErrorMessage = (error: unknown) => error instanceof Error && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;

    const handleSendVerification = async () => {
        const targetEmail = email.trim();
        if (!targetEmail) {
            toast.error("Email address is required");
            return;
        }

        if (!EMAIL_PATTERN.test(targetEmail)) {
            toast.error("Enter a valid email address");
            return;
        }

        const isCurrentEmail = targetEmail.toLowerCase() === user.email.trim().toLowerCase();
        if (isCurrentEmail && user.email_verified) {
            return;
        }

        if (isCurrentEmail) {
            setIsResendingVerification(true);
            try {
                await apiClient.post('/auth/resend-verification', { email: user.email });
                toast.success("Verification email sent! Check your inbox.");
            } catch (error: unknown) {
                const msg = getErrorMessage(error);

                if (msg === "Email already verified") {
                    queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
                    toast.success("Email is already verified!");
                } else {
                    toast.error(msg || "Failed to send verification email");
                }
            } finally {
                setIsResendingVerification(false);
            }
            return;
        }

        try {
            await changeEmail(targetEmail);
            setEmail(targetEmail);
            setVerificationSentEmail(targetEmail);
            toast.success(`Verification email sent to ${targetEmail}. Check your inbox to confirm the change.`);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || "Failed to send verification email");
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

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

    const normalizedEmail = email.trim();
    const loadedEmail = user.email.trim();
    const isEmailChanged = normalizedEmail.toLowerCase() !== loadedEmail.toLowerCase();
    const isEmailValid = EMAIL_PATTERN.test(normalizedEmail);
    const hasPendingEmailVerification = isEmailChanged && verificationSentEmail === normalizedEmail;
    const verificationButtonLabel = isEmailChanged && !hasPendingEmailVerification ? "Send" : "Resend";
    const isSendingVerification = isChangingEmail || isResendingVerification;
    const canSendVerification = isEmailValid && !isSendingVerification && (isEmailChanged || !user.email_verified);
    const isProfileChanged = name !== user.name || username !== (user.username || "");

    return (
        <div className="space-y-10 animate-fade-in">
            <ImageUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUpload={handleAvatarUpload}
                title="Set Profile Photo"
                description="Upload a photo, then crop it into a clean square avatar."
                maxSizeMB={2}
                isAvatar={true}
            />

            <AlertDialog open={isRemoveModalOpen} onOpenChange={setIsRemoveModalOpen}>
                <AlertDialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
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

            {isAvatarPreviewOpen && avatarSrc && createPortal(
                <div
                    data-settings-escape-layer="true"
                    className="fixed inset-0 z-[200] flex h-dvh w-dvw items-center justify-center bg-black/85 p-6 backdrop-blur-sm animate-in fade-in-0"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Profile picture preview"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setIsAvatarPreviewOpen(false);
                    }}
                >
                    <button
                        type="button"
                        className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        onClick={() => setIsAvatarPreviewOpen(false)}
                        aria-label="Close profile picture preview"
                    >
                        <X className="h-6 w-6" />
                    </button>

                    <img
                        src={avatarSrc}
                        alt={`${user.name || user.username || "User"} profile picture`}
                        className="rounded-full object-cover shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95"
                        style={{ width: "min(78vw, 78vh, 680px)", height: "min(78vw, 78vh, 680px)" }}
                    />
                </div>,
                document.body
            )}

            <div>
                <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">My Account</h2>
                <p className="text-[15px] text-muted-foreground">
                    This is how others will see you on the site.
                </p>
            </div>

            <Separator className="bg-border/40" />

            <form onSubmit={handleProfileSubmit} noValidate className="max-w-2xl space-y-8">
                {/* Avatar Section */}
                <div className="flex flex-col items-start gap-5 rounded-xl border border-border/70 bg-transparent p-4 dark:border-border/30 dark:bg-muted/20 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
                    <button
                        type="button"
                        className={cn(
                            "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            avatarSrc ? "cursor-zoom-in" : "cursor-default"
                        )}
                        onClick={() => avatarSrc && setIsAvatarPreviewOpen(true)}
                        disabled={!avatarSrc}
                        aria-label="Preview profile picture"
                    >
                        <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background shadow-md transition-transform hover:scale-[1.03]">
                            <AvatarImage src={avatarSrc} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-3xl sm:text-4xl font-medium">
                                {user?.name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                        </Avatar>
                    </button>
                    <div className="w-full min-w-0 space-y-3 sm:w-auto">
                        <h4 className="text-[15px] font-bold">Profile Picture</h4>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <Button
                                type="button"
                                size="sm"
                                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
                                onClick={() => setIsUploadModalOpen(true)}
                            >
                                <Camera className="mr-2 h-4 w-4" /> Change Avatar
                            </Button>
                            {avatarUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full bg-destructive/15 text-destructive hover:!bg-destructive/70 hover:!text-destructive-foreground sm:w-auto"
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
                            className="h-11 border-border/80 bg-transparent shadow-none hover:border-border focus-visible:border-primary/50 focus-visible:ring-primary/15 dark:border-transparent dark:bg-muted/40 dark:hover:bg-muted/60 dark:focus-visible:ring-primary/50"
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
                            className="h-11 border-border/80 bg-transparent shadow-none hover:border-border focus-visible:border-primary/50 focus-visible:ring-primary/15 dark:border-transparent dark:bg-muted/40 dark:hover:bg-muted/60 dark:focus-visible:ring-primary/50"
                        />
                        <p className="text-[13px] text-muted-foreground mt-1">
                            You can only change this once every 30 days.
                        </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <div className="flex flex-wrap items-center gap-2">
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
                                disabled={isSendingVerification}
                                className="h-11 border-border/80 bg-transparent pr-4 shadow-none hover:border-border focus-visible:border-primary/50 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-70 dark:border-transparent dark:bg-muted/40 dark:hover:bg-muted/60 dark:focus-visible:ring-primary/50 sm:pr-24"
                            />
                            {(isEmailChanged || !user.email_verified) && (
                                <button
                                    type="button"
                                    onClick={handleSendVerification}
                                    disabled={!canSendVerification}
                                    className={cn(
                                        "mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium shadow-none transition-colors disabled:cursor-not-allowed sm:absolute sm:right-2 sm:top-1/2 sm:mt-0 sm:h-7 sm:w-auto sm:-translate-y-1/2",
                                        canSendVerification
                                            ? "border-border/80 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted/80"
                                            : "border-border/60 bg-muted/20 text-muted-foreground opacity-70 dark:bg-muted"
                                    )}
                                >
                                    {isSendingVerification ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <><Send className="h-3 w-3" />{verificationButtonLabel}</>
                                    )}
                                </button>
                            )}
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-1">
                            {isEmailChanged && !isEmailValid
                                ? "Enter a valid email before sending."
                                : hasPendingEmailVerification
                                    ? `Check ${normalizedEmail} to confirm this email change.`
                                : isEmailChanged
                                    ? "Send a verification link to the new address. Your email changes after you confirm it."
                                : !user.email_verified
                                    ? "Use Send or Resend to verify your email. Save Changes won't update email."
                                    : "We use this for authentication and notifications."
                            }
                        </p>
                    </div>
                </div>

                <div className="pt-4 sm:pt-6">
                    <Button
                        type="submit"
                        disabled={isUpdating || !isProfileChanged}
                        className="h-10 w-full bg-primary px-8 font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90 sm:w-auto"
                    >
                        {isUpdating ? <LoadingDots /> : "Save Changes"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
