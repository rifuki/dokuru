import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FileText, Trash2, RefreshCw, Upload,
  FileUp, X, CalendarDays, HardDrive, Loader2, CloudUpload,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { documentApi, type Document as DocType } from "@/lib/api/document";
import { getOrFetchPdfBlob, invalidatePdfCache } from "@/lib/pdf-cache";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export const Route = createFileRoute("/_authenticated/admin/documents")({
  component: DocumentsManagement,
});

/* ─── PDF blob hook ─────────────────────────────────────────────────────────── */

type PdfState = { blobUrl: string | null; isLoading: boolean };
type PdfAction =
  | { type: "start" }
  | { type: "done"; url: string }
  | { type: "fail" };

function pdfReducer(_: PdfState, action: PdfAction): PdfState {
  if (action.type === "start") return { blobUrl: null, isLoading: true };
  if (action.type === "done") return { blobUrl: action.url, isLoading: false };
  return { blobUrl: null, isLoading: false };
}

function usePdfBlob(docId: string | undefined) {
  const [{ blobUrl, isLoading }, dispatch] = useReducer(pdfReducer, {
    blobUrl: null,
    isLoading: false,
  });

  useEffect(() => {
    if (!docId) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    dispatch({ type: "start" });

    getOrFetchPdfBlob(docId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        dispatch({ type: "done", url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "fail" });
      });

    return () => {
      cancelled = true;
      setTimeout(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, 2000);
    };
  }, [docId]);

  return { blobUrl, isLoading };
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */

function DocumentsManagement() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: currentDoc, isLoading } = useQuery({
    queryKey: ["current-document"],
    queryFn: documentApi.getCurrent,
  });

  const uploadMutation = useMutation({
    mutationFn: documentApi.upload,
    onSuccess: async () => {
      if (currentDoc) await invalidatePdfCache(currentDoc.id);
      toast.success("PDF uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["current-document"] });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: () => toast.error("Failed to upload PDF"),
  });

  const deleteMutation = useMutation({
    mutationFn: documentApi.delete,
    onSuccess: async () => {
      if (currentDoc) await invalidatePdfCache(currentDoc.id);
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["current-document"] });
      setSelectedFile(null);
    },
    onError: () => toast.error("Failed to delete PDF"),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      toast.error("Please select a PDF file");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fmt = {
    size: (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`,
    date: (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };

  return (
    // -m-6 cancels parent p-6; height locks to viewport minus 64px sticky header
    <div className="-m-6 h-[calc(100vh-4rem)] overflow-hidden">
      <div className="h-full p-4">
        {isLoading ? (
          <LoadingState />
        ) : currentDoc ? (
          <SplitLayout
            doc={currentDoc}
            selectedFile={selectedFile}
            isPendingUpload={uploadMutation.isPending}
            isPendingDelete={deleteMutation.isPending}
            onPickFile={() => fileInputRef.current?.click()}
            onUpload={() => { if (selectedFile) uploadMutation.mutate(selectedFile); }}
            onCancelSelection={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            onDelete={() => {
              if (confirm(`Delete "${currentDoc.name}"?`)) deleteMutation.mutate(currentDoc.id);
            }}
            fmt={fmt}
          />
        ) : (
          <EmptyState
            selectedFile={selectedFile}
            isPending={uploadMutation.isPending}
            onPickFile={() => fileInputRef.current?.click()}
            onUpload={() => { if (selectedFile) uploadMutation.mutate(selectedFile); }}
            onCancel={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            fmt={fmt}
          />
        )}
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
      </div>
    </div>
  );
}

/* ─── Split layout (document exists) ───────────────────────────────────────── */

interface SplitLayoutProps {
  doc: DocType;
  selectedFile: File | null;
  isPendingUpload: boolean;
  isPendingDelete: boolean;
  onPickFile: () => void;
  onUpload: () => void;
  onCancelSelection: () => void;
  onDelete: () => void;
  fmt: { size: (b: number) => string; date: (d: string) => string };
}

function SplitLayout({ doc, selectedFile, isPendingUpload, isPendingDelete, onPickFile, onUpload, onCancelSelection, onDelete, fmt }: SplitLayoutProps) {
  const { blobUrl, isLoading: isPdfLoading } = usePdfBlob(doc.id);
  const [panelOpen, setPanelOpen] = useState(false);
  const [thumbWidth, setThumbWidth] = useState(220);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!thumbRef.current) return;
    const ro = new ResizeObserver(([e]) => setThumbWidth(Math.floor(e.contentRect.width) - 2));
    ro.observe(thumbRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex gap-4 h-full overflow-hidden">

      {/* ── Left panel (collapsible) ── */}
      {panelOpen && (
        <div className="w-64 shrink-0 flex flex-col gap-3 overflow-y-auto min-h-0">
          {/* Document card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
            {/* First-page thumbnail */}
            <div ref={thumbRef} className="bg-muted/40 border-b flex items-center justify-center overflow-hidden" style={{ minHeight: 190 }}>
              {isPdfLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[11px]">Loading…</span>
                </div>
              ) : blobUrl ? (
                <Document file={blobUrl} loading={null} error={<DocIconFallback />} className="w-full flex justify-center py-3">
                  <Page pageNumber={1} width={thumbWidth} renderAnnotationLayer={false} renderTextLayer={false} loading={null} error={null} />
                </Document>
              ) : (
                <DocIconFallback />
              )}
            </div>

            {/* Metadata + actions */}
            <div className="p-4 space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5">
                <FileText className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-bold tracking-wider text-primary uppercase">PDF</span>
              </div>
              <p className="font-semibold text-sm leading-snug line-clamp-3 break-words" title={doc.name}>{doc.name}</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5 shrink-0" /><span>{fmt.size(doc.file_size)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" /><span>{fmt.date(doc.uploaded_at)}</span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5" onClick={onPickFile} disabled={isPendingUpload || isPendingDelete}>
                  <FileUp className="h-3.5 w-3.5" />Replace
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-9 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/25 hover:border-destructive/40" onClick={onDelete} disabled={isPendingUpload || isPendingDelete}>
                  {isPendingDelete ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Pending replace confirmation */}
          {selectedFile && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmt.size(selectedFile.size)}</p>
                </div>
                <button onClick={onCancelSelection} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={onUpload} disabled={isPendingUpload}>
                {isPendingUpload ? <><RefreshCw className="h-3 w-3 animate-spin" />Replacing…</> : <><Upload className="h-3 w-3" />Confirm Replace</>}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Right panel: PDF viewer (always fills remaining space) ── */}
      <div className="flex-1 min-w-0 min-h-0 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
        {/* Thin chrome bar */}
        <div className="h-9 border-b bg-muted/30 px-3 flex items-center gap-2 shrink-0">
          {/* Panel toggle */}
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            title={panelOpen ? "Hide panel" : "Show panel"}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            {panelOpen
              ? <PanelLeftClose className="h-3.5 w-3.5" />
              : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </button>

          <div className="w-px h-3.5 bg-border shrink-0" />

          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{doc.name}</span>

          <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-full shrink-0">
            {fmt.size(doc.file_size)}
          </span>
        </div>

        {/* Viewer — iframe fills all remaining height, PDF scrolls inside */}
        <div className="flex-1 min-h-0">
          {isPdfLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">Loading document…</span>
            </div>
          ) : blobUrl ? (
            <iframe src={blobUrl} className="w-full h-full border-0" title={doc.name} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-30" />
              <span className="text-sm">Preview unavailable</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  selectedFile: File | null;
  isPending: boolean;
  onPickFile: () => void;
  onUpload: () => void;
  onCancel: () => void;
  fmt: { size: (b: number) => string };
}

function EmptyState({ selectedFile, isPending, onPickFile, onUpload, onCancel, fmt }: EmptyStateProps) {
  return (
    <div className="h-full overflow-y-auto flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        {/* Big upload area */}
        <button
          type="button"
          onClick={onPickFile}
          className="w-full rounded-2xl border-2 border-dashed border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all group p-12 flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
            <CloudUpload className="h-9 w-9 text-muted-foreground group-hover:text-primary/70 transition-colors" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-sm">No document uploaded yet</p>
            <p className="text-xs text-muted-foreground">Click to upload the CIS Docker Benchmark PDF</p>
          </div>
        </button>

        {/* Selected file */}
        {selectedFile ? (
          <div className="w-full space-y-3">
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmt.size(selectedFile.size)}</p>
                  </div>
                </div>
                <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={onUpload} disabled={isPending}>
              {isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><Upload className="h-4 w-4" /> Upload PDF</>}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="gap-2" onClick={onPickFile}>
            <Upload className="h-4 w-4" />
            Choose PDF File
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="flex gap-5 h-full overflow-hidden">
      <div className="w-64 shrink-0 rounded-xl border bg-card animate-pulse">
        <div className="h-52 bg-muted" />
        <div className="p-4 space-y-3">
          <div className="h-3 bg-muted rounded-full w-2/3" />
          <div className="h-3 bg-muted rounded-full w-1/2" />
          <div className="h-3 bg-muted rounded-full w-3/4" />
          <div className="h-8 bg-muted rounded-lg mt-4" />
        </div>
      </div>
      <div className="flex-1 rounded-xl border bg-card animate-pulse" />
    </div>
  );
}

function DocIconFallback() {
  return (
    <div className="flex items-center justify-center py-12 w-full">
      <div className="w-20 h-24 rounded-md border-2 border-border/50 bg-card flex flex-col overflow-hidden shadow-sm">
        <div className="h-6 bg-primary/10 border-b border-border/30 flex items-center px-2 gap-1">
          <FileText className="h-3 w-3 text-primary" />
          <span className="text-[7px] font-bold text-primary tracking-wider uppercase">PDF</span>
        </div>
        <div className="flex-1 px-2 py-2 space-y-1.5">
          {[90, 70, 85, 60, 80].map((w, i) => (
            <div key={i} className="h-[2px] rounded-full bg-muted-foreground/20" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
