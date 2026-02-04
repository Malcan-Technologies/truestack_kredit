"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, Image, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

export function FileUpload({
  onUpload,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  maxSize = 10 * 1024 * 1024, // 10MB default
  disabled = false,
  className,
  label = "Upload file",
  description = "Drag and drop or click to upload",
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; type: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxSize) {
      return `File size exceeds ${maxSize / 1024 / 1024}MB limit`;
    }

    // Check file type
    const allowedTypes = accept.split(",").map((t) => t.trim().toLowerCase());
    const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const isAllowedExtension = allowedTypes.some((t) => t === fileExtension || t === file.type);

    if (!isAllowedExtension) {
      return `File type not allowed. Accepted: ${accept}`;
    }

    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPreview({ name: file.name, type: file.type });
    setUploading(true);

    try {
      await onUpload(file);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  const handleClick = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const handleCancelPreview = () => {
    setPreview(null);
    setError(null);
  };

  const isImage = preview?.type.startsWith("image/");

  return (
    <div className={cn("w-full", className)}>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
          isDragging && "border-primary bg-primary/5",
          !isDragging && !error && "border-border hover:border-primary/50",
          error && "border-red-500 bg-red-50 dark:bg-red-900/10",
          disabled && "opacity-50 cursor-not-allowed",
          uploading && "pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled || uploading}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Uploading {preview?.name}...</p>
          </div>
        ) : preview ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isImage ? (
                <Image className="h-8 w-8 text-blue-500" />
              ) : (
                <FileText className="h-8 w-8 text-orange-500" />
              )}
              <div>
                <p className="text-sm font-medium truncate max-w-[200px]">{preview.name}</p>
                <p className="text-xs text-muted-foreground">Ready to upload</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelPreview();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center">
            <Upload className={cn("h-8 w-8 mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Max size: {maxSize / 1024 / 1024}MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 mt-2">{error}</p>
      )}
    </div>
  );
}

// Simpler variant for inline use
interface FileUploadButtonProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function FileUploadButton({
  onUpload,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  maxSize = 10 * 1024 * 1024,
  disabled = false,
  children,
}: FileUploadButtonProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size
    if (file.size > maxSize) {
      return;
    }

    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
    e.target.value = "";
  };

  return (
    <label className="cursor-pointer">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled || uploading}
        className="hidden"
      />
      {children || (
        <Button variant="outline" size="sm" disabled={disabled || uploading} asChild>
          <span>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Upload
          </span>
        </Button>
      )}
    </label>
  );
}
