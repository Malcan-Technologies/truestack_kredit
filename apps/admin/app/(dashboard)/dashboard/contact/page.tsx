"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneDisplay } from "@/components/ui/phone-display";
import { CopyField } from "@/components/ui/copy-field";

const PHONE_NUMBER = "+60164614919";
const EMAIL = "hello@truestack.my";

const WHATSAPP_BASE = "https://wa.me/60164614919";

export default function ContactPage() {
  const [tenantName, setTenantName] = useState<string | null>(null);

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
      }
    };
    fetchTenant();
  }, []);

  const whatsappMessage = `Hi, I'm contacting you from TrueKredit. My tenant name is ${tenantName ?? "N/A"}`;
  const whatsappUrl = `${WHATSAPP_BASE}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Contact Us</h1>
        <p className="text-muted mt-1">
          Get in touch with the TrueKredit team for support or inquiries.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
    </div>
  );
}
