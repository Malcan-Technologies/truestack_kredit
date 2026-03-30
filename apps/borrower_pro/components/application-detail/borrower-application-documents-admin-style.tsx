"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import type {
  ApplicationDocumentRow,
  LoanApplicationDetail,
  RequiredDocumentItem,
} from "../../lib/application-form-types";
import {
  deleteApplicationDocument,
  uploadApplicationDocument,
} from "../../lib/borrower-applications-client";
import type { ApplicationDocumentsMode } from "../application-form/application-documents-card";

function docViewUrl(path: string | undefined): string | null {
  if (!path?.trim()) return null;
  return path.startsWith("/") ? `/api/proxy${path}` : path;
}

export function BorrowerApplicationDocumentsAdminStyle({
  app,
  requiredDocs,
  documents,
  mode,
  onDocumentsChange,
}: {
  app: LoanApplicationDetail;
  requiredDocs: RequiredDocumentItem[];
  documents: ApplicationDocumentRow[];
  mode: ApplicationDocumentsMode;
  onDocumentsChange: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const canEdit =
    app.status === "DRAFT" ||
    app.status === "SUBMITTED" ||
    app.status === "UNDER_REVIEW" ||
    app.status === "APPROVED";
  const postSubmit = mode === "post_submit";

  const canDelete = () => canEdit && app.status === "DRAFT";

  const canReplaceAfterSubmit =
    canEdit &&
    (app.status === "SUBMITTED" ||
      app.status === "UNDER_REVIEW" ||
      app.status === "APPROVED");

  const canUploadCategory = (category: string) => {
    if (!canEdit) return false;
    const uploaded = documents.filter((d) => d.category === category);
    if (postSubmit && uploaded.length > 0) return false;
    return true;
  };

  const canAddOther = () => {
    if (!canEdit) return false;
    if (!postSubmit) return true;
    return !documents.some((d) => d.category === "OTHER");
  };

  const handleUpload = async (
    category: string,
    file: File,
    replaceDocumentId?: string
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    if (replaceDocumentId) {
      fd.append("replaceDocumentId", replaceDocumentId);
    }
    setUploading(true);
    try {
      const res = await uploadApplicationDocument(app.id, fd);
      await onDocumentsChange();
      toast.success(res.message ?? "Document uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      await deleteApplicationDocument(app.id, documentId);
      await onDocumentsChange();
      toast.success("Document removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Documents
        </CardTitle>
        <CardDescription>
          Upload required documents for this application.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {requiredDocs.map((docType) => {
            const uploadedDoc = documents.find((d) => d.category === docType.key);
            const viewHref = docViewUrl(uploadedDoc?.path);

            return (
              <div
                key={docType.key}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {docType.label}
                      {docType.required ? (
                        <span className="text-red-500 ml-1">*</span>
                      ) : null}
                    </p>
                    {uploadedDoc ? (
                      <p className="text-xs text-muted-foreground truncate">
                        {uploadedDoc.originalName}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {uploadedDoc ? (
                    <>
                      <Badge variant="verified" className="text-xs">
                        Uploaded
                      </Badge>
                      {viewHref ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(viewHref, "_blank", "noopener,noreferrer")}
                          title="View document"
                        >
                          <ExternalLink className="h-4 w-4 text-foreground" />
                        </Button>
                      ) : null}
                      {canReplaceAfterSubmit ? (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload(docType.key, f);
                              e.target.value = "";
                            }}
                          />
                          <Button variant="outline" size="sm" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-1" />
                              Replace
                            </span>
                          </Button>
                        </label>
                      ) : null}
                      {canDelete() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(uploadedDoc.id)}
                          title="Remove document"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      ) : null}
                    </>
                  ) : canUploadCategory(docType.key) ? (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUpload(docType.key, f);
                          e.target.value = "";
                        }}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-1" />
                          Upload
                        </span>
                      </Button>
                    </label>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Locked after submit
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Other Documents</p>
            {documents
              .filter((d) => !requiredDocs.some((r) => r.key === d.category))
              .map((doc) => {
                const viewHref = docViewUrl(doc.path);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded border mb-2 gap-2"
                  >
                    <span className="text-sm truncate min-w-0">{doc.originalName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {viewHref ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            window.open(viewHref, "_blank", "noopener,noreferrer")
                          }
                          title="View document"
                        >
                          <ExternalLink className="h-4 w-4 text-foreground" />
                        </Button>
                      ) : null}
                      {canReplaceAfterSubmit ? (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload("OTHER", f, doc.id);
                              e.target.value = "";
                            }}
                          />
                          <Button variant="outline" size="sm" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-1" />
                              Replace
                            </span>
                          </Button>
                        </label>
                      ) : null}
                      {canDelete() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(doc.id)}
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            {canAddOther() && (
              <label className="cursor-pointer inline-block">
                <input
                  ref={otherInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload("OTHER", f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => otherInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </label>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
