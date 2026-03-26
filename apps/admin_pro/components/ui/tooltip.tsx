"use client";

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function useHasHover() {
  const [hasHover, setHasHover] = React.useState(true)
  React.useEffect(() => {
    try {
      const mq = window.matchMedia("(hover: hover)")
      setHasHover(mq.matches)
      const handler = (e: MediaQueryListEvent) => setHasHover(e.matches)
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    } catch {
      return
    }
  }, [])
  return hasHover
}

type TooltipTriggerContextType = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  supportMobileTap: boolean
  ignoreNextCloseRef: React.MutableRefObject<boolean>
}

const TooltipTriggerContext = React.createContext<TooltipTriggerContextType>({
  open: false,
  setOpen: () => {},
  supportMobileTap: false,
  ignoreNextCloseRef: { current: false },
})

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip: React.FC<React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>> = ({
  children,
  defaultOpen,
  open: openProp,
  onOpenChange,
  ...props
}) => {
  const hasHover = useHasHover()
  const [open, setOpen] = React.useState(defaultOpen ?? false)
  const isControlled = openProp !== undefined
  const isOpen = isControlled ? openProp : open
  const ignoreNextCloseRef = React.useRef(false)

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && ignoreNextCloseRef.current) {
        ignoreNextCloseRef.current = false
        return
      }
      if (!isControlled) setOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <TooltipTriggerContext.Provider
      value={{
        open: isOpen,
        setOpen: (value) => {
          const next = typeof value === "function" ? value(isOpen) : value
          if (!isControlled) setOpen(next)
          onOpenChange?.(next)
        },
        supportMobileTap: true,
        ignoreNextCloseRef,
      }}
    >
      <TooltipPrimitive.Root
        open={isControlled ? openProp : open}
        onOpenChange={handleOpenChange}
        delayDuration={hasHover ? undefined : 0}
        {...props}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipTriggerContext.Provider>
  )
}
Tooltip.displayName = TooltipPrimitive.Root.displayName

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ children, onClick, ...props }, ref) => {
  const hasHover = useHasHover()
  const { setOpen, supportMobileTap, ignoreNextCloseRef } =
    React.useContext(TooltipTriggerContext)

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!hasHover && supportMobileTap) {
        e.preventDefault()
        ignoreNextCloseRef.current = true
        setOpen((prev) => !prev)
      }
      onClick?.(e)
    },
    [setOpen, hasHover, supportMobileTap, ignoreNextCloseRef, onClick]
  )

  return (
    <TooltipPrimitive.Trigger ref={ref} onClick={handleClick} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  )
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
