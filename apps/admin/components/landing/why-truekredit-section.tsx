import { Card, CardContent } from "@/components/ui/card"
import { whySectionHeader, whyTrueKreditPoints } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function WhyTrueKreditSection() {
  return (
    <SectionShell id="why-truekredit" variant="muted">
      <SectionHeading
        title={whySectionHeader.title}
        description={whySectionHeader.description}
      />
      <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
        {whyTrueKreditPoints.map((item) => (
          <Card
            key={item.title}
            className="border-border/80 bg-card transition-shadow hover:shadow-md"
          >
            <CardContent className="p-6 md:p-7">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  )
}
