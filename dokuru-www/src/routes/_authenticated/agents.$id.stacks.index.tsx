import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SquareStack,
  Container,
  FolderOpen,
  FileText,
  Search,
  ChevronRight,
  Layers,
  Activity,
  FileCode2,
  Copy,
  Check,
  Pencil,
  Save,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { canUseDockerAgent, dockerApi, dockerCredential, type Stack, type StackContainer } from "@/services/docker-api";
import { Input } from "@/components/ui/input";
import { agentApi } from "@/lib/api/agent";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agents/$id/stacks/")({
  component: StacksPage,
});

function stateColor(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-green-500/10 text-green-400 border-green-500/30";
    case "exited":     return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    case "paused":     return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "restarting": return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    default:           return "bg-muted text-muted-foreground border-muted";
  }
}

function stateDot(state: string) {
  switch (state.toLowerCase()) {
    case "running":    return "bg-green-400";
    case "exited":     return "bg-gray-400";
    case "paused":     return "bg-yellow-400";
    case "restarting": return "bg-blue-400";
    default:           return "bg-muted-foreground";
  }
}

function composeErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
  if (data?.error) return data.detail ? `${data.error}: ${data.detail}` : data.error;
  return fallback;
}

// ---------- Compose file dialog ----------

function ComposeDialog({
  open,
  onClose,
  stackName,
  agentUrl,
  token,
}: {
  open: boolean;
  onClose: () => void;
  stackName: string;
  agentUrl: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["stack-compose", agentUrl, stackName],
    queryFn: async () => {
      const res = await dockerApi.getStackCompose(agentUrl, token, stackName);
      return res.data;
    },
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await dockerApi.updateStackCompose(agentUrl, token, stackName, content);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["stack-compose", agentUrl, stackName], updated);
      setDraft(updated.content);
      setIsEditing(false);
      toast.success("Compose file saved");
    },
    onError: (err) => toast.error(composeErrorMessage(err, "Failed to save compose file")),
  });

  useEffect(() => {
    if (!open || data?.content === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(data.content);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEditing(false);
  }, [open, data?.content]);

  // Extract error detail from the agent's JSON response if available.
  const errorDetail = (() => {
    if (!error) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (error as any)?.response?.data as
        | { error: string; detail: string }
        | undefined;
      if (d?.error) return d;
    } catch { /* ignore */ }
    return { error: String(error), detail: "" };
  })();

  function handleCopy() {
    if (!data?.content) return;
    void navigator.clipboard.writeText(data.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCancelEdit() {
    setDraft(data?.content ?? "");
    setIsEditing(false);
  }

  function handleSave() {
    if (!draft.trim()) {
      toast.error("Compose file cannot be empty");
      return;
    }
    saveMutation.mutate(draft);
  }

  const hasContent = data?.content !== undefined;
  const hasChanges = hasContent && draft !== data.content;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex-row items-start justify-between gap-3 px-5 py-4 pr-12 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <FileCode2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {stackName}
              </DialogTitle>
              {data?.path && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                  {data.path}
                </p>
              )}
              {isEditing && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Save updates the compose file only. Run docker compose up when you want to apply it.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasContent && (
              <>
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={handleCancelEdit}
                      disabled={saveMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Revert
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={handleSave}
                      disabled={!hasChanges || saveMutation.isPending}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={() => setWordWrap(!wordWrap)}
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      {wordWrap ? "No Wrap" : "Wrap"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-zinc-950/60 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent hover:[&::-webkit-scrollbar-thumb]:bg-zinc-600/50">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
              Loading compose file…
            </div>
          ) : errorDetail ? (
            <div className="flex flex-col items-start justify-center min-h-48 gap-3 p-5">
              <div className="flex items-center gap-2 text-red-400">
                <FileCode2 className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">{errorDetail.error}</span>
              </div>
              {errorDetail.detail && (
                <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap break-all bg-zinc-900/60 rounded-lg px-4 py-3 w-full">
                  {errorDetail.detail}
                </pre>
              )}
            </div>
          ) : isEditing ? (
            <textarea
              className="block min-h-[55vh] w-full resize-none bg-transparent p-5 text-xs leading-relaxed font-mono text-zinc-100 outline-none selection:bg-cyan-500/30"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              wrap={wordWrap ? "soft" : "off"}
            />
          ) : (
            <pre className={`p-5 text-xs leading-relaxed font-mono text-zinc-200 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}>
              <YamlHighlight content={data?.content ?? ""} />
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Very lightweight YAML syntax colouring — no external dep required.
function YamlHighlight({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block">
          <YamlLine line={line} />
          {"\n"}
        </span>
      ))}
    </>
  );
}

function YamlLine({ line }: { line: string }) {
  // Comment
  if (/^\s*#/.test(line)) {
    return <span className="text-zinc-500 italic">{line}</span>;
  }
  // Top-level key (no leading spaces, ends with colon)
  if (/^[a-zA-Z_][a-zA-Z0-9_-]*\s*:/.test(line)) {
    const colon = line.indexOf(":");
    return (
      <>
        <span className="text-cyan-400 font-semibold">{line.slice(0, colon)}</span>
        <span className="text-zinc-400">:</span>
        <span className="text-zinc-200">{line.slice(colon + 1)}</span>
      </>
    );
  }
  // Indented key: "  key: value"
  const indentedKey = /^(\s+)([a-zA-Z_][a-zA-Z0-9_.-]*)(\s*:)(.*)/;
  const m = line.match(indentedKey);
  if (m) {
    return (
      <>
        <span>{m[1]}</span>
        <span className="text-sky-300">{m[2]}</span>
        <span className="text-zinc-400">{m[3]}</span>
        <span className="text-amber-200">{m[4]}</span>
      </>
    );
  }
  // List item "  - value"
  if (/^\s*-\s/.test(line)) {
    const dash = line.indexOf("-");
    return (
      <>
        <span>{line.slice(0, dash)}</span>
        <span className="text-zinc-400">-</span>
        <span className="text-amber-200">{line.slice(dash + 1)}</span>
      </>
    );
  }
  return <span className="text-zinc-300">{line}</span>;
}

// ---------- Container row ----------

function ContainerRow({
  container,
  agentId,
}: {
  container: StackContainer;
  agentId: string;
}) {
  const isRunning = container.state.toLowerCase() === "running";

  return (
    <Link
      to="/agents/$id/containers/$containerId"
      params={{ id: agentId, containerId: container.id }}
      className="group/row flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
    >
      <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60 shrink-0 group-hover/row:bg-muted transition-colors">
        <Container className="h-3.5 w-3.5 text-muted-foreground" />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background",
            stateDot(container.state),
            isRunning && "animate-pulse",
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block group-hover/row:text-foreground transition-colors">
          {container.name}
        </span>
        <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5">
          {container.image}
        </span>
      </div>

      {container.service && (
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-muted/60 text-muted-foreground border border-border/50 shrink-0">
          {container.service}
        </span>
      )}

      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0",
          stateColor(container.state),
        )}
      >
        {container.state}
      </span>

      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover/row:text-muted-foreground group-hover/row:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

// ---------- Stack card ----------

function StackCard({
  stack,
  agentId,
  agentUrl,
  token,
}: {
  stack: Stack;
  agentId: string;
  agentUrl: string;
  token: string;
}) {
  const [composeOpen, setComposeOpen] = useState(false);

  const allRunning = stack.running === stack.total;
  const noneRunning = stack.running === 0;
  const runPct = stack.total > 0 ? (stack.running / stack.total) * 100 : 0;

  const statusLabel = allRunning ? "running" : noneRunning ? "stopped" : "partial";
  const statusClass = allRunning
    ? "bg-green-500/10 text-green-400 border-green-500/30"
    : noneRunning
    ? "bg-gray-500/10 text-gray-400 border-gray-500/30"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
  const barClass = allRunning
    ? "bg-green-500"
    : noneRunning
    ? "bg-gray-500"
    : "bg-yellow-500";

  return (
    <>
      <div className="group border border-border/60 rounded-2xl bg-card hover:border-border hover:shadow-lg hover:shadow-black/5 transition-all duration-300 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 bg-gradient-to-r from-muted/30 to-transparent border-b border-border/40">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/15 transition-colors shrink-0 border border-cyan-500/20">
            <SquareStack className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-semibold text-base tracking-tight">{stack.name}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full border",
                  statusClass,
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full bg-current",
                    allRunning && "animate-pulse",
                  )}
                />
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3 w-3" />
                <span>
                  <span className="text-foreground font-medium">{stack.running}</span>
                  /{stack.total} running
                </span>
              </span>
              {stack.working_dir && (
                <span className="flex items-center gap-1.5 truncate">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{stack.working_dir}</span>
                </span>
              )}
              {stack.config_file && (
                <button
                  onClick={() => setComposeOpen(true)}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors group/compose"
                >
                  <FileText className="h-3 w-3 shrink-0 group-hover/compose:text-cyan-400 transition-colors" />
                  <span className="font-mono group-hover/compose:text-cyan-400 transition-colors underline underline-offset-2 decoration-dashed">
                    {stack.config_file.split("/").pop()}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-2xl font-bold tabular-nums leading-none">
              {stack.total}
            </span>
            <span className="text-xs text-muted-foreground">containers</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-muted/40">
          <div
            className={cn("h-full transition-all duration-700", barClass)}
            style={{ width: `${runPct}%` }}
          />
        </div>

        {/* Container rows */}
        <div className="divide-y divide-border/30">
          {stack.containers.map((c) => (
            <ContainerRow key={c.id} container={c} agentId={agentId} />
          ))}
        </div>
      </div>

      {stack.config_file && (
        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          stackName={stack.name}
          agentUrl={agentUrl}
          token={token}
        />
      )}
    </>
  );
}

// ---------- Page ----------

function StacksPage() {
  const { id } = Route.useParams();
  const [search, setSearch] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: stacks, isLoading } = useQuery({
    queryKey: ["stacks", id],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.listStacks(agent.url, credential);
      return res.data;
    },
    enabled: canUseDockerAgent(agent),
    refetchInterval: 10000,
  });

  const filtered = (stacks ?? []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.containers.some(
        (c) =>
          c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q),
      )
    );
  });

  const totalRunning = filtered.reduce((sum, s) => sum + s.running, 0);
  const totalContainers = filtered.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        icon={Layers}
        title="Stacks"
        loading={isLoading}
        stats={[
          { value: filtered.length, label: `stack${filtered.length !== 1 ? "s" : ""}` },
          { value: `${totalRunning}/${totalContainers}`, label: "containers running" },
        ]}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 w-56 text-sm bg-muted/40 border-border/60 focus:bg-background"
            placeholder="Search stacks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageHeader>

      <div className="space-y-5">

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border bg-card animate-pulse h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/50 bg-muted/10 p-20 text-center">
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center border border-border/50">
              <SquareStack className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-1.5">No stacks found</h3>
          <p className="text-muted-foreground text-sm">
            {search
              ? "No stacks match your search."
              : "No Docker Compose stacks are running on this agent."}
          </p>
        </div>
      ) : (
        <>
          {filtered.map((stack) => (
            <StackCard
              key={stack.name}
              stack={stack}
              agentId={id}
              agentUrl={agent?.url ?? ""}
              token={dockerCredential(agent)}
            />
          ))}
        </>
      )}
      </div>
    </div>
  );
}
