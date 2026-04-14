"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Mail, MessageCircle, HelpCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { CopyField } from "@/components/ui/copy-field";

const PHONE_NUMBER = "+60164614919";
const EMAIL = "hello@truestack.my";

const WHATSAPP_BASE = "https://wa.me/60164614919";

function ContactPageSkeleton() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 xl:max-w-5xl" role="status" aria-label="Loading contact page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-4 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
          <Skeleton className="h-9 w-28 shrink-0" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="flex flex-col">
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-full max-w-xs" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="mt-auto border-t border-border pt-4">
              <Skeleton className="h-10 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ContactPage() {
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const res = await fetch("/api/proxy/tenants/current", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.data?.name) {
          setTenantName(data.data.name);
        }
      } catch {
        // Ignore - will use fallback
      } finally {
        setLoading(false);
      }
    };
    void fetchTenant();
  }, []);

  const whatsappMessage = `Hi, I'm contacting you from TrueKredit. My tenant name is ${tenantName ?? "N/A"}`;
  const whatsappUrl = `${WHATSAPP_BASE}?text=${encodeURIComponent(whatsappMessage)}`;

  if (loading) {
    return <ContactPageSkeleton />;
  }

  return (
    <div className="w-full min-w-0 max-w-4xl xl:max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Contact Us</h1>
        <p className="text-muted mt-1">
          Get in touch with the TrueKredit team for support or inquiries.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-4 py-4">
          <HelpCircle className="h-10 w-10 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Looking for help?</p>
            <p className="text-sm text-muted-foreground">
              Browse our documentation for guides and answers to common questions.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/dashboard/help" className="inline-flex items-center gap-2">
              Help Center
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              Phone
            </CardTitle>
            <CardDescription>
              Reach us via WhatsApp. Tap to start a conversation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhoneDisplay label="Phone" value={PHONE_NUMBER} toastMessage="Phone number copied" />
          </CardContent>
          <CardFooter className="border-t border-border pt-4 mt-auto">
            <Button asChild variant="default" className="w-full">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Open WhatsApp
              </a>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Email
            </CardTitle>
            <CardDescription>
              Send us an email for general inquiries or support.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyField label="Email" value={EMAIL} toastMessage="Email copied" />
          </CardContent>
          <CardFooter className="border-t border-border pt-4 mt-auto">
            <Button asChild variant="outline" className="w-full">
              <a
                href={`mailto:${EMAIL}`}
                className="inline-flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
