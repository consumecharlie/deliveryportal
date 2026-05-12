"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Props {
  trigger: React.ReactNode;
  /** Called when the user confirms a schedule time (ISO string in UTC). */
  onSchedule: (isoString: string) => void;
  busy?: boolean;
}

function etOffsetForDate(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const part = fmt.formatToParts(d).find((p) => p.type === "timeZoneName");
  return part?.value === "GMT-4" ? -240 : -300;
}

/** Convert a wall-clock-in-ET (y/m/d/h/m) to a UTC ISO string. */
function etWallClockToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  const local = new Date(year, month - 1, day, hour, minute);
  const localTzMin = -local.getTimezoneOffset();
  const etOffsetMin = etOffsetForDate(local);
  const diffMin = localTzMin - etOffsetMin;
  return new Date(local.getTime() - diffMin * 60_000).toISOString();
}

function presetTomorrowAt9(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return etWallClockToIso(
    tomorrow.getFullYear(),
    tomorrow.getMonth() + 1,
    tomorrow.getDate(),
    9,
    0
  );
}

function presetNextMondayAt9(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMon = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + daysUntilMon);
  return etWallClockToIso(d.getFullYear(), d.getMonth() + 1, d.getDate(), 9, 0);
}

function presetInOneHour(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  const rounded = Math.ceil(d.getMinutes() / 5) * 5;
  d.setMinutes(rounded, 0, 0);
  return d.toISOString();
}

function formatET(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function SchedulePicker({ trigger, onSchedule, busy = false }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");

  const previewIso = useMemo(() => {
    if (!date || !time) return null;
    const [y, m, dd] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (!y || !m || !dd || hh == null || mm == null) return null;
    return etWallClockToIso(y, m, dd, hh, mm);
  }, [date, time]);

  // Recomputes whenever the picker re-renders (typing, opening, etc.), which
  // is desired — past-time validation needs current Date.now() at evaluation.
  const previewIsValid =
    previewIso != null &&
    new Date(previewIso).getTime() >
      // eslint-disable-next-line react-hooks/purity
      Date.now();

  const handlePick = (iso: string) => {
    setOpen(false);
    onSchedule(iso);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[360px] p-4 space-y-3" align="end">
        <div className="text-sm font-medium">Schedule send (Eastern)</div>
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePick(presetTomorrowAt9())}
            disabled={busy}
          >
            Tomorrow 9am ET
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePick(presetNextMondayAt9())}
            disabled={busy}
          >
            Monday 9am ET
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePick(presetInOneHour())}
            disabled={busy}
          >
            In 1 hour
          </Button>
        </div>
        <div className="border-t pt-3 space-y-2">
          <div className="text-xs text-muted-foreground">Or pick a time</div>
          <div className="flex gap-2">
            <input
              type="date"
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              type="time"
              step={300}
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          {previewIso && (
            <div
              className={`text-xs ${
                previewIsValid ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {previewIsValid
                ? `Will send: ${formatET(previewIso)}`
                : "Must be in the future"}
            </div>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={!previewIsValid || busy}
            onClick={() => previewIso && handlePick(previewIso)}
          >
            Schedule
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
