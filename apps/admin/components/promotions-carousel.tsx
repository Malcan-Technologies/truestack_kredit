"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROMOTIONS, type Promotion } from "@/lib/promotions";

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
      className={cn(
        "lg:col-span-2 overflow-hidden relative bg-gradient-to-br border transition-all duration-500",
        current.gradient,
        current.borderColor
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
              <current.icon className="h-5 w-5 text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-heading font-semibold text-sm truncate">
                  {current.title}
                </p>
                <Badge
                  variant={current.badgeVariant}
                  className="text-[10px] shrink-0"
                >
                  {current.badge}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-0.5 truncate">
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
