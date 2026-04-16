"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  title?: string;
  description?: string;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  isAvatar?: boolean;
}

type ModalStatus = 'idle' | 'selecting' | 'preview' | 'uploading' | 'success';

export function ImageUploadModal({
  isOpen,
  onClose,
  onUpload,
  title = "Upload Image",
  description = "Select an image to upload. Maximum file size is 5MB.",
  maxSizeMB = 5,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  isAvatar = false,
}: ImageUploadModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const acceptedExtensions = acceptedTypes.map(t => t.split('/')[1]).join(', ');

  const validateFile = useCallback((file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return `Invalid file type. Accepted: ${acceptedExtensions}`;
    }
    if (file.size > maxSizeBytes) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }
    return null;
  }, [acceptedTypes, acceptedExtensions, maxSizeBytes, maxSizeMB]);

  const createPreview = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setErrorMessage(null);
    const error = validateFile(selectedFile);
    if (error) {
      setErrorMessage(error);
      // If we had a previous image, keep it on screen so we don't drop the user back to empty
      if (!previewUrl) {
        setStatus('idle');
      }
      return;
    }

    try {
      const url = await createPreview(selectedFile);
      setFile(selectedFile);
      setPreviewUrl(url);
      setStatus('preview');
    } catch {
      setErrorMessage('Failed to preview image');
      if (!previewUrl) setStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSizeMB, acceptedTypes, previewUrl, validateFile, createPreview]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (status === 'idle') {
      setStatus('selecting');
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0 && status === 'selecting') {
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setProgress(0);
    setErrorMessage(null);

    // Simulate progress updates for UX
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 90) return prev + 10;
        return prev;
      });
    }, 200);

    try {
      await onUpload(file);
      clearInterval(progressInterval);
      setProgress(100);
      setStatus('success');
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      clearInterval(progressInterval);
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
      setStatus('preview');
    }
  };

  const handleClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setStatus('idle');
    setFile(null);
    setPreviewUrl(null);
    setProgress(0);
    setErrorMessage(null);
    onClose();
  };

  const isDragging = status === 'selecting';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
        />

        <div className="mt-4">
          {/* Error Information */}
          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Preview / Uploading / Success State */}
          {(status === 'preview' || status === 'uploading' || status === 'success') && previewUrl && (
            <div className="space-y-6 py-4 animate-in fade-in">
              <div className="flex justify-center flex-col items-center gap-4">
                <div
                  className={cn(
                    "relative overflow-hidden border bg-muted shadow-sm group",
                    isAvatar ? "w-48 h-48 rounded-full" : "w-64 h-64 rounded-lg",
                    (status === 'uploading' || status === 'success') && "opacity-80 pointer-events-none"
                  )}
                >
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />

                  {/* Edit Overlay (Shown on Hover when previewing) */}
                  {status === 'preview' && (
                    <div
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Pencil className="h-8 w-8" />
                        <span className="text-sm font-medium">Change Photo</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload Progress Indicator beneath the image */}
                {status === 'uploading' && (
                  <div className="w-full max-w-[12rem] space-y-2 mt-2">
                    <p className="text-center text-sm font-medium animate-pulse">Uploading... {progress}%</p>
                    <Progress value={progress} className="h-2 w-full" />
                  </div>
                )}

                {/* Success Message beneath the image */}
                {status === 'success' && (
                  <div className="w-full flex-col items-center space-y-1 mt-2 animate-in zoom-in fade-in duration-300">
                    <div className="flex items-center justify-center gap-2 text-primary font-medium">
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Upload successful!</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleClose()}
                  disabled={status === 'uploading' || status === 'success'}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={status === 'uploading' || status === 'success'}
                >
                  {status === 'uploading' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : status === 'success' ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {status === 'uploading' ? 'Uploading...' : status === 'success' ? 'Success' : 'Upload'}
                </Button>
              </div>
            </div>
          )}

          {/* Idle/Selecting State */}
          {(status === 'idle' || status === 'selecting') && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              className={cn(
                "relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer",
                "hover:border-primary/50 hover:bg-muted/50",
                isDragging && "border-primary bg-primary/5"
              )}
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {acceptedExtensions.toUpperCase()} up to {maxSizeMB}MB
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
