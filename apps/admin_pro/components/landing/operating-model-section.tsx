"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { operatingModelTabs } from "@/lib/landing-content"
import { SectionHeading, SectionShell } from "./section-shell"

export function OperatingModelSection() {
  return (
    <SectionShell id="operating-model">
      <SectionHeading
        title="Physical or digital KPKT — same disciplined core"
        description="Choose the tab that matches how you are licensed and scaling. The platform stays oriented to Malaysian moneylending operations, not generic consumer fintech positioning."
      />
      <Tabs defaultValue={operatingModelTabs[0].id} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1 gap-1">
          {operatingModelTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-sm py-2.5 data-[state=active]:shadow-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {operatingModelTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-8">
            <div className="max-w-3xl space-y-6">
              <h3 className="font-heading text-xl md:text-2xl font-semibold text-foreground">
                {tab.title}
              </h3>
              <div className="space-y-4 text-base text-muted-foreground leading-relaxed">
                {tab.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground marker:text-foreground">
                {tab.bullets.map((b) => (
                  <li key={b} className="leading-relaxed">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </SectionShell>
  )
}
