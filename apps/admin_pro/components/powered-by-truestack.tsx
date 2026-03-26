"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const TRUESTACK_URL = "https://truestack.my";

export function PoweredByTruestack({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground/70 tracking-wide mb-1">
        Powered by
      </p>
      <a
        href={TRUESTACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {mounted ? (
          <Image
            src={
              resolvedTheme === "dark" ? "/logo-dark.png" : "/logo-light.png"
            }
            alt="Truestack"
            width={100}
            height={26}
            className="h-5 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
          />
        ) : (
          <span className="h-5 w-[100px] bg-muted/30 rounded animate-pulse" />
        )}
      </a>
    </div>
  );
}

export function BackToTruestackButton({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  return (
    <a
      href={TRUESTACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
        variant === "ghost"
          ? "text-muted-foreground hover:text-foreground"
          : "border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md px-4 py-2"
      }`}
    >
      Back to Truestack
    </a>
  );
}

export function BackToRootButton({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
        variant === "ghost"
          ? "text-muted-foreground hover:text-foreground"
          : "border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md px-4 py-2"
      }`}
    >
      Back to home
    </Link>
  );
}
