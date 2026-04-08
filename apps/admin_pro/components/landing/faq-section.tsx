"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { faqItems } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function FaqSection() {
  return (
    <SectionShell id="faq">
      <SectionHeading
        title="Questions teams ask before standardising on Pro"
        description="Straight answers on operating models, borrower types, e-KYC, communications, and how to think about compliance readiness."
      />
      <Accordion type="single" collapsible className="w-full max-w-3xl">
        {faqItems.map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-foreground">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </SectionShell>
  )
}
