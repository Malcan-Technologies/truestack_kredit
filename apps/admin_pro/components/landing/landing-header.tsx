"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { landingNavLinks } from "@/lib/landing-content"
import { cn } from "@/lib/utils"

const PRIMARY_NAV = landingNavLinks.slice(0, 4)
const SECONDARY_NAV = landingNavLinks.slice(4)

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-b border-border bg-background/95 backdrop-blur-md shadow-sm supports-[backdrop-filter]:bg-background/80"
          : "border-b border-transparent bg-background/60 backdrop-blur-sm"
      )}
    >
      <div className="mx-auto flex h-[60px] max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="font-heading text-base font-semibold tracking-tight text-foreground shrink-0 mr-auto xl:mr-0"
        >
          TrueKredit™{" "}
          <span className="text-muted-foreground font-normal">Pro</span>
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden xl:flex items-center gap-0.5 flex-1 justify-center"
          aria-label="Primary"
        >
          {PRIMARY_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              {item.label}
            </a>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {SECONDARY_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex text-muted-foreground"
            asChild
          >
            <Link href="/login">Sign in</Link>
          </Button>

          <span className="hidden sm:block h-5 w-px bg-border" aria-hidden />

          <Button size="sm" className="hidden sm:inline-flex gap-1.5" asChild>
            <a href="#book-demo">
              Book demo
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col">
              <SheetHeader>
                <SheetTitle className="text-left font-heading">
                  TrueKredit™ Pro
                </SheetTitle>
              </SheetHeader>
              <nav
                className="flex flex-col gap-0.5 mt-6 flex-1"
                aria-label="Mobile primary"
              >
                {landingNavLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <Separator className="my-4" />
              <div className="flex flex-col gap-2 pb-6">
                <Button size="lg" asChild>
                  <a href="#book-demo" className="gap-1.5">
                    Book demo
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="#contact-sales">Contact sales</a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
