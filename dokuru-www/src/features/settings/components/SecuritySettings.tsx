import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";

export function SecuritySettings() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Derived validation states (no need for useState for these, less syncing issues)
    const newPasswordError = newPassword.length > 0 && newPassword.length < 8
        ? "Password must be at least 8 characters" : null;
    const confirmPasswordError = confirmPassword.length > 0 && confirmPassword !== newPassword
        ? "Passwords do not match" : null;

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPasswordError(null);

        if (newPasswordError || confirmPasswordError || newPassword.length === 0) {
            return;
        }

        setIsSubmitting(true);
        try {
            await apiClient.post('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success("Password changed successfully");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: unknown) {
            // Because api.ts interceptor unwraps the response data, error is actually an ApiErrorResponse
            const apiError = error as { error_code?: string; message?: string };
            if (apiError.error_code === 'AUTH/INVALID_CREDENTIALS' || apiError.error_code === 'auth/invalid_credentials' || apiError.message?.toLowerCase().includes("current password")) {
                setCurrentPasswordError("Current password is incorrect");
            } else {
                toast.error("Failed to change password. Please try again.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmPasswordChange = (value: string) => {
        setConfirmPassword(value);
    };

    const handleNewPasswordChange = (value: string) => {
        setNewPassword(value);
    };

    const isPasswordValid =
        currentPassword &&
        newPassword &&
        confirmPassword &&
        newPassword === confirmPassword &&
        newPassword.length >= 8;

    return (
        <div className="space-y-10 animate-fade-in pb-10">
            <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">Password and Authentication</h2>
                <p className="text-[15px] text-muted-foreground">
                    Manage your account security and change your password.
                </p>
            </div>

            <Separator className="bg-border/40" />

            <form onSubmit={handlePasswordSubmit} className="max-w-xl space-y-6">
                {/* Current Password */}
                <div className="space-y-2">
                    <Label htmlFor="current-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Current Password
                        <span className="text-destructive ml-1">*</span>
                    </Label>
                    <div className="relative">
                        <Input
                            id="current-password"
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => {
                                setCurrentPassword(e.target.value);
                                setCurrentPasswordError(null);
                            }}
                            className={`h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 pr-10 hover:bg-muted/60 ${currentPasswordError ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    {currentPasswordError ? (
                        <p className="text-[13px] text-destructive">{currentPasswordError}</p>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            You must provide your current password to set a new one.
                        </p>
                    )}
                </div>

                {/* New Password Group */}
                <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <Label htmlFor="new-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            New Password
                            <span className="text-destructive ml-1">*</span>
                        </Label>
                        <div className="relative">
                            <Input
                                id="new-password"
                                type={showNewPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => handleNewPasswordChange(e.target.value)}
                                className="h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 pr-10 hover:bg-muted/60"
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {newPasswordError ? (
                            <p className="text-[13px] text-destructive">{newPasswordError}</p>
                        ) : (
                            <p className="text-[13px] text-muted-foreground">
                                Make sure your new password is at least 8 characters long.
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Confirm New Password
                            <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                            className={`h-11 bg-muted/40 border-transparent transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 hover:bg-muted/60 ${confirmPasswordError ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                        />
                        {confirmPasswordError && (
                            <p className="text-[13px] text-destructive">{confirmPasswordError}</p>
                        )}
                    </div>
                </div>

                <div className="pt-6">
                    <Button
                        type="submit"
                        disabled={!isPasswordValid || isSubmitting}
                        className="h-10 px-8 font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md"
                    >
                        {isSubmitting ? "Updating..." : "Update Password"}
                    </Button>
                </div>
            </form>

            {/* Put other security configurations here like 2FA in the future */}
        </div>
    );
}
