import type { ReactNode } from "react"
import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import { PoweredByTruestack } from "@/components/powered-by-truestack"
import { footer } from "@/lib/landing-content"

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-heading text-lg font-semibold text-foreground">
              TrueKredit™ Pro
            </p>
            <p className="mt-2 text-sm text-muted-foreground max-w-md leading-relaxed">
              Operations platform for licensed money lenders in Malaysia — physical and digital KPKT
              programmes, with origination, e-KYC, servicing, and compliance-oriented exports.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">{footer.contactLine}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Product</h2>
            <ul className="mt-3 space-y-2">
              {footer.product.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <a
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Company</h2>
            <ul className="mt-3 space-y-2">
              {footer.company.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <a
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <h2 className="text-sm font-semibold text-foreground mt-6">Legal</h2>
            <ul className="mt-3 space-y-2">
              {footer.legal.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <a
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Separator className="my-10" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <PoweredByTruestack />
          <ButtonishLink href="/login">Staff sign in</ButtonishLink>
        </div>
      </div>
    </footer>
  )
}

function ButtonishLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  )
}
