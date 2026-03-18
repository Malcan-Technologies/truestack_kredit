"use client";

import { User, FileText, CheckCircle } from "lucide-react";
import { cn } from "../lib/utils";

type OnboardingStep = 1 | 2 | 3;

const STEPS: Array<{
  id: OnboardingStep;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 1,
    title: "Choose Type",
    description: "Individual or Corporate",
    icon: User,
  },
  {
    id: 2,
    title: "Borrower Details",
    description: "Fill in your information",
    icon: FileText,
  },
  {
    id: 3,
    title: "Review & Confirm",
    description: "Verify and submit",
    icon: CheckCircle,
  },
];

interface OnboardingStepperProps {
  currentStep: OnboardingStep;
  className?: string;
}

export function OnboardingStepper({ currentStep, className }: OnboardingStepperProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] w-fit items-center gap-2 mx-auto">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCompleted
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-muted/30 text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                      isActive
                        ? "border-primary-foreground/40"
                        : isCompleted
                          ? "border-emerald-600/40"
                          : "border-border"
                    )}
                  >
                    {isCompleted ? "✓" : <Icon className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{step.title}</p>
                    <p
                      className={cn(
                        "text-xs",
                        isActive
                          ? "text-primary-foreground/80"
                          : isCompleted
                            ? "text-emerald-700/80 dark:text-emerald-300/80"
                            : "text-muted-foreground"
                      )}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>

                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-2 h-px w-8",
                      step.id < currentStep ? "bg-emerald-500/60" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <p className="text-sm text-amber-700 dark:text-amber-200">
          Your borrower profile becomes active after you confirm and submit.
        </p>
      </div>

      <div className="h-px w-full bg-border my-6" />
    </div>
  );
}
