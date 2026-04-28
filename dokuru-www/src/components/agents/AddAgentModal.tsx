import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useAgentStore } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Check, Cloud, Globe, Link2, Loader2, Dices, Terminal } from "lucide-react";
import { toast } from "sonner";

interface AddAgentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenSetupGuide?: () => void;
}

const ADJECTIVES = ["Swift", "Brave", "Mighty", "Silent", "Golden", "Azure", "Crimson", "Noble", "Rapid", "Stellar"];
const NOUNS = ["Phoenix", "Dragon", "Tiger", "Falcon", "Wolf", "Eagle", "Lion", "Panther", "Hawk", "Bear"];
type AccessMode = "cloudflare" | "relay" | "direct";

function generateRandomName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
}

export function AddAgentModal({ open, onOpenChange, onOpenSetupGuide }: AddAgentModalProps) {
    const { createAgent, isLoading } = useAgentStore();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [accessMode, setAccessMode] = useState<AccessMode>("cloudflare");

    const handleRandomName = () => {
        setName(generateRandomName());
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Validate required fields
        if (!name.trim() || !token.trim()) {
            toast.error("Name and token are required");
            return;
        }

        // URL required for non-relay modes
        if (accessMode !== "relay" && !url.trim()) {
            toast.error("Agent URL is required");
            return;
        }

        // Validate URL based on access mode
        if (accessMode === "cloudflare" && !url.startsWith("https://")) {
            toast.error("Cloudflare Tunnel URL must use HTTPS");
            return;
        }

        try {
            await createAgent({
                name: name.trim(),
                url: accessMode === "relay" ? "relay" : url.trim(),
                token: token.trim(),
                access_mode: accessMode,
            });
            toast.success("Agent added successfully");
            // Reset form
            setName("");
            setUrl("");
            setToken("");
            setAccessMode("cloudflare");
            onOpenChange(false);
        } catch (error) {
            toast.error((error as Error).message || "Failed to add agent");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[940px]">
                <DialogHeader className="border-b border-border px-6 py-5">
                    <DialogTitle className="text-xl">Add Docker Agent</DialogTitle>
                    <DialogDescription>
                        Pick how Dokuru reaches your host, then paste the agent URL and token shown on the host.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit}
                    className="grid md:grid-cols-[0.82fr_1.18fr]"
                    autoComplete="off"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                >
                    <div className="border-b border-border bg-muted/25 p-5 md:border-b-0 md:border-r">
                        <div className="mb-3">
                            <div className="text-sm font-semibold">Connection mode</div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Cloudflare is the fastest setup. Relay is best when the host cannot expose any URL.
                            </p>
                        </div>

                        <div role="radiogroup" aria-label="Connection mode" className="space-y-2">
                            <AccessModeOption
                                value="cloudflare"
                                label="Cloudflare Tunnel"
                                description="Instant HTTPS tunnel, no domain required."
                                icon={<Cloud className="h-4 w-4" />}
                                checked={accessMode === "cloudflare"}
                                badge="Recommended"
                                onSelect={setAccessMode}
                            />
                            <AccessModeOption
                                value="relay"
                                label="Relay Mode"
                                description="No inbound port and no public URL."
                                icon={<Link2 className="h-4 w-4" />}
                                checked={accessMode === "relay"}
                                onSelect={setAccessMode}
                            />
                            <AccessModeOption
                                value="direct"
                                label="Direct HTTP"
                                description="Use your own reverse proxy endpoint."
                                icon={<Globe className="h-4 w-4" />}
                                checked={accessMode === "direct"}
                                onSelect={setAccessMode}
                            />
                        </div>

                        {onOpenSetupGuide && (
                            <div className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                                <Terminal className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-primary" />
                                Need to prepare the host first?{" "}
                                <button
                                    type="button"
                                    onClick={onOpenSetupGuide}
                                    className="font-medium text-primary underline-offset-4 hover:underline"
                                >
                                    Open setup guide
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col p-5">
                        <div className="grid gap-4 md:grid-rows-[72px_96px_96px]">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">Agent Name</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="name"
                                        name="agent_display_name"
                                        placeholder="e.g. Production Server"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={isLoading}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        className="flex-1"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={handleRandomName}
                                        disabled={isLoading}
                                        title="Generate random name"
                                        className="shrink-0"
                                    >
                                        <Dices className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="url" className="text-sm font-medium">Agent URL</Label>
                                {accessMode !== "relay" ? (
                                    <Input
                                        id="url"
                                        name="agent_endpoint_url"
                                        type="url"
                                        inputMode="url"
                                        placeholder={
                                            accessMode === "cloudflare"
                                                ? "https://xxx.trycloudflare.com"
                                                : "https://agent.yourdomain.com"
                                        }
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value.trim())}
                                        disabled={isLoading}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                    />
                                ) : (
                                    <Input
                                        id="url"
                                        name="agent_endpoint_url"
                                        type="text"
                                        value="Relay mode - no URL required"
                                        disabled
                                        readOnly
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        className="font-medium text-muted-foreground"
                                    />
                                )}
                                <p className="text-xs text-muted-foreground">
                                    {accessMode === "cloudflare"
                                        ? "Copy the trycloudflare URL shown by the agent."
                                        : accessMode === "direct"
                                            ? "Use an HTTPS endpoint that reaches the agent service."
                                            : "Relay connects through Dokuru without a public URL."}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="token" className="text-sm font-medium">Agent Token</Label>
                                <Input
                                    id="token"
                                    name="agent_access_token"
                                    type="text"
                                    inputMode="text"
                                    placeholder="dok_..."
                                    value={token}
                                    onChange={(e) => setToken(e.target.value.trim())}
                                    disabled={isLoading}
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-form-type="other"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    className="font-mono text-sm"
                                    style={{ WebkitTextSecurity: "disc" } as CSSProperties}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Paste the access token shown by the agent on the host.
                                </p>
                            </div>
                        </div>

                        <div className="mt-auto flex justify-end gap-3 pt-5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add Agent
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AccessModeOption({
    value,
    label,
    description,
    icon,
    checked,
    badge,
    onSelect,
}: {
    value: AccessMode;
    label: string;
    description: string;
    icon: ReactNode;
    checked: boolean;
    badge?: string;
    onSelect: (value: AccessMode) => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onSelect(value)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                checked
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-background/80"
            }`}
        >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${checked ? "bg-primary text-primary-foreground" : "bg-muted text-primary"}`}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {label}
                    {badge && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {badge}
                        </span>
                    )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
            </span>
            <Check className={`h-4 w-4 shrink-0 ${checked ? "text-primary" : "opacity-0"}`} />
        </button>
    );
}
