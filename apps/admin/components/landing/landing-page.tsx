import { LandingHeader } from "./landing-header"
import { HeroSection } from "./hero-section"
import { TrustStrip } from "./trust-strip"
import { PlatformModulesSection } from "./platform-modules-section"
import { HowItWorksSection } from "./how-it-works-section"
import { OperatingModelSection } from "./operating-model-section"
import { BorrowerFlowSection } from "./borrower-flow-section"
import { IntegrationsSection } from "./integrations-section"
import { WhyTrueKreditSection } from "./why-truekredit-section"
import { FaqSection } from "./faq-section"
import { FinalCtaSection } from "./final-cta-section"
import { LandingFooter } from "./landing-footer"

export function LandingPage() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main-content">
        <HeroSection />
        <TrustStrip />
        <PlatformModulesSection />
        <HowItWorksSection />
        <OperatingModelSection />
        <BorrowerFlowSection />
        <IntegrationsSection />
        <WhyTrueKreditSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </>
  )
}
