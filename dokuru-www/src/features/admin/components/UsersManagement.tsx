import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useUsersList } from "@/features/admin/hooks/use-users-list";
import { useUpdateUserRole } from "@/features/admin/hooks/use-update-user-role";
import { toast } from "sonner";
import type { UserWithTimestamps } from "@/features/admin/types/admin-types";
import { UsersTable, type DialogType } from "./UsersTable";

export function UsersManagement() {
  const { data: users, isLoading } = useUsersList();
  const { mutate: updateRole } = useUpdateUserRole();

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithTimestamps | null>(null);
  const [newRole, setNewRole] = useState<"admin" | "user" | null>(null);

  const handleRoleChange = (user: UserWithTimestamps, role: "admin" | "user") => {
    setSelectedUser(user);
    setNewRole(role);
    setDialogType("role");
  };

  const handleResetPassword = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setDialogType("reset");
  };

  const handleBlockAccount = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setDialogType("block");
  };

  const handleDeleteAccount = (user: UserWithTimestamps) => {
    setSelectedUser(user);
    setDialogType("delete");
  };

  const handleConfirmRoleChange = () => {
    if (!selectedUser || !newRole) return;

    updateRole(
      { userId: selectedUser.id, role: newRole },
      {
        onSuccess: () => {
          toast.success(`Role updated - ${selectedUser.name} is now ${newRole}`);
          setDialogType(null);
          setSelectedUser(null);
          setNewRole(null);
        },
        onError: () => {
          toast.error("Failed to update role");
        },
      }
    );
  };

  const handleConfirmResetPassword = () => {
    toast.success(`Password reset link sent to ${selectedUser?.email}`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleConfirmBlockAccount = () => {
    toast.success(`${selectedUser?.name} has been blocked`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleConfirmDeleteAccount = () => {
    toast.success(`${selectedUser?.name} has been deleted`);
    setDialogType(null);
    setSelectedUser(null);
  };

  const handleBulkBlock = (count: number) => {
    toast.success(`${count} users have been blocked`);
  };

  const handleBulkDelete = (count: number) => {
    toast.success(`${count} users have been deleted`);
  };

  const getDialogContent = () => {
    switch (dialogType) {
      case "role":
        return {
          title: "Confirm Role Change",
          description: (
            <>
              Are you sure you want to change <strong>{selectedUser?.name}</strong>&apos;s role to{" "}
              <Badge variant={newRole === "admin" ? "destructive" : "default"}>{newRole}</Badge>?
            </>
          ),
          action: handleConfirmRoleChange,
          actionText: "Confirm",
        };
      case "reset":
        return {
          title: "Reset Password",
          description: `Send password reset link to ${selectedUser?.email}?`,
          action: handleConfirmResetPassword,
          actionText: "Send Reset Link",
        };
      case "block":
        return {
          title: "Block Account",
          description: `Are you sure you want to block ${selectedUser?.name}? They will not be able to login until unblocked.`,
          action: handleConfirmBlockAccount,
          actionText: "Block",
          destructive: true,
        };
      case "delete":
        return {
          title: "Delete Account",
          description: `Are you sure you want to permanently delete ${selectedUser?.name}? This action cannot be undone.`,
          action: handleConfirmDeleteAccount,
          actionText: "Delete",
          destructive: true,
        };
      default:
        return null;
    }
  };

  const dialogContent = getDialogContent();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users Management</h1>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin">← Back to Admin</Link>
        </Button>
      </div>

      <UsersTable
        users={users}
        isLoading={isLoading}
        onRoleChange={handleRoleChange}
        onResetPassword={handleResetPassword}
        onBlockAccount={handleBlockAccount}
        onDeleteAccount={handleDeleteAccount}
        onBulkBlock={handleBulkBlock}
        onBulkDelete={handleBulkDelete}
      />

      {/* Confirmation Dialog */}
      <AlertDialog
        open={dialogType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogType(null);
            setSelectedUser(null);
            setNewRole(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={dialogContent?.action}
              className={dialogContent?.destructive ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {dialogContent?.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
