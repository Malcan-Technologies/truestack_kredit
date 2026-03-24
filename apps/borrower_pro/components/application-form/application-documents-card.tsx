"use client";

import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import type { ApplicationDocumentRow, RequiredDocumentItem } from "../../lib/application-form-types";
import {
  uploadApplicationDocument,
  deleteApplicationDocument,
} from "../../lib/borrower-applications-client";
import { toast } from "sonner";
import { useMemo } from "react";

type ApplicationDocumentsCardProps = {
  applicationId: string;
  requiredDocs: RequiredDocumentItem[];
  documents: ApplicationDocumentRow[];
  onDocumentsChange: () => Promise<void>;
  /** When true, show an "Optional" badge (product has only optional slots). */
  showOptionalBadge?: boolean;
};

export function ApplicationDocumentsCard({
  applicationId,
  requiredDocs,
  documents,
  onDocumentsChange,
  showOptionalBadge = false,
}: ApplicationDocumentsCardProps) {
  const docsUploadedByCategory = useMemo(() => {
    const map = new Map<string, ApplicationDocumentRow[]>();
    for (const d of documents) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return map;
  }, [documents]);

  const uploadFile = async (category: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    try {
      await uploadApplicationDocument(applicationId, fd);
      await onDocumentsChange();
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const removeDoc = async (documentId: string) => {
    try {
      await deleteApplicationDocument(applicationId, documentId);
      await onDocumentsChange();
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Document upload</CardTitle>
          <CardDescription>
            Upload PDF, PNG, or JPG up to 50MB per file. Categories come from the product configuration.
          </CardDescription>
        </div>
        {showOptionalBadge && (
          <span className="text-xs bg-muted px-2 py-1 rounded-md shrink-0">Optional</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No document types are configured for this product.
          </p>
        ) : (
          requiredDocs.map((doc) => {
            const uploaded = docsUploadedByCategory.get(doc.key) ?? [];
            return (
              <div
                key={doc.key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-lg p-3"
              >
                <div>
                  <p className="font-medium text-sm">
                    {doc.label}
                    {doc.required ? <span className="text-destructive"> *</span> : null}
                  </p>
                  {uploaded.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                      {uploaded.map((u) => (
                        <li key={u.id} className="flex items-center gap-2">
                          <span className="truncate">{u.originalName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => removeDoc(u.id)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                    className="hidden"
                    id={`doc-upload-${applicationId}-${doc.key}`}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFile(doc.key, f);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <label htmlFor={`doc-upload-${applicationId}-${doc.key}`} className="cursor-pointer">
                      Upload
                    </label>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
