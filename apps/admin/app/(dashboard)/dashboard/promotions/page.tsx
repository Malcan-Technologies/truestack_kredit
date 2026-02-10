"use client";

import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
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
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-heading font-bold text-gradient">
            Add-ons & Promotions
          </h1>
        </div>
        <p className="text-muted text-sm ml-6">
          Explore optional add-ons and special offers to enhance your TrueKredit
          experience
        </p>
      </div>

      {/* Promotion Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {PROMOTIONS.map((promo) => (
          <PromotionCard key={promo.id} promotion={promo} />
        ))}
      </div>

      {/* Contact CTA */}
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <p className="text-muted text-sm">
            Interested in any of these add-ons? Contact your TrueKredit account
            manager or reach out to us.
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
      className={`overflow-hidden bg-gradient-to-br flex flex-col ${promotion.gradient} ${promotion.borderColor} scroll-mt-24`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <promotion.icon className="h-5.5 w-5.5 text-foreground/70" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg font-heading">
                {promotion.title}
              </CardTitle>
              <Badge
                variant={promotion.badgeVariant}
                className="text-xs"
              >
                {promotion.badge}
              </Badge>
            </div>
            <p className="text-sm text-muted mt-1">{promotion.tagline}</p>
          </div>
        </div>
        {promotion.pricing && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-foreground/[0.03] border border-foreground/[0.06] px-3 py-2">
            <p className="text-xs text-muted uppercase tracking-wide">
              Pricing
            </p>
            <p className="text-sm font-heading font-semibold">
              {promotion.pricing}
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {promotion.description}
        </p>

        <Separator className="opacity-50" />

        {/* Features list */}
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted mb-3">
            Key Features
          </p>
          <div className="space-y-2">
            {promotion.features.map((feature, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 mt-0.5">
                  <Check className="h-3 w-3 text-success" />
                </div>
                <p className="text-sm text-muted-foreground">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        <Separator className="opacity-50" />

        {/* CTA */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
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
