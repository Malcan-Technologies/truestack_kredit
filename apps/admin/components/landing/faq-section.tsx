"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { faqItems, faqSectionHeader } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function FaqSection() {
  return (
    <SectionShell id="faq">
      <SectionHeading
        title={faqSectionHeader.title}
        description={faqSectionHeader.description}
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
