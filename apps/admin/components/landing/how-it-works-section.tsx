import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { howItWorksSteps } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function HowItWorksSection() {
  return (
    <SectionShell id="how-it-works" variant="muted">
      <SectionHeading
        title="From staff capture to borrower lifecycle"
        description="A clear operational story for credit, ops, and IT — with staged review and plan-gated capabilities on a single Core tenant."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {howItWorksSteps.map((step) => {
          const Icon = step.icon
          return (
            <Card
              key={step.step}
              className="relative overflow-hidden border-border/80 bg-card md:min-h-[220px]"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-heading font-semibold">
                    {step.step}
                  </span>
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <CardTitle className="text-base pt-2">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {step.description}
                </CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </SectionShell>
  )
}
