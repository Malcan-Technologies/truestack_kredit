"use client";

import * as React from "react";
import { ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ZOOM_LEVELS = [
  { label: "Small", value: 100 },
  { label: "Default", value: 110 },
  { label: "Large", value: 125 },
] as const;

const DEFAULT_ZOOM = 110;
const STORAGE_KEY = "dashboard-zoom";

export function ZoomControl() {
  const [zoom, setZoom] = React.useState(DEFAULT_ZOOM);

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const level = saved ? Number(saved) : DEFAULT_ZOOM;
    if (ZOOM_LEVELS.some((l) => l.value === level)) {
      setZoom(level);
      applyZoom(level);
    } else {
      applyZoom(DEFAULT_ZOOM);
    }
  }, []);

  const applyZoom = (level: number) => {
    const main = document.getElementById("dashboard-main");
    if (main) {
      main.style.zoom = `${level}%`;
    }
  };

  const handleZoomChange = (level: number) => {
    setZoom(level);
    applyZoom(level);
    localStorage.setItem(STORAGE_KEY, String(level));
    const match = ZOOM_LEVELS.find((l) => l.value === level);
    toast.success(`Zoom set to ${match?.label || level + "%"}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <ZoomIn className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Zoom level</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ZOOM_LEVELS.map((level) => (
          <DropdownMenuItem
            key={level.value}
            onClick={() => handleZoomChange(level.value)}
            className={zoom === level.value ? "bg-accent/10 text-accent" : ""}
          >
            {level.label}
            <span className="ml-auto text-xs text-muted-foreground">
              {level.value}%
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
