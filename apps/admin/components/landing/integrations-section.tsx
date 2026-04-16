import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { integrationsSection } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function IntegrationsSection() {
  return (
    <SectionShell id="integrations">
      <SectionHeading
        eyebrow={integrationsSection.eyebrow}
        title={integrationsSection.headline}
        description={integrationsSection.subhead}
      />
      <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
        {integrationsSection.cards.map((card) => (
          <Card
            key={card.title}
            className="border-border/80 bg-card flex flex-col h-full"
          >
            <CardHeader>
              <CardTitle className="text-xl font-heading">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <p className="text-base text-muted-foreground leading-relaxed">
                {card.description}
              </p>
              <Separator />
              <ul className="space-y-2 text-sm text-muted-foreground">
                {card.points.map((pt) => (
                  <li key={pt} className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">·</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  )
}
