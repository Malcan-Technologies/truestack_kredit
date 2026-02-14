"use client";

import { Check, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PROMOTIONS, type Promotion } from "@/lib/promotions";

export default function PromotionsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">Promotions</h1>
        <p className="text-muted">Special offers to enhance your TrueKredit experience</p>
      </div>

      {/* Promotion Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {PROMOTIONS.map((promo) => (
          <PromotionCard key={promo.id} promotion={promo} />
        ))}
      </div>

      {/* Contact CTA */}
      <Card className="border-dashed border-border">
        <CardContent className="py-8 text-center">
          <p className="text-base text-muted-foreground">
            Interested? Contact your TrueKredit account manager or reach out to us.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href="mailto:support@truekredit.com">
                Email Support
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://wa.me/60123456789"
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp Us
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Full Promotion Card
// ============================================

function PromotionCard({ promotion }: { promotion: Promotion }) {
  return (
    <Card
      id={promotion.id}
      className={`overflow-hidden bg-gradient-to-br flex flex-col border ${promotion.gradient} ${promotion.borderColor} scroll-mt-24`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5 dark:bg-white/5">
            <promotion.icon className="h-5.5 w-5.5 text-foreground/70 dark:text-white/70" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-heading text-foreground">
                {promotion.title}
              </CardTitle>
              <Badge
                variant={promotion.badgeVariant}
                className="text-xs"
              >
                {promotion.badge}
              </Badge>
            </div>
            <p className="text-base text-muted-foreground mt-1">{promotion.tagline}</p>
          </div>
        </div>
        {promotion.pricing && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-foreground/[0.03] dark:bg-white/[0.03] border border-foreground/[0.06] dark:border-white/[0.06] px-3 py-2">
            <p className="text-sm text-muted-foreground uppercase tracking-wide font-medium">
              Pricing
            </p>
            <p className="text-base font-heading font-semibold text-foreground">
              {promotion.pricing}
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        <p className="text-base text-muted-foreground leading-relaxed">
          {promotion.description}
        </p>

        <Separator className="opacity-50" />

        {/* Features list */}
        <div className="flex-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
            Key Features
          </p>
          <div className="space-y-2">
            {promotion.features.map((feature, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 dark:bg-white/10 mt-0.5">
                  <Check className="h-3 w-3 text-foreground dark:text-white" />
                </div>
                <p className="text-base text-muted-foreground">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* CTA */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {promotion.badge === "Coming Soon"
              ? "Under development. Stay tuned!"
              : "Contact your account manager to enable."}
          </p>
          <Button
            variant={
              promotion.badge === "Coming Soon" ? "outline" : "default"
            }
            size="sm"
            className="shrink-0"
            disabled={promotion.badge === "Coming Soon"}
          >
            {promotion.badge === "Coming Soon"
              ? "Coming Soon"
              : "Contact Us"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
