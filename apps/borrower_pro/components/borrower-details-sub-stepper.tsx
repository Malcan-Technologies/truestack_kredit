"use client";

import { IdCard, Phone, Users, Building2, FileText, CreditCard, Share2 } from "lucide-react";
import { cn } from "../lib/utils";

export type BorrowerDetailsSubStep = 1 | 2 | 3 | 4 | 5;

const INDIVIDUAL_STEPS: Array<{
  id: BorrowerDetailsSubStep;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 1,
    title: "Identity & Personal",
    description: "ID and personal info",
    icon: IdCard,
  },
  {
    id: 2,
    title: "Contact & Bank",
    description: "Contact and bank details",
    icon: Phone,
  },
  {
    id: 3,
    title: "Emergency & Social",
    description: "Emergency contact and social media",
    icon: Users,
  },
];

const CORPORATE_STEPS: Array<{
  id: BorrowerDetailsSubStep;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 1,
    title: "Company Info",
    description: "Company information",
    icon: Building2,
  },
  {
    id: 2,
    title: "Additional & Contact",
    description: "Additional details and contact",
    icon: FileText,
  },
  {
    id: 3,
    title: "Directors",
    description: "Company directors",
    icon: Users,
  },
  {
    id: 4,
    title: "Bank",
    description: "Bank information",
    icon: CreditCard,
  },
  {
    id: 5,
    title: "Social Media",
    description: "Social media profiles",
    icon: Share2,
  },
];

interface BorrowerDetailsSubStepperProps {
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  currentSubStep: BorrowerDetailsSubStep;
  className?: string;
}

export function BorrowerDetailsSubStepper({
  borrowerType,
  currentSubStep,
  className,
}: BorrowerDetailsSubStepperProps) {
  const steps = borrowerType === "INDIVIDUAL" ? INDIVIDUAL_STEPS : CORPORATE_STEPS;

  return (
    <div className={cn("rounded-lg border border-border bg-muted/20 p-3", className)}>
      {/* Mobile: vertical stack; Desktop: horizontal row with scroll if needed */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-nowrap md:items-center md:gap-2 md:w-full md:overflow-x-auto md:overflow-y-hidden md:min-w-0">
        {steps.map((s, index) => {
          const Icon = s.icon;
          const isActive = s.id === currentSubStep;
          const isCompleted = s.id < currentSubStep;

          return (
            <div
              key={s.id}
              className="flex items-center gap-2 md:flex-1 md:min-w-0 md:min-w-[100px]"
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 transition-colors flex-1 min-w-0 relative",
                  isActive
                    ? "border border-primary bg-primary/10 text-primary"
                    : isCompleted
                      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border border-border bg-muted/30 text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-emerald-600/40 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted"
                  )}
                >
                  {isCompleted ? "✓" : <Icon className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{s.title}</p>
                  <p
                    className={cn(
                      "text-[10px] truncate",
                      isActive
                        ? "text-primary/80"
                        : isCompleted
                          ? "text-emerald-700/80 dark:text-emerald-300/80"
                          : "text-muted-foreground"
                    )}
                  >
                    {s.description}
                  </p>
                </div>
              </div>
              {/* Desktop: connector between steps */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "hidden md:block mx-1 h-px w-4 shrink-0 flex-shrink-0",
                    s.id < currentSubStep ? "bg-emerald-500/60" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
