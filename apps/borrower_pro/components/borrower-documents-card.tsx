"use client";

import { useState, useEffect } from "react";
import { FileText, Upload, Download, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  fetchBorrowerDocuments,
  uploadBorrowerDocument,
  deleteBorrowerDocument,
  type BorrowerDocument,
} from "../lib/borrower-api-client";
import {
  INDIVIDUAL_DOCUMENT_OPTIONS,
  CORPORATE_DOCUMENT_OPTIONS,
  getDocumentLabel,
  MAX_DOCUMENTS_PER_CATEGORY,
} from "../lib/borrower-document-options";
import { toast } from "sonner";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocIcon(mimeType: string) {
  if (/^image\//.test(mimeType)) return "🖼️";
  return "📄";
}

interface BorrowerDocumentsCardProps {
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  onRefresh?: () => void;
}

export function BorrowerDocumentsCard({
  borrowerType,
  onRefresh,
}: BorrowerDocumentsCardProps) {
  const [documents, setDocuments] = useState<BorrowerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const options =
    borrowerType === "CORPORATE"
      ? CORPORATE_DOCUMENT_OPTIONS
      : INDIVIDUAL_DOCUMENT_OPTIONS;

  const loadDocs = async () => {
    setLoading(true);
    try {
      const res = await fetchBorrowerDocuments();
      if (res.success) setDocuments(res.data);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  // Load docs on mount and when borrower type changes (e.g. after switching Individual ↔ Corporate)
  useEffect(() => {
    loadDocs();
  }, [borrowerType]);

  useEffect(() => {
    if (!selectedCategory && options.length > 0) {
      setSelectedCategory(options[0].value);
    }
  }, [options, selectedCategory]);

  const docsInCategory = documents.filter((d) => d.category === selectedCategory);
  const limitReached = Boolean(
    selectedCategory && docsInCategory.length >= MAX_DOCUMENTS_PER_CATEGORY
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", selectedCategory);
      await uploadBorrowerDocument(formData);
      await loadDocs();
      onRefresh?.();
      toast.success("Document uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    setDeletingId(id);
    try {
      await deleteBorrowerDocument(id);
      await loadDocs();
      onRefresh?.();
      toast.success("Document deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const docUrl = (path: string) =>
    path.startsWith("/") ? `/api/proxy${path}` : path;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Borrower Documents
        </CardTitle>
        <CardDescription>
          Upload and manage documents. Allowed: PDF, PNG, JPG (max 5MB).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Document Category</label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <input
              type="file"
              id="doc-upload"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleUpload}
              disabled={uploading || limitReached}
            />
            <Button
              variant="outline"
              disabled={uploading || limitReached}
              onClick={() => document.getElementById("doc-upload")?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
        {limitReached && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Maximum {MAX_DOCUMENTS_PER_CATEGORY} documents per category.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading...</p>
        ) : documents.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.filter((d) => !selectedCategory || d.category === selectedCategory).map((doc) => (
              <div
                key={doc.id}
                className="flex items-start gap-4 p-3 border rounded-lg min-w-0 overflow-hidden"
              >
                <div className="shrink-0 w-10 h-10 rounded-md bg-muted/50 border border-border flex items-center justify-center text-lg">
                  {getDocIcon(doc.mimeType)}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {getDocumentLabel(doc.category, borrowerType)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.originalName || doc.filename} • {formatFileSize(doc.size)}
                  </p>
                  <a
                    href={docUrl(doc.path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-1 inline-block"
                  >
                    Open / Download
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={docUrl(doc.path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === doc.id}
                    onClick={() => handleDelete(doc.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
