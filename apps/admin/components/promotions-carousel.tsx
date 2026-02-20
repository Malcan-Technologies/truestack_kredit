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
    if (isPaused || PROMOTIONS.length <= 1) return;
    const timer = setInterval(nextSlide, AUTO_ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const current = PROMOTIONS[activeIndex];

  return (
    <Card
      className={cn(
        "lg:col-span-2 overflow-hidden relative border transition-all duration-500 bg-gradient-to-br",
        current.gradient,
        current.borderColor
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Subtle top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.12] dark:via-white/[0.12] to-transparent" />
      <CardContent className="py-4">
        <div className={cn(
          current.illustration ? "grid grid-cols-[auto_1fr] gap-x-3" : "flex flex-col gap-3"
        )}>
          {/* Illustration or icon - spans full height when illustration */}
          <div className={cn(
            current.illustration
              ? "row-span-2 self-stretch flex items-start justify-center min-h-[72px] pr-1"
              : "flex items-start justify-between gap-2"
          )}>
            <div className={cn(
              "flex shrink-0 items-center justify-center rounded-lg overflow-hidden",
              current.illustration ? "h-full min-w-[64px] bg-neutral-100 dark:bg-neutral-800/60 p-2" : "h-10 w-10",
              !current.illustration && "bg-foreground/[0.10] dark:bg-black/30 ring-1 ring-foreground/[0.06] dark:ring-white/[0.06]"
            )}>
              {current.illustration ? (
                <img
                  src={current.illustration}
                  alt=""
                  className="h-full w-auto max-w-[80px] object-contain object-top"
                />
              ) : (
                <current.icon className="h-5 w-5 text-foreground/80 dark:text-white/80" />
              )}
            </div>
            {!current.illustration && (
              <>
                <div className="min-w-0 flex-1 flex flex-col items-start gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-semibold text-base truncate text-foreground">
                      {current.title}
                    </p>
                    <Badge
                      variant={current.badgeVariant}
                      className="text-xs shrink-0"
                    >
                      {current.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {current.tagline}
                  </p>
                  <Link
                    href={current.href}
                    className="text-sm text-foreground hover:text-muted-foreground hover:underline flex items-center gap-1 mt-0.5"
                  >
                    {current.cta} <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
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
              </>
            )}
          </div>

          <div className={cn(
            "flex items-start justify-between gap-2 min-w-0",
            !current.illustration && "hidden"
          )}>
            <div className="min-w-0 flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <p className="font-heading font-semibold text-base truncate text-foreground">
                  {current.title}
                </p>
                <Badge
                  variant={current.badgeVariant}
                  className="text-xs shrink-0"
                >
                  {current.badge}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {current.tagline}
              </p>
              <Link
                href={current.href}
                className="text-sm text-foreground hover:text-muted-foreground hover:underline flex items-center gap-1 mt-0.5"
              >
                {current.cta} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Navigation arrows - only when multiple promos */}
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

          {/* Bottom bar: dots - only when multiple promos */}
          {PROMOTIONS.length > 1 && (
          <div className="mt-3 flex items-center justify-start">
            <div className="flex items-center gap-1.5">
              {PROMOTIONS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    idx === activeIndex
                      ? "w-4 bg-foreground/60 dark:bg-white/60"
                      : "w-1.5 bg-foreground/20 dark:bg-white/20 hover:bg-foreground/30 dark:hover:bg-white/30"
                  )}
                />
              ))}
            </div>
          </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
