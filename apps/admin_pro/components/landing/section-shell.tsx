import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type SectionShellProps = {
  id?: string
  className?: string
  containerClassName?: string
  children: ReactNode
  /** Subtle alternate background (surface tint) */
  variant?: "default" | "muted"
}

export function SectionShell({
  id,
  className,
  containerClassName,
  children,
  variant = "default",
}: SectionShellProps) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20 py-16 md:py-20 lg:py-24",
        variant === "muted" && "bg-surface/50",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-6xl px-4 sm:px-6 lg:px-8",
          containerClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}

type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
  align?: "left" | "center"
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-10 md:mb-14 max-w-3xl",
        align === "center" && "mx-auto text-center max-w-2xl",
        className
      )}
    >
      {eyebrow ? (
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-heading text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
  )
}
