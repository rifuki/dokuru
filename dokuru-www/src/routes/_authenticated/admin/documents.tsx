import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, FileText, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/documents")({
  component: DocumentsManagement,
});

function DocumentsManagement() {
  const [uploading, setUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
    } else {
      toast.error("Please select a PDF file");
    }
  };

  const handleUpload = async () => {
    if (!pdfFile) return;
    setUploading(true);
    
    // TODO: Implement upload to backend
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast.success("PDF uploaded successfully");
    setUploading(false);
    setPdfFile(null);
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Documents Management</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage CIS Docker Benchmark PDF and other documents
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
          <h3 className="text-lg font-semibold">Upload CIS Benchmark PDF</h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="flex-1 text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button onClick={handleUpload} disabled={!pdfFile || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
          {pdfFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>
      </div>

      {/* Current Documents */}
      <div className="rounded-xl border bg-card">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Current Documents</h3>
        </div>
        
        <div className="divide-y">
          {/* Example document */}
          <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">CIS Docker Benchmark v1.8.0</p>
                <p className="text-xs text-muted-foreground">Uploaded on 4/22/2026 • 2.4 MB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          
          {/* Empty state */}
          <div className="p-8 text-center text-muted-foreground text-sm">
            No documents uploaded yet
          </div>
        </div>
      </div>
    </div>
  );
}
