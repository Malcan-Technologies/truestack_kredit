"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type OfficeHours = {
  weekdays: number[];
  start: string;
  end: string;
  slotStepMinutes?: number;
  slotDurationMinutes?: number;
  availabilityHorizonDays?: number;
};

const DAY_LABELS: { n: number; label: string; short: string }[] = [
  { n: 1, label: "Monday", short: "Mon" },
  { n: 2, label: "Tuesday", short: "Tue" },
  { n: 3, label: "Wednesday", short: "Wed" },
  { n: 4, label: "Thursday", short: "Thu" },
  { n: 5, label: "Friday", short: "Fri" },
  { n: 6, label: "Saturday", short: "Sat" },
  { n: 7, label: "Sunday", short: "Sun" },
];

export default function AvailabilitySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [horizonDaysInput, setHorizonDaysInput] = useState("7");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<OfficeHours>("/api/loans/attestation/office-hours");
    if (res.success && res.data) {
      setWeekdays(res.data.weekdays?.length ? res.data.weekdays : [1, 2, 3, 4, 5]);
      setStart(res.data.start ?? "09:00");
      setEnd(res.data.end ?? "17:00");
      setHorizonDaysInput(
        String(
          res.data.availabilityHorizonDays != null
            ? Math.min(7, Math.max(1, res.data.availabilityHorizonDays))
            : 7
        )
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDay = (n: number) => {
    setWeekdays((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n).sort((a, b) => a - b) : [...prev, n].sort((a, b) => a - b)
    );
  };

  const onSave = async () => {
    if (weekdays.length === 0) {
      toast.error("Select at least one weekday.");
      return;
    }
    const raw = horizonDaysInput.trim();
    const n = parseInt(raw, 10);
    if (!/^\d+$/.test(raw) || Number.isNaN(n) || n < 1 || n > 7) {
      toast.error("Enter a whole number of days between 1 and 7.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put("/api/loans/attestation/office-hours", {
        weekdays,
        start,
        end,
        slotStepMinutes: 30,
        slotDurationMinutes: 60,
        availabilityHorizonDays: n,
      });
      if (!res.success) {
        toast.error(res.error ?? "Save failed");
        return;
      }
      toast.success("Availability settings saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Availability settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Used when Google Calendar free/busy is unavailable. Slots use a 30-minute grid and 60-minute
          bookings (Malaysia time).
        </p>
      </div>

      <Card className="text-left">
        <CardHeader>
          <CardTitle className="text-base">Office days</CardTitle>
          <CardDescription>Select which weekdays borrowers can book.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap justify-center gap-2">
            {DAY_LABELS.map((d) => {
              const on = weekdays.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDay(d.n)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  )}
                  title={d.label}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="text-left">
        <CardHeader>
          <CardTitle className="text-base">Daily hours</CardTitle>
          <CardDescription>Start and end time for each selected weekday.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-1">
            <Label htmlFor="st">Start</Label>
            <input
              id="st"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="en">End</Label>
            <input
              id="en"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="text-left">
        <CardHeader>
          <CardTitle className="text-base">Availability horizon</CardTitle>
          <CardDescription>
            How many calendar days ahead to show bookable slots (1–7). This replaces a fixed 14-day window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-center">
            <div className="space-y-1 flex-1 max-w-xs mx-auto sm:mx-0">
              <Label htmlFor="horizon-days">Days ahead</Label>
              <Input
                id="horizon-days"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 7"
                value={horizonDaysInput}
                onChange={(e) => setHorizonDaysInput(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Borrowers only see slots within this many days from today (whole numbers 1–7).
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-center">
      <Button onClick={() => void onSave()} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save
      </Button>
      </div>
    </div>
  );
}
