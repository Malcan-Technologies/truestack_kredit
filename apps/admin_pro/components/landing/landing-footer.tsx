import type { ReactNode } from "react"
import Link from "next/link"
import { Layers, Linkedin, Mail } from "lucide-react"
import { truestackSiteFooter } from "@/lib/landing-content"

const F = truestackSiteFooter

function FooterLinkColumn({
  title,
  items,
}: {
  title: string
  items: readonly { label: string; href: string }[]
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ButtonishLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          <div className="max-w-sm space-y-4">
            <a
              href="https://www.truestack.my"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5"
            >
              <Layers className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-500" strokeWidth={1.75} aria-hidden />
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">TrueStack</span>
            </a>
            <p className="text-sm leading-relaxed text-muted-foreground">{F.brand.description}</p>
            <a
              href={F.brand.email}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {F.brand.emailLabel}
            </a>
            <div>
              <a
                href={F.brand.linkedinHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Linkedin className="h-4 w-4" aria-hidden />
                LinkedIn
              </a>
            </div>
          </div>
          <FooterLinkColumn title="KPKT Solutions" items={F.kpktSolutions} />
          <FooterLinkColumn title="Other Solutions" items={F.otherSolutions} />
          <FooterLinkColumn title="Company" items={F.company} />
          <FooterLinkColumn title="Legal" items={F.legal} />
        </div>

        <div className="mt-14 border-t border-border pt-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-1 text-xs leading-relaxed text-muted-foreground">
              <p className="text-sm font-semibold tracking-wide text-foreground">{F.companyBar.name}</p>
              <p>{F.companyBar.registration}</p>
              {F.companyBar.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="pt-2 text-muted-foreground/90">{F.companyBar.copyright}</p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
                {F.bottomLegal.map((l, i) => (
                  <span key={l.label} className="inline-flex items-center">
                    {i > 0 ? <span className="px-1.5 text-muted-foreground/50">·</span> : null}
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </a>
                  </span>
                ))}
              </div>
              <ButtonishLink href="/login">Staff sign in</ButtonishLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
