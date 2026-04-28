"use client";

import { useState, useRef, useCallback } from "react";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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
  Loader2,
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

const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_SOURCE_MAX_SIZE_MB = 20;
const AVATAR_EXPORT_TYPE = "image/webp";
const AVATAR_EXPORT_QUALITY = 0.9;
const GIF_EXPORT_TYPE = "image/gif";
const GIF_PALETTE_FORMAT = "rgba4444";

const blobExtensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const fileTypeLabels: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

function formatList(items: string[]) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;

  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

function formatAcceptedTypes(types: string[]) {
  return formatList(types.map(type => fileTypeLabels[type] || type.split('/')[1]?.toUpperCase() || type));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Failed to prepare cropped image"));
    }, type, quality);
  });
}

function getCenteredAvatarCrop(width: number, height: number) {
  const crop = width > height
    ? { unit: "%" as const, height: 100 }
    : { unit: "%" as const, width: 100 };

  return centerCrop(
    makeAspectCrop(crop, 1, width, height),
    width,
    height
  );
}

function getAvatarSourceCrop(image: HTMLImageElement, crop: PercentCrop) {
  const x = Math.max(0, (crop.x / 100) * image.naturalWidth);
  const y = Math.max(0, (crop.y / 100) * image.naturalHeight);

  return {
    x,
    y,
    width: Math.min(image.naturalWidth - x, (crop.width / 100) * image.naturalWidth),
    height: Math.min(image.naturalHeight - y, (crop.height / 100) * image.naturalHeight),
  };
}

function drawCroppedAvatar(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  crop: ReturnType<typeof getAvatarSourceCrop>
) {
  ctx.clearRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE
  );
}

export function ImageUploadModal({
  isOpen,
  onClose,
  onUpload,
  title = "Upload Image",
  description = "Select an image to upload. Maximum file size is 5MB.",
  maxSizeMB = 5,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  isAvatar = false,
}: ImageUploadModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<Crop>();
  const [completedAvatarCrop, setCompletedAvatarCrop] = useState<PercentCrop | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarImageRef = useRef<HTMLImageElement>(null);
  const dragCounter = useRef(0);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  const sourceMaxSizeMB = isAvatar ? Math.max(AVATAR_SOURCE_MAX_SIZE_MB, maxSizeMB) : maxSizeMB;
  const sourceMaxSizeBytes = sourceMaxSizeMB * 1024 * 1024;
  const acceptedFileTypes = formatAcceptedTypes(acceptedTypes);

  const validateFile = useCallback((file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return `Invalid file type. Accepted: ${acceptedFileTypes}`;
    }

    if (isAvatar) {
      if (file.size > sourceMaxSizeBytes) {
        return `File too large. Maximum source size: ${sourceMaxSizeMB}MB`;
      }

      return null;
    }

    if (file.size > maxSizeBytes) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }
    return null;
  }, [acceptedTypes, acceptedFileTypes, isAvatar, maxSizeBytes, maxSizeMB, sourceMaxSizeBytes, sourceMaxSizeMB]);

  const createPreview = useCallback((file: File): string => {
    return URL.createObjectURL(file);
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
      const url = createPreview(selectedFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setFile(selectedFile);
      setPreviewUrl(url);
      setAvatarCrop(undefined);
      setCompletedAvatarCrop(null);
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

  const handleAvatarImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const image = e.currentTarget;
    const nextCrop = getCenteredAvatarCrop(image.width, image.height);

    avatarImageRef.current = image;
    setAvatarCrop(nextCrop);
    setCompletedAvatarCrop(nextCrop);
  };

  const createStaticAvatarFile = async (sourceFile: File) => {
    const image = avatarImageRef.current;
    const crop = completedAvatarCrop;
    if (!image || !crop?.width || !crop?.height) {
      throw new Error("Failed to crop image");
    }

    const sourceCrop = getAvatarSourceCrop(image, crop);
    if (sourceCrop.width <= 0 || sourceCrop.height <= 0) {
      throw new Error("Failed to crop image");
    }

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to prepare cropped image");
    }

    drawCroppedAvatar(ctx, image, sourceCrop);

    const blob = await canvasToBlob(canvas, AVATAR_EXPORT_TYPE, AVATAR_EXPORT_QUALITY);
    if (blob.size > maxSizeBytes) {
      throw new Error(`Cropped file is still too large. Maximum size: ${maxSizeMB}MB`);
    }

    const extension = blobExtensionByType[blob.type] || "webp";
    const basename = sourceFile.name.replace(/\.[^.]+$/, "") || "avatar";

    return new File([blob], `${basename}-avatar.${extension}`, {
      type: blob.type || AVATAR_EXPORT_TYPE,
      lastModified: Date.now(),
    });
  };

  const createAnimatedGifAvatarFile = async (sourceFile: File) => {
    const image = avatarImageRef.current;
    const crop = completedAvatarCrop;
    if (!image || !crop?.width || !crop?.height) {
      throw new Error("Failed to crop image");
    }

    const sourceCrop = getAvatarSourceCrop(image, crop);
    if (sourceCrop.width <= 0 || sourceCrop.height <= 0) {
      throw new Error("Failed to crop image");
    }

    const parsedGif = parseGIF(await sourceFile.arrayBuffer());
    const frames = decompressFrames(parsedGif, true);
    if (!frames.length) {
      throw new Error("Failed to read animated GIF");
    }

    const gifCanvas = document.createElement("canvas");
    gifCanvas.width = parsedGif.lsd.width;
    gifCanvas.height = parsedGif.lsd.height;

    const gifCtx = gifCanvas.getContext("2d");
    if (!gifCtx) {
      throw new Error("Failed to prepare animated GIF");
    }

    const patchCanvas = document.createElement("canvas");
    const patchCtx = patchCanvas.getContext("2d");
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = AVATAR_OUTPUT_SIZE;
    outputCanvas.height = AVATAR_OUTPUT_SIZE;
    const outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });

    if (!patchCtx || !outputCtx) {
      throw new Error("Failed to prepare animated GIF");
    }

    const gif = GIFEncoder();
    let previousFrame: ParsedFrame | null = null;
    let restoreImageData: ImageData | null = null;

    for (const frame of frames) {
      if (previousFrame?.disposalType === 2) {
        gifCtx.clearRect(
          previousFrame.dims.left,
          previousFrame.dims.top,
          previousFrame.dims.width,
          previousFrame.dims.height
        );
      } else if (previousFrame?.disposalType === 3 && restoreImageData) {
        gifCtx.putImageData(restoreImageData, previousFrame.dims.left, previousFrame.dims.top);
      }

      restoreImageData = frame.disposalType === 3
        ? gifCtx.getImageData(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
        : null;

      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const patchImageData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
      patchImageData.data.set(frame.patch);
      patchCtx.putImageData(patchImageData, 0, 0);
      gifCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

      drawCroppedAvatar(outputCtx, gifCanvas, sourceCrop);
      const imageData = outputCtx.getImageData(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      const palette = quantize(imageData.data, 256, {
        format: GIF_PALETTE_FORMAT,
        oneBitAlpha: true,
      });
      const index = applyPalette(imageData.data, palette, GIF_PALETTE_FORMAT);
      const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) < 128);

      gif.writeFrame(index, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, {
        palette,
        delay: frame.delay || 100,
        repeat: 0,
        transparent: transparentIndex >= 0,
        transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
        dispose: transparentIndex >= 0 ? 2 : 1,
      });

      previousFrame = frame;
    }

    gif.finish();

    const blob = new Blob([gif.bytes()], { type: GIF_EXPORT_TYPE });
    if (blob.size > maxSizeBytes) {
      throw new Error(`Cropped file is still too large. Maximum size: ${maxSizeMB}MB`);
    }

    const basename = sourceFile.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${basename}-avatar.gif`, {
      type: GIF_EXPORT_TYPE,
      lastModified: Date.now(),
    });
  };

  const createAvatarFile = async (sourceFile: File) => {
    if (sourceFile.type === GIF_EXPORT_TYPE) {
      return createAnimatedGifAvatarFile(sourceFile);
    }

    return createStaticAvatarFile(sourceFile);
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
      const uploadFile = isAvatar ? await createAvatarFile(file) : file;
      await onUpload(uploadFile);
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

  const resetSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setStatus('idle');
    setFile(null);
    setPreviewUrl(null);
    setProgress(0);
    setErrorMessage(null);
    setAvatarCrop(undefined);
    setCompletedAvatarCrop(null);
  };

  const handleBack = () => {
    resetSelection();
  };

  const handleClose = () => {
    resetSelection();
    onClose();
  };

  const isDragging = status === 'selecting';
  const isBusy = status === 'uploading' || status === 'success';
  const isAvatarCropView = isAvatar && !!previewUrl && (status === 'preview' || status === 'uploading' || status === 'success');
  const uploadHint = isAvatar
    ? `${acceptedFileTypes} • Max ${sourceMaxSizeMB} MB`
    : `${acceptedFileTypes} • Max ${maxSizeMB} MB`;
  const uploadSubHint = isAvatar ? `Final avatar stays under ${maxSizeMB} MB.` : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md",
          isAvatarCropView && "gap-0 p-0 sm:max-w-[28rem]"
        )}
      >
        <DialogHeader className={cn(isAvatarCropView && "border-b border-border/60 px-5 py-4 pr-12")}>
          <DialogTitle className={cn("flex items-center gap-2", isAvatarCropView && "text-base")}>
            {!isAvatarCropView && <ImageIcon className="h-5 w-5" />}
            {isAvatarCropView ? "Crop your new profile picture" : title}
          </DialogTitle>
          {!isAvatarCropView && (
            <DialogDescription className={cn(isAvatar && "leading-relaxed")}>{description}</DialogDescription>
          )}
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
        />

        <div className={cn(isAvatarCropView ? "mt-0" : "mt-4")}>
          {/* Error Information */}
          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Preview / Uploading / Success State */}
          {(status === 'preview' || status === 'uploading' || status === 'success') && previewUrl && (
            <div className={cn("animate-in fade-in", isAvatarCropView ? "space-y-0" : "space-y-6 py-4")}>
              <div className={cn(
                "flex justify-center flex-col items-center",
                isAvatarCropView ? "gap-0 bg-black" : "gap-4"
              )}>
                <div
                  className={cn(
                    "relative overflow-hidden border bg-muted shadow-sm group",
                    isAvatar ? "w-full border-0 bg-black shadow-none" : "w-64 h-64 rounded-lg",
                    isBusy && "opacity-80 pointer-events-none"
                  )}
                >
                  {isAvatar && file ? (
                    <div className="flex justify-center bg-black p-4">
                      <ReactCrop
                        crop={avatarCrop}
                        onChange={(_, percentCrop) => setAvatarCrop(percentCrop)}
                        onComplete={(_, percentCrop) => setCompletedAvatarCrop(percentCrop)}
                        aspect={1}
                        keepSelection
                        minWidth={96}
                        className={cn(
                          "max-h-[min(62dvh,34rem)] max-w-full",
                          "[&_.ReactCrop__crop-selection]:border-white/90",
                          "[&_.ReactCrop__drag-handle]:bg-white",
                          "[&_.ReactCrop__drag-handle]:border-2",
                          "[&_.ReactCrop__drag-handle]:border-black/40"
                        )}
                        renderSelectionAddon={() => (
                          <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
                        )}
                      >
                        <img
                          ref={avatarImageRef}
                          src={previewUrl}
                          alt="Crop preview"
                          className="block max-h-[min(62dvh,34rem)] max-w-full select-none object-contain"
                          onLoad={handleAvatarImageLoad}
                        />
                      </ReactCrop>
                    </div>
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  )}

                  {isBusy && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6 text-white backdrop-blur-[1px]">
                      {status === 'uploading' ? (
                        <div className="w-full max-w-56 space-y-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-sm font-medium">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Uploading... {progress}%</span>
                          </div>
                          <Progress
                            value={progress}
                            className="h-1.5 bg-white/25 [&_[data-slot=progress-indicator]]:bg-white"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm font-medium animate-in zoom-in fade-in duration-300">
                          <CheckCircle2 className="h-5 w-5" />
                          <span>Upload successful</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Edit Overlay (Shown on Hover when previewing) */}
                  {status === 'preview' && !isAvatar && (
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
              </div>

              <div className={cn(
                "flex justify-end gap-2",
                isAvatarCropView && "border-t border-border/60 px-5 py-4"
              )}>
                <Button
                  variant="outline"
                  onClick={isAvatarCropView ? handleBack : handleClose}
                  disabled={isBusy}
                >
                  {isAvatarCropView ? 'Back' : 'Cancel'}
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isBusy}
                  className={cn(isAvatarCropView && "min-w-48")}
                >
                  {status === 'uploading' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : status === 'success' ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : isAvatarCropView ? null : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {status === 'uploading'
                    ? 'Uploading...'
                    : status === 'success'
                      ? 'Success'
                      : isAvatarCropView
                        ? 'Set new profile picture'
                        : 'Upload'
                  }
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
                "relative border-2 border-dashed rounded-lg transition-all cursor-pointer",
                isAvatar ? "px-6 py-10" : "p-8",
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
                    {isAvatar ? "Choose a photo to crop" : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploadHint}
                  </p>
                  {uploadSubHint && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                      {uploadSubHint}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
