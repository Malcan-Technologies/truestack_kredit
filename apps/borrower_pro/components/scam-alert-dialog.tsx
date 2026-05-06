"use client";

import { useState } from "react";
import { AlertTriangle, Globe, Search, Shield, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@borrower_pro/components/ui/dialog";
import { Button } from "@borrower_pro/components/ui/button";

export type ScamAlertDialogProps = {
  lenderName: string;
  officialWebsite: string;
  kpktLicense: string;
};

const SCAM_ITEMS = [
  {
    Icon: Shield,
    title: "Beware of impersonators",
    description:
      "Scammers may use our name or logo to deceive you. We only conduct business through our official website.",
  },
  {
    Icon: Globe,
    title: "Our official website",
    description: null, // rendered separately with a link
  },
  {
    Icon: X,
    title: "No upfront payments",
    description:
      "We will never ask for upfront fees, deposits, or OTP codes via phone, SMS, or WhatsApp.",
  },
  {
    Icon: Search,
    title: "Verify suspicious contacts",
    description:
      "Check suspicious phone numbers via PDRM Semak Mule at semakmule.rmp.gov.my",
    link: { href: "https://semakmule.rmp.gov.my", label: "semakmule.rmp.gov.my" },
  },
] as const;

/**
 * Scam alert shown on the landing page whenever it mounts (every full load of `/`).
 * Dismiss is in-memory only; the next visit to the home route shows it again.
 */
export function ScamAlertDialog({
  lenderName,
  officialWebsite,
  kpktLicense,
}: ScamAlertDialogProps) {
  const [open, setOpen] = useState(true);

  function handleDismiss() {
    setOpen(false);
  }

  // Prevent closing by clicking outside or pressing Escape — user must tap "I Understand"
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Scam Alert — {lenderName}</DialogTitle>

        {/* Red header banner */}
        <div className="flex items-start gap-3 bg-red-600 px-5 py-4 text-white">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="text-base font-bold leading-tight">Scam Alert</p>
            <p className="mt-0.5 text-sm text-red-100">Protect yourself from fraud</p>
          </div>
        </div>

        {/* Items */}
        <div className="divide-y divide-border bg-background">
          {SCAM_ITEMS.map(({ Icon, title, description, ...rest }) => {
            const link = "link" in rest ? rest.link : undefined;
            return (
              <div key={title} className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Icon className="h-4 w-4 text-foreground" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  {title === "Our official website" ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      We only do business on{" "}
                      <a
                        href={officialWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline underline-offset-2"
                      >
                        {officialWebsite.replace(/^https?:\/\//, "")}
                      </a>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {description}
                      {link ? (
                        <>
                          {" "}
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline underline-offset-2"
                          >
                            {link.label}
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* License info banner */}
        {kpktLicense && kpktLicense !== "—" ? (
          <div className="border-t border-border bg-emerald-50 px-5 py-3 dark:bg-emerald-950/30">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                {lenderName} is a licensed money lender under the Moneylenders Act 1951 (KPKT License No:{" "}
                {kpktLicense})
              </p>
            </div>
          </div>
        ) : null}

        {/* CTA */}
        <div className="border-t border-border bg-background px-5 py-4">
          <Button
            onClick={handleDismiss}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500"
            size="lg"
          >
            I Understand
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
