"use client";

import { cn } from "../lib/utils";
import type { BorrowerDetailsSubStep } from "./borrower-details-sub-stepper";

const INDIVIDUAL_STEP_COUNT = 5;
const CORPORATE_STEP_COUNT = 7;

const INDIVIDUAL_STEP_TITLES = [
  "Choose Type",
  "Identity & Personal",
  "Contact & Bank",
  "Emergency & Social",
  "Review & Confirm",
];

const CORPORATE_STEP_TITLES = [
  "Choose Type",
  "Company Info",
  "Additional & Contact",
  "Directors",
  "Bank Details",
  "Social Media",
  "Review & Confirm",
];

function toFlatIndex(
  mainStep: 1 | 2 | 3,
  subStep: BorrowerDetailsSubStep
): number {
  if (mainStep === 1) return 0;
  if (mainStep === 2) return subStep;
  return -1;
}

interface OnboardingProgressProps {
  mainStep: 1 | 2 | 3;
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  subStep: BorrowerDetailsSubStep;
  className?: string;
}

export function OnboardingProgress({
  mainStep,
  borrowerType,
  subStep,
  className,
}: OnboardingProgressProps) {
  const totalSteps =
    borrowerType === "INDIVIDUAL" ? INDIVIDUAL_STEP_COUNT : CORPORATE_STEP_COUNT;
  const titles =
    borrowerType === "INDIVIDUAL" ? INDIVIDUAL_STEP_TITLES : CORPORATE_STEP_TITLES;

  let activeIndex: number;
  if (mainStep === 3) {
    activeIndex = totalSteps - 1;
  } else {
    activeIndex = toFlatIndex(mainStep, subStep);
  }

  const percent = Math.round((activeIndex / (totalSteps - 1)) * 100);

  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">
          Step {activeIndex + 1} of {totalSteps}
        </span>
        <span className="text-xs text-muted-foreground">
          {titles[activeIndex]}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-in-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function getOnboardingTotalSteps(
  borrowerType: "INDIVIDUAL" | "CORPORATE"
): number {
  return borrowerType === "INDIVIDUAL"
    ? INDIVIDUAL_STEP_COUNT
    : CORPORATE_STEP_COUNT;
}

export function getOnboardingCurrentStepIndex(
  mainStep: 1 | 2 | 3,
  subStep: BorrowerDetailsSubStep,
  borrowerType: "INDIVIDUAL" | "CORPORATE"
): number {
  const total = getOnboardingTotalSteps(borrowerType);
  if (mainStep === 3) return total - 1;
  return toFlatIndex(mainStep, subStep);
}
