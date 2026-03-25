"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OfficeHours = {
  weekdays: number[];
  start: string;
  end: string;
  slotStepMinutes?: number;
  slotDurationMinutes?: number;
};

export default function AvailabilitySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekdays, setWeekdays] = useState("1,2,3,4,5");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<OfficeHours>("/api/loans/attestation/office-hours");
    if (res.success && res.data) {
      setWeekdays((res.data.weekdays ?? [1, 2, 3, 4, 5]).join(","));
      setStart(res.data.start ?? "09:00");
      setEnd(res.data.end ?? "17:00");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const wd = weekdays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 7);
    if (wd.length === 0) {
      toast.error("Enter at least one weekday (1=Mon … 7=Sun).");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put("/api/loans/attestation/office-hours", {
        weekdays: wd,
        start,
        end,
        slotStepMinutes: 30,
        slotDurationMinutes: 60,
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
    <div className="space-y-6 p-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Availability settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Used when Google Calendar free/busy is unavailable. Slots use a 30-minute grid and 60-minute
          bookings (Malaysia time).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Office hours fallback</CardTitle>
          <CardDescription>Weekdays as comma-separated ISO numbers: 1=Mon … 7=Sun.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="wd">Weekdays</Label>
            <Input id="wd" value={weekdays} onChange={(e) => setWeekdays(e.target.value)} placeholder="1,2,3,4,5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="st">Start</Label>
              <Input id="st" value={start} onChange={(e) => setStart(e.target.value)} placeholder="09:00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="en">End</Label>
              <Input id="en" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="17:00" />
            </div>
          </div>
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
