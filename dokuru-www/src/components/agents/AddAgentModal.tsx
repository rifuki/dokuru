import { useState, type CSSProperties, type FormEvent } from "react";
import { useAgentStore, getAgentTokenByUrl, setAgentTokenByUrl } from "@/stores/use-agent-store";
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
import { Link2, Loader2, Dices, Terminal } from "lucide-react";
import { toast } from "sonner";
import { AgentConnectionModeOption } from "@/components/agents/AgentConnectionModeOption";
import type { AgentAccessMode } from "@/components/agents/AgentConnectionMode";

interface AddAgentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenSetupGuide?: () => void;
}

const ADJECTIVES = ["Swift", "Brave", "Mighty", "Silent", "Golden", "Azure", "Crimson", "Noble", "Rapid", "Stellar"];
const NOUNS = ["Phoenix", "Dragon", "Tiger", "Falcon", "Wolf", "Eagle", "Lion", "Panther", "Hawk", "Bear"];
type AccessMode = Exclude<AgentAccessMode, "domain">;

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

    const handleUrlChange = (newUrl: string) => {
        setUrl(newUrl);
        // Auto-fill token from cache if available and token field is empty
        if (newUrl && accessMode !== "relay" && !token) {
            const cachedToken = getAgentTokenByUrl(newUrl);
            if (cachedToken) {
                setToken(cachedToken);
            }
        }
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
            
            // Cache token by URL for future auto-fill
            if (accessMode !== "relay") {
                setAgentTokenByUrl(url.trim(), token.trim());
            }
            
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
                            <AgentConnectionModeOption
                                mode="cloudflare"
                                checked={accessMode === "cloudflare"}
                                badge="Recommended"
                                onSelect={(mode) => setAccessMode(mode)}
                            />
                            <AgentConnectionModeOption
                                mode="relay"
                                checked={accessMode === "relay"}
                                onSelect={(mode) => setAccessMode(mode)}
                            />
                            <AgentConnectionModeOption
                                mode="direct"
                                checked={accessMode === "direct"}
                                onSelect={(mode) => setAccessMode(mode)}
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
                        <div className="grid gap-3 md:grid-rows-[70px_90px_90px]">
                            <div className="space-y-1.5">
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

                            <div className="space-y-1.5">
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
                                        onChange={(e) => handleUrlChange(e.target.value.trim())}
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
                                    <div className="flex h-16 items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 text-sm">
                                        <Link2 className="h-4 w-4 shrink-0 text-primary" />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-primary">Relay mode skips the URL field</div>
                                            <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
                                                Use Relay on the agent host, then paste the generated token below.
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {accessMode !== "relay" && (
                                    <p className="text-xs leading-4 text-muted-foreground">
                                        {accessMode === "cloudflare"
                                            ? "Copy the trycloudflare URL shown by the agent."
                                            : "Use an HTTPS endpoint that reaches the agent service."}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="add-agent-token" className="text-sm font-medium">Agent Token</Label>
                                <Input
                                    id="add-agent-token"
                                    name="dokuru_agent_secret_new"
                                    type="password"
                                    inputMode="text"
                                    placeholder="dok_..."
                                    value={token}
                                    onChange={(e) => setToken(e.target.value.trim())}
                                    disabled={isLoading}
                                    autoComplete="one-time-code"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-form-type="other"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    className="font-mono text-sm"
                                    style={{ WebkitTextSecurity: "disc" } as CSSProperties}
                                />
                                <p className="text-xs leading-4 text-muted-foreground">
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
