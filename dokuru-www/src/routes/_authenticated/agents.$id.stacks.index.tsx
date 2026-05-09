import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Container,
  FolderOpen,
  FileText,
  Search,
  ChevronRight,
  Activity,
  FileCode2,
  Copy,
  Check,
  Pencil,
  Save,
  Loader2,
  RotateCcw,
  X,
  ListOrdered,
  Play,
  Power,
} from "lucide-react";
import {
  canUseDockerAgent,
  dockerApi,
  dockerCredential,
  type Stack,
  type StackContainer,
} from "@/services/docker-api";
import { Input } from "@/components/ui/input";
import { agentApi } from "@/lib/api/agent";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import { useAuthStore } from "@/stores/use-auth-store";
import { useComposeActionStore } from "@/stores/use-compose-action-store";
import { ComposeActionEvidence } from "@/components/agents/ComposeActionEvidence";
import { Skeleton } from "@/components/ui/skeleton";

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
  const direct = error as { error?: string; detail?: string; message?: string; details?: string | null };
  const data = (error as { response?: { data?: { error?: string; detail?: string; message?: string; details?: string | null } } })?.response?.data ?? direct;
  if (data?.error) return data.detail ? `${data.error}: ${data.detail}` : data.error;
  if (data?.message) return data.details ? `${data.message}: ${data.details}` : data.message;
  return fallback;
}

function composeFileName(path: string) {
  const trimmed = path.trim();
  return trimmed.split(/[\\/]/).pop() || trimmed;
}

function stackComposeFiles(stack: Stack) {
  const files = (stack.config_file ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  const overrideFile = stack.dokuru_override_file;
  if (overrideFile && (stack.dokuru_override_exists || stack.dokuru_override_active)) {
    const overrideFileName = composeFileName(overrideFile);
    const exists = files.some((path) => path === overrideFile || composeFileName(path) === overrideFileName);
    if (!exists) files.push(overrideFile);
  }

  return files;
}

function isOverrideComposeFile(path: string) {
  return composeFileName(path).includes(".override.");
}

const COMPOSE_DIALOG_MIN_WIDTH = 320;
const COMPOSE_DIALOG_MIN_HEIGHT = 420;
const COMPOSE_DIALOG_MARGIN = 24;

type DialogFrame = { left: number; top: number; width: number; height: number };
type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function centeredComposeDialogFrame(): DialogFrame {
  if (typeof window === "undefined") {
    return { left: 0, top: 0, width: 960, height: 720 };
  }
  const width = Math.min(1060, window.innerWidth - COMPOSE_DIALOG_MARGIN * 2);
  const height = Math.min(760, window.innerHeight - COMPOSE_DIALOG_MARGIN * 2);
  return {
    left: Math.max(COMPOSE_DIALOG_MARGIN, Math.round((window.innerWidth - width) / 2)),
    top: Math.max(COMPOSE_DIALOG_MARGIN, Math.round((window.innerHeight - height) / 2)),
    width,
    height,
  };
}

function clampComposeDialogFrame(frame: DialogFrame): DialogFrame {
  if (typeof window === "undefined") return frame;
  const maxWidth = Math.max(280, window.innerWidth - COMPOSE_DIALOG_MARGIN * 2);
  const maxHeight = Math.max(360, window.innerHeight - COMPOSE_DIALOG_MARGIN * 2);
  const minWidth = Math.min(COMPOSE_DIALOG_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(COMPOSE_DIALOG_MIN_HEIGHT, maxHeight);
  const width = Math.min(maxWidth, Math.max(minWidth, frame.width));
  const height = Math.min(maxHeight, Math.max(minHeight, frame.height));
  return {
    width,
    height,
    left: Math.min(window.innerWidth - COMPOSE_DIALOG_MARGIN - width, Math.max(COMPOSE_DIALOG_MARGIN, frame.left)),
    top: Math.min(window.innerHeight - COMPOSE_DIALOG_MARGIN - height, Math.max(COMPOSE_DIALOG_MARGIN, frame.top)),
  };
}

function resizeCursor(edge: ResizeEdge) {
  if (edge === "n" || edge === "s") return "ns-resize";
  if (edge === "e" || edge === "w") return "ew-resize";
  if (edge === "ne" || edge === "sw") return "nesw-resize";
  return "nwse-resize";
}

const resizeHandles: { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "left-4 right-4 top-0 h-2 -translate-y-1/2 cursor-n-resize" },
  { edge: "s", className: "bottom-0 left-4 right-4 h-2 translate-y-1/2 cursor-s-resize" },
  { edge: "e", className: "bottom-4 right-0 top-4 w-2 translate-x-1/2 cursor-e-resize" },
  { edge: "w", className: "bottom-4 left-0 top-4 w-2 -translate-x-1/2 cursor-w-resize" },
  { edge: "ne", className: "right-0 top-0 h-4 w-4 -translate-y-1/2 translate-x-1/2 cursor-ne-resize" },
  { edge: "nw", className: "left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize" },
  { edge: "se", className: "bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-se-resize" },
  { edge: "sw", className: "bottom-0 left-0 h-4 w-4 -translate-x-1/2 translate-y-1/2 cursor-sw-resize" },
];

// ---------- Compose file dialog ----------

function ComposeDialog({
  open,
  onClose,
  stackName,
  composePath,
  agentUrl,
  token,
}: {
  open: boolean;
  onClose: () => void;
  stackName: string;
  composePath: string;
  agentUrl: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dialogFrame, setDialogFrame] = useState<DialogFrame>(() => centeredComposeDialogFrame());
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ edge: ResizeEdge; startX: number; startY: number; frame: DialogFrame } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stack-compose", agentUrl, stackName, composePath],
    queryFn: async () => {
      const res = await dockerApi.getStackCompose(agentUrl, token, stackName, composePath);
      return res.data;
    },
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await dockerApi.updateStackCompose(agentUrl, token, stackName, content, composePath);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["stack-compose", agentUrl, stackName, composePath], updated);
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
    setIsEditing(false);
  }, [open, data?.content]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => setDialogFrame((current) => clampComposeDialogFrame(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  useEffect(() => {
    if (!isResizing) return;
    const previousCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.documentElement.style.userSelect;
    const resizeState = resizeRef.current;
    if (resizeState) document.documentElement.style.cursor = resizeCursor(resizeState.edge);
    document.documentElement.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const next = { ...state.frame };

      if (state.edge.includes("e")) next.width = state.frame.width + dx;
      if (state.edge.includes("s")) next.height = state.frame.height + dy;
      if (state.edge.includes("w")) {
        next.width = state.frame.width - dx;
        next.left = state.frame.left + dx;
      }
      if (state.edge.includes("n")) {
        next.height = state.frame.height - dy;
        next.top = state.frame.top + dy;
      }

      const clamped = clampComposeDialogFrame(next);
      const right = state.frame.left + state.frame.width;
      const bottom = state.frame.top + state.frame.height;
      if (state.edge.includes("w") && clamped.width === COMPOSE_DIALOG_MIN_WIDTH) clamped.left = right - clamped.width;
      if (state.edge.includes("n") && clamped.height === COMPOSE_DIALOG_MIN_HEIGHT) clamped.top = bottom - clamped.height;
      setDialogFrame(clampComposeDialogFrame(clamped));
    };

    const handlePointerUp = () => {
      resizeRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.documentElement.style.cursor = previousCursor;
      document.documentElement.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isResizing]);

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

  function startResize(edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { edge, startX: event.clientX, startY: event.clientY, frame: dialogFrame };
    setIsResizing(true);
  }

  const hasContent = data?.content !== undefined;
  const hasChanges = hasContent && draft !== data.content;
  const editorContent = isEditing ? draft : data?.content ?? "";
  const editorLineCount = Math.max(24, editorContent.split("\n").length + 1);
  const toolbarButtonClass = "h-8 rounded-md px-2.5 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground";
  const toolbarActiveClass = "border-[#2496ED]/30 bg-[#2496ED]/10 text-[#2496ED] hover:text-[#2496ED]";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={{
          left: dialogFrame.left,
          top: dialogFrame.top,
          width: dialogFrame.width,
          height: dialogFrame.height,
        }}
        className="compose-code-dialog !max-w-none !translate-x-0 !translate-y-0 flex flex-col gap-0 overflow-hidden p-0"
      >
        {resizeHandles.map((handle) => (
          <div
            key={handle.edge}
            aria-hidden="true"
            onPointerDown={(event) => startResize(handle.edge, event)}
            className={cn("absolute z-30 hidden touch-none sm:block", handle.className)}
          />
        ))}
        {/* Header */}
        <DialogHeader className="shrink-0 flex-col items-stretch justify-between gap-3 border-b border-border/60 px-4 py-4 text-left sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <FileCode2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate text-base font-semibold leading-tight">
                  {stackName}
                </DialogTitle>
                {isEditing && (
                  <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                    Editing
                  </span>
                )}
              </div>
              <DialogDescription className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {data?.path ?? composePath}
              </DialogDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {hasContent && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, showLineNumbers && toolbarActiveClass)}
                  onClick={() => setShowLineNumbers((value) => !value)}
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  Lines
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, wordWrap && toolbarActiveClass)}
                  onClick={() => setWordWrap(!wordWrap)}
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  Wrap
                </Button>
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md px-2.5 text-xs font-semibold"
                      onClick={handleCancelEdit}
                      disabled={saveMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Revert
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 min-w-20 gap-1.5 rounded-md px-3 text-xs font-semibold"
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
                      className={toolbarButtonClass}
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={toolbarButtonClass}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          {isEditing && (
            <div className="flex items-center gap-2 border-b border-white/8 bg-[#070b12] px-4 py-2 font-mono text-[11px] text-slate-400">
              <Save className="h-3.5 w-3.5 text-cyan-300" />
              <span className="text-slate-300">Save writes the compose file.</span>
              <span className="hidden text-slate-500 sm:inline">Use Compose Up when ready to apply.</span>
            </div>
          )}
          <div className="compose-code-panel flex-1 overflow-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/70 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600/80">
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
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-950/80 rounded-lg px-4 py-3 w-full">
                  {errorDetail.detail}
                </pre>
              )}
            </div>
          ) : isEditing ? (
            <div className="flex min-h-full">
              {showLineNumbers && <LineNumberGutter content={draft} />}
              <textarea
                rows={editorLineCount}
                className="block flex-1 resize-none bg-transparent p-5 font-mono text-xs leading-relaxed text-slate-100 outline-none selection:bg-cyan-500/30"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                wrap={wordWrap ? "soft" : "off"}
              />
            </div>
          ) : (
            <div className="flex min-h-full">
              {showLineNumbers && <LineNumberGutter content={editorContent} />}
              <pre className={`p-5 text-xs leading-relaxed font-mono text-slate-100 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                <YamlHighlight content={editorContent} />
              </pre>
            </div>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LineNumberGutter({ content }: { content: string }) {
  const count = Math.max(1, content.split("\n").length);
  return (
    <div className="sticky left-0 z-10 shrink-0 select-none border-r border-white/8 bg-[#070a10] px-3 py-5 text-right font-mono text-xs leading-relaxed text-slate-500">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="block min-w-8 tabular-nums">
          {index + 1}
        </span>
      ))}
    </div>
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
    return <span className="yaml-comment italic">{line}</span>;
  }
  // Top-level key (no leading spaces, ends with colon)
  if (/^[a-zA-Z_][a-zA-Z0-9_-]*\s*:/.test(line)) {
    const colon = line.indexOf(":");
    return (
      <>
        <span className="yaml-root-key font-semibold">{line.slice(0, colon)}</span>
        <span className="yaml-punctuation">:</span>
        <span className="yaml-plain">{line.slice(colon + 1)}</span>
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
        <span className="yaml-key">{m[2]}</span>
        <span className="yaml-punctuation">{m[3]}</span>
        <span className="yaml-value">{m[4]}</span>
      </>
    );
  }
  // List item "  - value"
  if (/^\s*-\s/.test(line)) {
    const dash = line.indexOf("-");
    return (
      <>
        <span>{line.slice(0, dash)}</span>
        <span className="yaml-punctuation">-</span>
        <span className="yaml-value">{line.slice(dash + 1)}</span>
      </>
    );
  }
  return <span className="yaml-plain">{line}</span>;
}

// ---------- Container row ----------

function ContainerRow({
  container,
  agentId,
}: {
  container: StackContainer;
  agentId: string;
}) {
  return (
    <Link
      to="/agents/$id/containers/$containerId"
      params={{ id: agentId, containerId: container.id }}
      search={{ from: "stacks" }}
      className="group/row flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/25 text-muted-foreground transition-colors group-hover/row:border-primary/30 group-hover/row:text-primary">
          <Container className="h-4 w-4" />
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background",
              stateDot(container.state),
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold transition-colors group-hover/row:text-foreground">
            {container.name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {container.image}
          </span>
          {container.status && (
            <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground/75 lg:hidden">
              {container.status}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
        {container.service && (
          <span className="max-w-[14rem] shrink-0 truncate rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {container.service}
          </span>
        )}

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
            stateColor(container.state),
          )}
        >
          {container.state}
        </span>

        {container.status && (
          <span className="hidden max-w-[18rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground/75 lg:inline">
            {container.status}
          </span>
        )}

        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground sm:block" />
      </div>
    </Link>
  );
}

type ComposeActionDialogProps = {
  action: "up" | "down";
  open: boolean;
  stackName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { action: "up"; forceRecreate: boolean } | { action: "down"; volumes: boolean }) => void;
};

function ComposeActionDialog({
  action,
  open,
  stackName,
  onOpenChange,
  onSubmit,
}: ComposeActionDialogProps) {
  const isUp = action === "up";
  const [forceRecreate, setForceRecreate] = useState(false);
  const [volumes, setVolumes] = useState(false);

  function handleSubmit() {
    if (isUp) {
      onSubmit({ action: "up", forceRecreate });
    } else {
      onSubmit({ action: "down", volumes });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUp ? <Play className="h-4 w-4 text-green-500" /> : <Power className="h-4 w-4 text-red-500" />}
            Compose {isUp ? "Up" : "Down"}
          </DialogTitle>
          <DialogDescription>
            Run Docker Compose {isUp ? "up" : "down"} for <span className="font-mono text-foreground">{stackName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isUp ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/35">
              <Checkbox checked={forceRecreate} onCheckedChange={(checked) => setForceRecreate(checked === true)} className="mt-0.5" />
              <span className="space-y-1 text-sm">
                <span className="block font-medium">Force recreate</span>
                <span className="block text-xs text-muted-foreground">Recreate containers even if their configuration hasn't changed.</span>
              </span>
            </label>
          ) : (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/35">
                <Checkbox checked={volumes} onCheckedChange={(checked) => setVolumes(checked === true)} className="mt-0.5" />
                <span className="space-y-1 text-sm">
                  <span className="block font-medium">Remove volumes</span>
                  <span className="block text-xs text-muted-foreground">Remove named and anonymous volumes declared by this Compose project.</span>
                </span>
              </label>
              {volumes && (
                <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                  Warning: This can delete persistent application data.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={isUp ? "default" : "destructive"} onClick={handleSubmit}>
            {isUp ? <Play className="h-4 w-4 mr-2" /> : <Power className="h-4 w-4 mr-2" />}
            {isUp ? "Start" : "Stop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Stack card ----------

function StackCardSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border/50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <Skeleton className="h-7 w-44 max-w-[45vw]" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>

            <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-40 rounded-md" />
              <Skeleton className="h-8 w-48 rounded-md" />
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-52 lg:w-44 lg:grid-cols-1">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        </div>
      </div>

      <div className="border-b border-border/50 bg-muted/10 px-4 py-2.5 sm:px-5">
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="divide-y divide-border/40">
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
            <Skeleton className="size-9 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [selectedComposePath, setSelectedComposePath] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<"up" | "down" | null>(null);
  const [expanded, setExpanded] = useState(true);
  const accessToken = useAuthStore((state) => state.accessToken);
  const startAction = useComposeActionStore((state) => state.startAction);
  const composeRuns = useComposeActionStore((state) => state.runs);

  function openComposeAction(action: "up" | "down") {
    if (isStackActionRunning) return;
    setActionDialog(action);
  }

  function handleStartComposeAction(payload: { action: "up"; forceRecreate: boolean } | { action: "down"; volumes: boolean }) {
    setActionDialog(null);
    startAction(agentId, agentUrl, token, stack.name, payload.action, payload, accessToken);
  }

  const allRunning = stack.total > 0 && stack.running === stack.total;
  const noneRunning = stack.running === 0;
  const activeStackRun = composeRuns.find((run) => run.agentId === agentId && run.stackName === stack.name && run.isRunning);
  const isStackActionRunning = Boolean(activeStackRun);

  const statusLabel = allRunning ? "running" : noneRunning ? "stopped" : "partial";
  const statusClass = allRunning
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
    : noneRunning
    ? "border-border bg-muted/30 text-muted-foreground"
    : "border-amber-500/25 bg-amber-500/10 text-amber-500 dark:text-amber-400";
  const statusDotClass = allRunning ? "bg-emerald-500" : noneRunning ? "bg-muted-foreground/60" : "bg-amber-500";
  const overrideLabel = stack.dokuru_override_active
    ? "Dokuru override active"
    : stack.dokuru_override_exists
    ? "Override file exists"
    : "No Dokuru override";
  const overrideClass = stack.dokuru_override_active
    ? "border-border/70 bg-muted/20 text-foreground"
    : stack.dokuru_override_exists
    ? "border-border/70 bg-muted/20 text-muted-foreground"
    : "border-border bg-muted/30 text-muted-foreground";
  const composeFiles = stackComposeFiles(stack);
  const activeComposePath = selectedComposePath ?? composeFiles[0] ?? null;
  const hasContainers = stack.containers.length > 0;
  const containerLabel = `${stack.total} container${stack.total === 1 ? "" : "s"}`;
  const hasOverride = stack.dokuru_override_active || stack.dokuru_override_exists;
  const runningPercent = stack.total > 0 ? Math.round((stack.running / stack.total) * 100) : 0;

  function openComposeFile(path: string) {
    setSelectedComposePath(path);
    setComposeOpen(true);
  }

  const iconColor = allRunning ? "text-primary" : noneRunning ? "text-muted-foreground" : "text-amber-500";

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border/50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/25">
                  <Layers className={cn("h-4 w-4", iconColor)} />
                </span>
                <h3 className="min-w-0 truncate text-xl font-bold tracking-tight text-foreground">{stack.name}</h3>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                    statusClass,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass)} />
                  {statusLabel}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    Running
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{stack.running}</span>
                    <span className="text-sm font-medium text-muted-foreground">of {stack.total}</span>
                    <span className="ml-auto rounded-md border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {runningPercent}%
                    </span>
                  </div>
                </div>

                <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Working directory
                  </div>
                  <span className="mt-2 block truncate font-mono text-sm text-foreground/85" title={stack.working_dir ?? undefined}>
                    {stack.working_dir || "Not reported"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Compose
                </span>
                {composeFiles.map((path) => {
                  const isOverride = isOverrideComposeFile(path);
                  return (
                    <button
                      key={path}
                      title={path}
                      onClick={() => openComposeFile(path)}
                      className={cn(
                        "group/compose inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        isOverride
                          ? "border-border/70 bg-muted/20 text-foreground hover:bg-muted/35"
                          : "border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                      )}
                    >
                      {isOverride ? (
                        <FileCode2 className="h-3 w-3 shrink-0" />
                      ) : (
                        <FileText className="h-3 w-3 shrink-0" />
                      )}
                      <span className="font-semibold uppercase tracking-widest text-muted-foreground/70">
                        {isOverride ? "override" : "base"}
                      </span>
                      <span className="max-w-[12rem] truncate font-mono text-foreground/85 sm:max-w-[18rem]">
                        {composeFileName(path)}
                      </span>
                    </button>
                  );
                })}
                {!hasOverride && (
                  <span
                    title={stack.dokuru_override_file ?? undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium opacity-80",
                      overrideClass,
                    )}
                  >
                    <FileCode2 className="h-3 w-3 shrink-0" />
                    {overrideLabel}
                  </span>
                )}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-52 lg:w-44 lg:grid-cols-1">
                <Button
                  size="sm"
                  className="h-9 gap-1.5 px-4 text-xs font-bold shadow-sm disabled:opacity-60"
                  onClick={() => openComposeAction("up")}
                  disabled={isStackActionRunning}
                >
                  {activeStackRun?.action === "up" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-destructive/30 bg-destructive/5 px-4 text-xs font-bold text-destructive shadow-sm hover:bg-destructive/10 disabled:opacity-60"
                  onClick={() => openComposeAction("down")}
                  disabled={noneRunning || isStackActionRunning}
                >
                  {activeStackRun?.action === "down" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                  Down
                </Button>
            </div>
          </div>
        </div>

        {hasContainers ? (
          <div>
            <div className="flex flex-col gap-2 border-b border-border/50 bg-muted/10 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Container className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-foreground">Containers</span>
                <span className="text-muted-foreground">
                  {stack.running}/{stack.total} running
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-fit gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
              >
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
                {expanded ? "Hide list" : `Show ${containerLabel}`}
              </Button>
            </div>

            {expanded && (
              <div className="divide-y divide-border/40">
                {stack.containers.map((c) => (
                  <ContainerRow key={c.id} container={c} agentId={agentId} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-border/50 bg-muted/10 px-4 py-3 text-sm text-muted-foreground sm:px-5">
            No containers reported for this stack.
          </div>
        )}
      </div>

      {activeComposePath && (
        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          stackName={stack.name}
          composePath={activeComposePath}
          agentUrl={agentUrl}
          token={token}
        />
      )}
      {actionDialog && (
        <ComposeActionDialog
          action={actionDialog}
          open={!!actionDialog}
          stackName={stack.name}
          onOpenChange={(open) => !open && setActionDialog(null)}
          onSubmit={handleStartComposeAction}
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
  useWindowScrollMemory(`agent:${id}:stacks`, !isLoading && !!stacks);

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
  const runningStacks = filtered.filter((s) => s.running > 0).length;

  return (
    <>
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        icon={Layers}
        title="Stacks"
        loading={isLoading}
        stats={[
          { value: `${runningStacks}/${filtered.length}`, label: "stacks running" },
          { value: `${totalRunning}/${totalContainers}`, label: "containers running" },
        ]}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="h-9 w-full bg-muted/40 pl-9 text-sm border-border/60 focus:bg-background sm:w-56"
            placeholder="Search stacks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageHeader>

      <div className="space-y-3">
        {/* Content */}
        {isLoading ? (
          <StackCardSkeleton />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border/50 bg-muted/10 p-20 text-center">
            <div className="flex justify-center mb-5">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center border border-border/50">
                <Layers className="h-8 w-8 text-muted-foreground/50" />
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
    <ComposeActionEvidence />
    </>
  );
}
