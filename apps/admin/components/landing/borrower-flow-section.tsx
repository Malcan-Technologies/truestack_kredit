"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { borrowerFlowTabs } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function BorrowerFlowSection() {
  return (
    <SectionShell id="borrower-flows" variant="muted">
      <SectionHeading
        title="Individual and company borrowers — staff-captured, one tenant"
        description="The same Core deployment handles natural persons and corporates with appropriate rigour, without a borrower self-serve online origination path."
      />
      <Tabs defaultValue={borrowerFlowTabs[0].id} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1 gap-1">
          {borrowerFlowTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-sm py-2.5 data-[state=active]:shadow-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {borrowerFlowTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-8">
            <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
              <Card className="border-border/80 bg-card">
                <CardHeader>
                  <CardTitle className="text-xl font-heading">{tab.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {tab.intro}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/80 bg-surface/50">
                <CardHeader>
                  <CardTitle className="text-lg">Operational focus</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-base text-muted-foreground">
                    {tab.points.map((pt) => (
                      <li key={pt} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </SectionShell>
  )
}
