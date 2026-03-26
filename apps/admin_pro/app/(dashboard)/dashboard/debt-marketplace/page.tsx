"use client";

import Image from "next/image";
import {
  Store,
  TrendingDown,
  TrendingUp,
  Shield,
  Zap,
  ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const HIGHLIGHTS = [
  {
    icon: TrendingDown,
    title: "Sell Debt",
    description:
      "List any loans for sale — for cashflow, portfolio rebalancing, or risk management. Recover capital and free up resources for new lending.",
  },
  {
    icon: TrendingUp,
    title: "Buy Debt",
    description:
      "Acquire debt portfolios at a discount. Diversify your portfolio and access new revenue streams.",
  },
  {
    icon: ArrowRightLeft,
    title: "Peer-to-Peer Trading",
    description:
      "Trade debt directly with other licensed lenders. Transparent pricing and secure settlement.",
  },
  {
    icon: Shield,
    title: "Compliant & Secure",
    description:
      "Built for KPKT-licensed lenders. Full audit trail, borrower data protection, and regulatory compliance.",
  },
  {
    icon: Zap,
    title: "Streamlined Workflow",
    description:
      "List, browse, negotiate, and settle — all within TrueKredit. No spreadsheets or manual processes.",
  },
];

export default function DebtMarketplacePage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold text-gradient">
              Debt Marketplace
            </h1>
            <Badge variant="secondary" className="text-xs">
              Coming Soon
            </Badge>
          </div>
          <p className="text-muted mt-1">
            Buy and sell debt portfolios with other licensed lenders
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Store className="h-6 w-6 text-primary" />
        </div>
      </div>

      {/* Coming Soon Banner */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/5">
        <CardContent className="py-6">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-6 sm:gap-8 items-center">
            <div className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800/60 p-3">
              <Image
                src="/illustrations/undraw_empty-cart_574u.svg"
                alt=""
                width={96}
                height={96}
                className="h-full w-full max-w-[80px] max-h-[80px] object-contain object-center"
              />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
              <div>
                <h2 className="font-heading font-semibold text-lg">
                  We&apos;re building something powerful
                </h2>
                <p className="text-muted mt-1 max-w-xl">
The Debt Marketplace will let you sell loans to other lenders —
                for cashflow, portfolio rebalancing, or risk management — or buy
                debt portfolios at a discount.
                  Stay tuned — we&apos;ll notify you as soon as it&apos;s ready.
                </p>
              </div>
              <Badge
                variant="outline"
                className="w-fit shrink-0 border-primary/40 text-primary"
              >
                Coming Soon
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Highlights */}
      <div>
        <h2 className="font-heading font-semibold text-lg mb-4">
          What to expect
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {HIGHLIGHTS.map((item) => (
            <Card key={item.title} className="border-border/80">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <item.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base font-heading">
                    {item.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
