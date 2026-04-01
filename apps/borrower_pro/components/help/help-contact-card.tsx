"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LifeBuoy, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  fetchLenderInfo,
  type LenderInfo,
} from "@borrower_pro/lib/borrower-auth-client";
import { PhoneDisplay } from "@borrower_pro/components/ui/phone-display";

export function HelpContactCard() {
  const [lender, setLender] = useState<LenderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchLenderInfo()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setLender(result.data);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "We couldn't load contact details right now."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyEmail = async () => {
    if (!lender?.email) return;
    try {
      await navigator.clipboard.writeText(lender.email);
      setEmailCopied(true);
      toast.success("Company email copied to clipboard");
      window.setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              Need more help?
            </h3>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            If you need assistance with your application, repayments, or loan journey, contact the
            admin team using the details below.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading contact details...</p>
          ) : error || !lender ? (
            <p className="text-sm text-muted-foreground">
              {error || "Contact details are not available right now."}
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="shrink-0">
                <p className="text-sm text-muted-foreground">Company email</p>
                {lender.email ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={`mailto:${encodeURIComponent(lender.email)}`}
                      className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 py-2"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">
                        {lender.email}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyEmail()}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      title="Copy company email"
                    >
                      {emailCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 font-medium">—</p>
                )}
              </div>
              <PhoneDisplay
                label="Contact number"
                value={lender.contactNumber}
                className="shrink-0"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
