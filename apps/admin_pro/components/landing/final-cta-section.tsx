"use client"

import type { FormEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  bookDemoSection,
  contactSalesSection,
  finalCta,
} from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

function preventSubmit(e: FormEvent) {
  e.preventDefault()
}

export function FinalCtaSection() {
  return (
    <SectionShell variant="muted" className="pb-20 md:pb-28">
      <div className="rounded-2xl border border-border bg-card px-6 py-10 md:px-10 md:py-12 shadow-sm">
        <SectionHeading
          align="center"
          title={finalCta.headline}
          description={finalCta.subhead}
          className="mb-8"
        />
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <a href={finalCta.bookDemo.href}>{finalCta.bookDemo.label}</a>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <a href={finalCta.contactSales.href}>{finalCta.contactSales.label}</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href={finalCta.signIn.href}>{finalCta.signIn.label}</Link>
          </Button>
        </div>
      </div>

      <Separator className="my-14 md:my-16" />

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-10">
        <Card id={bookDemoSection.id} className="scroll-mt-24 border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-heading">{bookDemoSection.title}</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {bookDemoSection.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={preventSubmit}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="demo-name">Name</Label>
                  <Input id="demo-name" name="name" placeholder="Your name" autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-org">Organisation</Label>
                  <Input id="demo-org" name="org" placeholder="Licensed entity" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-email">Email</Label>
                <Input
                  id="demo-email"
                  name="email"
                  type="email"
                  placeholder="you@company.my"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-notes">What should we cover?</Label>
                <Textarea
                  id="demo-notes"
                  name="notes"
                  placeholder="Physical vs digital, borrower volumes, compliance exports…"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                Request demo
              </Button>
              <p className="text-xs text-muted-foreground">{bookDemoSection.note}</p>
            </form>
          </CardContent>
        </Card>

        <Card id={contactSalesSection.id} className="scroll-mt-24 border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-heading">{contactSalesSection.title}</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {contactSalesSection.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={preventSubmit}>
              <div className="space-y-2">
                <Label htmlFor="sales-company">{contactSalesSection.companyLabel}</Label>
                <Input id="sales-company" name="company" placeholder="Company name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sales-email">{contactSalesSection.emailLabel}</Label>
                <Input
                  id="sales-email"
                  name="email"
                  type="email"
                  placeholder="procurement@…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sales-message">{contactSalesSection.messageLabel}</Label>
                <Textarea id="sales-message" name="message" placeholder="Questions, timelines, security review…" />
              </div>
              <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                {contactSalesSection.submitLabel}
              </Button>
              <p className="text-xs text-muted-foreground">{contactSalesSection.note}</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  )
}
