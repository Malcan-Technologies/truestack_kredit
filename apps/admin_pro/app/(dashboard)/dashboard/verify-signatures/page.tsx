"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  FileSearch,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Clock,
  FileText,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  checkSigningHealth,
  verifyPdfSignature,
  type PdfSignatureData,
} from "@/lib/admin-signing-client";

function extractCN(dn: string | undefined | null): string {
  if (!dn) return "—";
  const match = dn.match(/CN=([^,]+)/i);
  return match ? match[1].trim() : dn;
}

export default function VerifySignaturesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    statusCode: string;
    statusMsg?: string;
    errorDescription?: string;
    totalSignatureInPdf?: number;
    pdfSignatureList?: PdfSignatureData[];
  } | null>(null);

  const checkGateway = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const res = await checkSigningHealth();
      setGatewayOnline(res.online);
    } catch {
      setGatewayOnline(false);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    void checkGateway();
  }, [checkGateway]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 50 MB.");
      return;
    }

    setSelectedFile(file);
    setResult(null);
  };

  const handleVerify = async () => {
    if (!selectedFile) return;

    setVerifying(true);
    setResult(null);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const res = await verifyPdfSignature(base64);
      setResult(res);

      if (res.success && res.statusCode === "000") {
        const allValid = res.pdfSignatureList?.every((s) => s.sigStatusValid);
        if (allValid) {
          toast.success("All signatures are valid");
        } else {
          toast.warning("Some signatures are invalid");
        }
      } else {
        toast.error(
          res.errorDescription || res.statusMsg || "Verification failed",
        );
      }
    } catch {
      toast.error("Failed to verify PDF signatures");
    } finally {
      setVerifying(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const allValid =
    result?.success &&
    result.statusCode === "000" &&
    result.pdfSignatureList?.every((s) => s.sigStatusValid);

  const hasInvalid =
    result?.success &&
    result.statusCode === "000" &&
    result.pdfSignatureList?.some((s) => !s.sigStatusValid);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            Verify signatures
          </h1>
          <p className="text-muted text-sm mt-1">
            Upload a signed PDF to verify the authenticity and validity of its
            digital signatures via the on-prem signing server.
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            PDF Signature Verification
          </CardTitle>
          <CardDescription>
            {gatewayOnline === null || checkingHealth ? (
              <Skeleton className="h-4 w-full max-w-lg mt-0.5" />
            ) : (
              <>
                Select a digitally signed PDF to validate all embedded signatures
                against the Certificate Authority.
                {gatewayOnline === false && (
                  <span className="block mt-1 text-destructive">
                    The on-prem signing server is offline. Verification requires a
                    connection to the signing server.
                  </span>
                )}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File picker */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={verifying}
            >
              <Upload className="h-4 w-4 mr-2" />
              Select PDF
            </Button>

            {selectedFile && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleClear}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleVerify}
              disabled={!selectedFile || verifying || gatewayOnline === false}
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Verify Signatures
            </Button>

            {gatewayOnline === null || checkingHealth ? (
              <Skeleton className="h-6 w-36 rounded-full" />
            ) : gatewayOnline ? (
              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Server online
              </Badge>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Server offline
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void checkGateway()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results — skeleton while verifying */}
      {verifying && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-28" />
            </div>
          </CardHeader>
          <CardContent>
            <TableSkeleton
              headers={[
                "#",
                "Signer",
                "Issuer",
                "Signed At",
                "Certificate",
                "Coverage",
                "Signature",
              ]}
              columns={[
                { width: "w-6" },
                { width: "w-28" },
                { width: "w-28" },
                { width: "w-24" },
                { badge: true, width: "w-14" },
                { badge: true, width: "w-16" },
                { width: "w-16" },
              ]}
              rows={4}
            />
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Verification Result
                {allValid && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    All Valid
                  </Badge>
                )}
                {hasInvalid && (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Invalid Signatures Found
                  </Badge>
                )}
                {!result.success && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Verification Failed
                  </Badge>
                )}
              </CardTitle>
              {result.totalSignatureInPdf != null && (
                <span className="text-sm text-muted-foreground">
                  {result.totalSignatureInPdf} signature
                  {result.totalSignatureInPdf !== 1 ? "s" : ""} found
                </span>
              )}
            </div>
            {result.errorDescription && (
              <CardDescription className="text-destructive">
                {result.errorDescription}
              </CardDescription>
            )}
          </CardHeader>

          {result.pdfSignatureList && result.pdfSignatureList.length > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Signer</TableHead>
                    <TableHead>Issuer</TableHead>
                    <TableHead>Signed At</TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Signature</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.pdfSignatureList.map((sig, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-medium cursor-help">
                                {extractCN(sig.sigSignerCertSubject)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs break-all">
                                {sig.sigSignerCertSubject}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-muted-foreground cursor-help">
                                {extractCN(sig.sigSignerCertIssuer)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs break-all">
                                {sig.sigSignerCertIssuer}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {sig.sigTimeStamp || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {sig.sigSignerCertStatus === "Valid" ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                          >
                            Valid
                          </Badge>
                        ) : sig.sigSignerCertStatus === "Revoked" ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : sig.sigSignerCertStatus === "Expired" ? (
                          <Badge variant="secondary">Expired</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {sig.sigSignerCertStatus || "Unknown"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {sig.sigCoverWholeDocument ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 cursor-help"
                                >
                                  Full
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Signature covers the entire document — no
                                  modifications were made after signing
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="cursor-help"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Partial
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Signature does not cover the entire document —
                                  the document may have been modified after this
                                  signature was applied
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell>
                        {sig.sigStatusValid ? (
                          <div className="flex items-center gap-1 text-green-500">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Valid</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Invalid
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}

          {result.success &&
            result.statusCode === "000" &&
            (!result.pdfSignatureList ||
              result.pdfSignatureList.length === 0) && (
              <CardContent>
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <AlertTriangle className="h-5 w-5" />
                  <p>No digital signatures were found in this document.</p>
                </div>
              </CardContent>
            )}
        </Card>
      )}
    </div>
  );
}
