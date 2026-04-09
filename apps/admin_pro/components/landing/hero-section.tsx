import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { hero } from "@/lib/landing-content"
import { SectionShell } from "./section-shell"

export function HeroSection() {
  return (
    <SectionShell className="pt-10 md:pt-14 pb-12 md:pb-16 lg:pb-20">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10 lg:items-center">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-muted-foreground mb-4">
            {hero.eyebrow}
          </p>
          <h1 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-tight">
            {hero.headline}
          </h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed">
            {hero.subheadline}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button size="lg" asChild>
              <a href={hero.primaryCta.href}>{hero.primaryCta.label}</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={hero.secondaryCta.href}>{hero.secondaryCta.label}</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {hero.heroBadges.map((label) => (
              <Badge key={label} variant="outline" className="text-xs font-normal">
                {label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="relative lg:justify-self-end w-full max-w-lg mx-auto lg:mx-0">
          <Card className="shadow-md border-border/80 bg-card">
            <CardHeader className="pb-2 space-y-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Admin overview</p>
                <Badge variant="secondary" className="text-xs">
                  Demo
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Portfolio snapshot — illustrative layout
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-surface/80 p-3">
                  <p className="text-xs text-muted-foreground">Active loans</p>
                  <p className="text-xl font-heading font-semibold mt-1">—</p>
                </div>
                <div className="rounded-lg border border-border bg-surface/80 p-3">
                  <p className="text-xs text-muted-foreground">In review</p>
                  <p className="text-xl font-heading font-semibold mt-1">—</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Today
                </p>
                <div className="space-y-2">
                  {[
                    "Compliance export queue",
                    "Borrower e-KYC pending",
                    "TrueSend delivery log",
                  ].map((row) => (
                    <div
                      key={row}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{row}</span>
                      <span className="text-xs text-muted-foreground">···</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SectionShell>
  )
}
