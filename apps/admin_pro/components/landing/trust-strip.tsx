import { Badge } from "@/components/ui/badge"
import { trustStripBadges } from "@/lib/landing-content"

export function TrustStrip() {
  return (
    <div className="border-y border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Built for supervision-ready operations
        </p>
        <div className="flex flex-wrap justify-center gap-2 md:gap-3">
          {trustStripBadges.map((label) => (
            <Badge
              key={label}
              variant="secondary"
              className="px-3 py-1 text-xs font-normal rounded-full"
            >
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
