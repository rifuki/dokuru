import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, FileText, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { documentApi, type Document } from "@/lib/api/document";

export const Route = createFileRoute("/_authenticated/admin/documents")({
  component: DocumentsManagement,
});

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
    onSuccess: () => {
      toast.success("PDF uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["current-document"] });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: () => {
      toast.error("Failed to upload PDF");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: documentApi.delete,
    onSuccess: () => {
      toast.success("PDF deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["current-document"] });
    },
    onError: () => {
      toast.error("Failed to delete PDF");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      toast.error("Please select a PDF file");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  };

  const handleDelete = (doc: Document) => {
    if (confirm(`Delete "${doc.name}"?`)) {
      deleteMutation.mutate(doc.id);
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Documents Management</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage CIS Docker Benchmark PDF
          </p>
        </div>
        <Link to="/admin">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </Link>
      </div>

      {/* Upload Section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {currentDoc ? "Replace CIS Benchmark PDF" : "Upload CIS Benchmark PDF"}
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="flex-1 text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : currentDoc ? (
                "Replace"
              ) : (
                "Upload"
              )}
            </Button>
          </div>
          {selectedFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          )}
        </div>
      </div>

      {/* Current Document */}
      <div className="rounded-xl border bg-card">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Current Document</h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : currentDoc ? (
          <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{currentDoc.name}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded on {formatDate(currentDoc.uploaded_at)} • {formatFileSize(currentDoc.file_size)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(currentDoc)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No document uploaded yet
          </div>
        )}
      </div>
    </div>
  );
}
