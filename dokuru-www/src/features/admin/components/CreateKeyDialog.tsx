import { useState } from "react";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateApiKey } from "@/features/admin/hooks/use-create-api-key";
import { toast } from "sonner";
import { CopyButton } from "./CopyButton";

const AVAILABLE_SCOPES = [
  { value: "admin:full", label: "Full Admin Access" },
  { value: "admin:users", label: "User Management" },
  { value: "admin:api-keys", label: "API Key Management" },
  { value: "dev:seed", label: "Development" },
  { value: "read:users", label: "Read Users" },
];

interface CreateKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (key: string) => void;
}

export function CreateKeyDialog({ open, onClose, onSuccess }: CreateKeyDialogProps) {
  const { mutate: createKey, isPending: isCreating } = useCreateApiKey();

  const [formName, setFormName] = useState("");
  const [formScopes, setFormScopes] = useState<string[]>(["read:users"]);
  const [formExpires, setFormExpires] = useState("30");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleClose = () => {
    setCreatedKey(null);
    setFormName("");
    setFormScopes(["read:users"]);
    setFormExpires("30");
    onClose();
  };

  const handleCreate = () => {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (formScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }

    createKey(
      {
        name: formName.trim(),
        scopes: formScopes,
        expiresDays: formExpires === "never" ? undefined : parseInt(formExpires),
      },
      {
        onSuccess: (data) => {
          setCreatedKey(data.key);
          onSuccess(data.key);
          toast.success("API key created successfully");
        },
        onError: () => {
          toast.error("Failed to create API key");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New API Key</DialogTitle>
          <DialogDescription>
            Create a new API key with specific permissions. The key will only be shown once.
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 border border-border p-4">
              <p className="text-sm font-semibold mb-2 text-foreground">
                Copy this key now! It won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background px-3 py-2 rounded border border-border text-sm font-mono break-all text-foreground">
                  {createdKey}
                </code>
                <CopyButton text={createdKey} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <div className="relative">
                <Input
                  id="key-name"
                  placeholder="e.g., Production API Key"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const prefixes = ["Production", "Development", "Testing", "Staging", "Backup", "Legacy", "Internal", "External"];
                    const suffixes = ["API Key", "Access Key", "Service Key", "Integration Key", "Webhook Key"];
                    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
                    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                    const randomNum = Math.floor(Math.random() * 999) + 1;
                    setFormName(`${prefix} ${suffix} ${randomNum}`);
                  }}
                  title="Generate random name"
                >
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiration</Label>
              <Select value={formExpires} onValueChange={setFormExpires}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never expires</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scopes (Permissions)</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {AVAILABLE_SCOPES.map((scope) => (
                  <div key={scope.value} className="flex items-start gap-3">
                    <Checkbox
                      id={scope.value}
                      checked={formScopes.includes(scope.value)}
                      onCheckedChange={() => {
                        setFormScopes((prev) =>
                          prev.includes(scope.value)
                            ? prev.filter((s) => s !== scope.value)
                            : [...prev, scope.value]
                        );
                      }}
                    />
                    <div className="grid gap-0.5">
                      <label htmlFor={scope.value} className="text-sm font-medium">
                        {scope.label}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create API Key"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
