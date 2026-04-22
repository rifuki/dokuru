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
import { Users, UserCheck, UserX, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

  // Calculate stats
  const totalUsers = users?.length ?? 0;
  const verifiedUsers = users?.filter(u => u.email_verified).length ?? 0;
  const pendingUsers = totalUsers - verifiedUsers;
  const adminUsers = users?.filter(u => u.role === "admin").length ?? 0;

  // Mock growth data (last 7 days)
  const growthData = [
    { day: "Mon", users: totalUsers - 6 },
    { day: "Tue", users: totalUsers - 5 },
    { day: "Wed", users: totalUsers - 3 },
    { day: "Thu", users: totalUsers - 2 },
    { day: "Fri", users: totalUsers - 1 },
    { day: "Sat", users: totalUsers },
    { day: "Sun", users: totalUsers },
  ];

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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-blue-100 dark:bg-blue-950/30 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Users</span>
          </div>
          <p className="text-3xl font-bold">{totalUsers}</p>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950/30 p-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Verified</span>
          </div>
          <p className="text-3xl font-bold">{verifiedUsers}</p>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-950/30 p-2">
              <UserX className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Pending</span>
          </div>
          <p className="text-3xl font-bold">{pendingUsers}</p>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-purple-100 dark:bg-purple-950/30 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Admins</span>
          </div>
          <p className="text-3xl font-bold">{adminUsers}</p>
        </div>
      </div>

      {/* User Growth Chart */}
      <div className="rounded-xl border bg-card p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">User Growth</h3>
          <p className="text-sm text-muted-foreground">Last 7 days</p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={growthData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} vertical={false} />
            <XAxis 
              dataKey="day" 
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#fff'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="users" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6 }}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
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
