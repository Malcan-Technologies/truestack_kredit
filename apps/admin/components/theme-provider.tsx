"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
      <ThemedToaster />
    </NextThemesProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !border-border !text-foreground !shadow-lg",
          title: "!text-foreground !font-medium",
          description: "!text-muted-foreground",
          actionButton:
            "!bg-foreground !text-background !font-medium",
          cancelButton:
            "!bg-secondary !text-foreground !font-medium",
          closeButton:
            "!bg-secondary !text-foreground !border-border",
          success:
            "!bg-card !border-border !text-foreground [&_[data-icon]]:!text-emerald-600",
          error:
            "!bg-card !border-border !text-foreground [&_[data-icon]]:!text-red-600",
          warning:
            "!bg-card !border-border !text-foreground [&_[data-icon]]:!text-amber-600",
          info: "!bg-card !border-border !text-foreground [&_[data-icon]]:!text-blue-600",
        },
      }}
    />
  );
}
