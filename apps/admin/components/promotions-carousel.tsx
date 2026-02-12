"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROMOTIONS } from "@/lib/promotions";

const AUTO_ROTATE_INTERVAL = 6000; // 6 seconds

export function PromotionsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % PROMOTIONS.length);
  }, []);

  const prevSlide = useCallback(() => {
    setActiveIndex(
      (prev) => (prev - 1 + PROMOTIONS.length) % PROMOTIONS.length
    );
  }, []);

  // Auto-rotation
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, AUTO_ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const current = PROMOTIONS[activeIndex];

  return (
    <Card
      className="lg:col-span-2 overflow-hidden relative bg-gradient-to-br from-blue-500/15 via-blue-400/[0.06] to-sky-500/10 border border-blue-500/20 ring-1 ring-inset ring-blue-400/[0.06] shadow-sm transition-all duration-500"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Subtle top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              "bg-foreground/[0.07] ring-1 ring-foreground/[0.06]"
            )}>
              <current.icon className="h-5 w-5 text-foreground/80" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-heading font-semibold text-sm truncate text-foreground">
                  {current.title}
                </p>
                <Badge
                  variant={current.badgeVariant}
                  className="text-[10px] shrink-0"
                >
                  {current.badge}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {current.tagline}
              </p>
            </div>
          </div>

          {/* Navigation arrows */}
          {PROMOTIONS.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={prevSlide}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={nextSlide}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Bottom bar: dots + CTA */}
        <div className="mt-3 flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {PROMOTIONS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === activeIndex
                    ? "w-4 bg-foreground/60"
                    : "w-1.5 bg-foreground/20 hover:bg-foreground/30"
                )}
              />
            ))}
          </div>

          <Link
            href={current.href}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            {current.cta} <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
