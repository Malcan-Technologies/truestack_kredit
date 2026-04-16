import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { platformModules } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function PlatformModulesSection() {
  return (
    <SectionShell id="platform">
      <SectionHeading
        title="What Core includes for your lending team"
        description="Staff-led origination, servicing, tenant and plan administration, and optional modules — structured for Malaysian licensed operations, not a generic loan app template."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {platformModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Card
              key={mod.title}
              className="transition-shadow hover:shadow-md border-border/80 bg-card"
            >
              <CardHeader className="pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface mb-3">
                  <Icon className="h-5 w-5 text-foreground" aria-hidden />
                </div>
                <CardTitle className="text-lg">{mod.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {mod.description}
                </CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </SectionShell>
  )
}
