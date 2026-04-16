import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useApiKeys } from "@/features/admin/hooks/use-api-keys";
import { useRevokeApiKey } from "@/features/admin/hooks/use-revoke-api-key";
import { useDeleteApiKey } from "@/features/admin/hooks/use-delete-api-key";
import { toast } from "sonner";
import type { ApiKey } from "@/features/admin/types/admin-types";
import { ApiKeysTable } from "./ApiKeysTable";
import { CreateKeyDialog } from "./CreateKeyDialog";

export function ApiKeysManagement() {
  const { data: apiKeys, isLoading } = useApiKeys();
  const { mutate: revokeKey } = useRevokeApiKey();
  const { mutate: deleteKey } = useDeleteApiKey();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleRevoke = (id: string) => {
    revokeKey(id, {
      onSuccess: () => toast.success("API key revoked"),
      onError: () => toast.error("Failed to revoke key"),
    });
  };

  const handleDelete = (id: string) => {
    deleteKey(id, {
      onSuccess: () => {
        toast.success("API key deleted");
        setDeleteConfirm(null);
      },
      onError: () => toast.error("Failed to delete key"),
    });
  };

  const handleBulkRevoke = (rows: ApiKey[]) => {
    const activeSelected = rows.filter((row) => row.is_active);
    const count = activeSelected.length;
    if (count === 0) {
      toast.error("No active keys selected");
      return;
    }
    activeSelected.forEach((row) => revokeKey(row.id));
    toast.success(`${count} API key(s) revoked`);
  };

  const handleBulkDelete = (rows: ApiKey[]) => {
    const count = rows.length;
    rows.forEach((row) => deleteKey(row.id));
    toast.success(`${count} API key(s) deleted`);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
            <p className="text-muted-foreground">Manage API access keys for external integrations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin">← Back to Admin</Link>
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Key
            </Button>
          </div>
        </div>

        <ApiKeysTable
          apiKeys={apiKeys}
          isLoading={isLoading}
          onRevoke={handleRevoke}
          onDelete={setDeleteConfirm}
          onBulkRevoke={handleBulkRevoke}
          onBulkDelete={handleBulkDelete}
        />

        <CreateKeyDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSuccess={() => {}}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteConfirm}
          onOpenChange={() => setDeleteConfirm(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this API key? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
