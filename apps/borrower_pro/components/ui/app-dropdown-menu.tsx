"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

import { DropdownMenuContent } from "./dropdown-menu";

/**
 * Opaque “card” panel for dropdown menus — light mode uses a solid white
 * background so portals never look transparent over the sidebar. Dark mode
 * uses `card` tokens. Reuse this in any app copied from Demo_Client.
 *
 * Wraps the shared `DropdownMenuContent`; pass `className` for width (`w-56`),
 * and `side` / `align` / `sideOffset` / `alignOffset` as needed.
 */
export const AppDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuContent
    ref={ref}
    className={cn(
      "border border-border bg-white text-foreground shadow-lg",
      "dark:bg-card dark:text-card-foreground",
      "duration-200",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
AppDropdownMenuContent.displayName = "AppDropdownMenuContent";
