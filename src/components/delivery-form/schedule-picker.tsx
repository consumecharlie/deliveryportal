"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";

interface Props {
  trigger: React.ReactNode;
  /** Called when the user confirms a schedule time (UTC ISO string). */
  onSchedule: (isoString: string) => void;
  busy?: boolean;
}

// ── Time-zone math ──

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

/** Get the current wall-clock date in ET as {y,m,d}. */
function todayInET(): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Current ET wall-clock {h,m}. */
function nowInET(): { h: number; m: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { h: get("hour"), m: get("minute") };
}

// ── Presets ──

function presetTomorrowAt9(): string {
  const t = todayInET();
  const tomorrow = new Date(Date.UTC(t.y, t.m - 1, t.d + 1));
  return etWallClockToIso(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    9,
    0
  );
}

function presetNextMondayAt9(): string {
  const t = todayInET();
  const today = new Date(Date.UTC(t.y, t.m - 1, t.d));
  const dow = today.getUTCDay();
  const daysUntilMon = ((8 - dow) % 7) || 7;
  const target = new Date(today.getTime() + daysUntilMon * 86_400_000);
  return etWallClockToIso(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    9,
    0
  );
}

function presetInOneHour(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  const rounded = Math.ceil(d.getMinutes() / 5) * 5;
  d.setMinutes(rounded, 0, 0);
  return d.toISOString();
}

function formatPresetTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPresetWeekday(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  });
}

// ── Custom dialog defaults ──

/**
 * Smart default: today + next quarter-hour at least 30 minutes from now in ET.
 * If that would be in the next day (e.g. clicked at 11:55 PM), bump to tomorrow 9 AM.
 */
function defaultDateTime(): { date: { y: number; m: number; d: number }; minutes: number } {
  const t = todayInET();
  const { h, m } = nowInET();
  const totalMin = h * 60 + m + 30;
  const rounded = Math.ceil(totalMin / 15) * 15;
  if (rounded >= 24 * 60) {
    const tomorrow = new Date(Date.UTC(t.y, t.m - 1, t.d + 1));
    return {
      date: {
        y: tomorrow.getUTCFullYear(),
        m: tomorrow.getUTCMonth() + 1,
        d: tomorrow.getUTCDate(),
      },
      minutes: 9 * 60,
    };
  }
  return { date: t, minutes: rounded };
}

// ── Calendar helpers ──

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function startWeekdayOfMonth(year: number, month1: number): number {
  return new Date(year, month1 - 1, 1).getDay();
}

function compareDate(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number }
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function formatMinutes(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDateLabel(
  date: { y: number; m: number; d: number },
  today: { y: number; m: number; d: number }
): string {
  const diff = compareDate(date, today);
  if (diff === 0) return "Today";
  const tomorrow = new Date(Date.UTC(today.y, today.m - 1, today.d + 1));
  if (
    date.y === tomorrow.getUTCFullYear() &&
    date.m === tomorrow.getUTCMonth() + 1 &&
    date.d === tomorrow.getUTCDate()
  ) {
    return "Tomorrow";
  }
  // Within a week → weekday name; otherwise short date.
  const target = new Date(Date.UTC(date.y, date.m - 1, date.d));
  const todayMs = Date.UTC(today.y, today.m - 1, today.d);
  const daysOut = Math.round((target.getTime() - todayMs) / 86_400_000);
  if (daysOut > 0 && daysOut < 7) {
    return target.toLocaleString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
  }
  return target.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── DateDropdown ──

function DateDropdown({
  value,
  onChange,
  today,
}: {
  value: { y: number; m: number; d: number };
  onChange: (v: { y: number; m: number; d: number }) => void;
  today: { y: number; m: number; d: number };
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.y);
  const [viewMonth, setViewMonth] = useState(value.m);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setViewYear(value.y);
      setViewMonth(value.m);
    }
  };

  const numDays = daysInMonth(viewYear, viewMonth);
  const firstWeekday = startWeekdayOfMonth(viewYear, viewMonth);
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const goMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 flex-1 justify-between font-normal text-base"
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {formatDateLabel(value, today)}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            className="h-7 w-7 rounded hover:bg-accent inline-flex items-center justify-center"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </div>
          <button
            type="button"
            onClick={() => goMonth(1)}
            className="h-7 w-7 rounded hover:bg-accent inline-flex items-center justify-center"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} className="h-9" />;
            const cellDate = { y: viewYear, m: viewMonth, d: day };
            const isPast = compareDate(cellDate, today) < 0;
            const isToday = compareDate(cellDate, today) === 0;
            const isSelected = compareDate(cellDate, value) === 0;
            return (
              <button
                key={i}
                type="button"
                disabled={isPast}
                onClick={() => {
                  onChange(cellDate);
                  setOpen(false);
                }}
                className={[
                  "h-9 w-9 rounded text-sm flex items-center justify-center transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground ring-2 ring-primary"
                    : isToday
                      ? "ring-1 ring-primary text-foreground hover:bg-accent"
                      : isPast
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-foreground hover:bg-accent",
                ].join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── TimeDropdown ──

function TimeDropdown({
  value,
  onChange,
  minMinutes,
}: {
  /** Time in minutes since 00:00 ET. */
  value: number;
  onChange: (v: number) => void;
  /** Earliest selectable minutes for the current date (e.g. now+1 if date is today). */
  minMinutes: number;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const options = useMemo(() => {
    const out: number[] = [];
    for (let m = 0; m < 24 * 60; m += 15) {
      if (m >= minMinutes) out.push(m);
    }
    return out;
  }, [minMinutes]);

  // Snap displayed value to a valid option if the current selection is now too early
  // (e.g. user picked time, time elapsed, list shifted). UI shows the raw value; we
  // only push corrections via onChange when needed.
  useEffect(() => {
    if (value < minMinutes && options.length > 0) {
      onChange(options[0]);
    }
  }, [value, minMinutes, options, onChange]);

  useEffect(() => {
    if (open && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "center" });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 flex-1 justify-between font-normal text-base"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {formatMinutes(value)}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-1"
        align="end"
        style={{
          maxHeight: "min(280px, var(--radix-popover-content-available-height))",
          overflowY: "auto",
        }}
      >
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No times available today
          </div>
        ) : (
          options.map((m) => {
            const isSelected = m === value;
            return (
              <button
                key={m}
                ref={isSelected ? selectedRef : null}
                type="button"
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 transition-colors",
                  isSelected
                    ? "bg-primary/15 text-foreground font-medium"
                    : "hover:bg-accent",
                ].join(" ")}
              >
                <Check
                  className={`h-3.5 w-3.5 ${
                    isSelected ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span>{formatMinutes(m)}</span>
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── CustomTimeDialog ──

function CustomTimeDialog({
  open,
  onOpenChange,
  onSchedule,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSchedule: (iso: string) => void;
  busy: boolean;
}) {
  const today = useMemo(() => todayInET(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => defaultDateTime(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [date, setDate] = useState(initial.date);
  const [minutes, setMinutes] = useState(initial.minutes);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const fresh = defaultDateTime();
      setDate(fresh.date);
      setMinutes(fresh.minutes);
    }
    onOpenChange(next);
  };

  const isToday = compareDate(date, today) === 0;
  const nowEt = nowInET();
  const minMinutesToday = Math.ceil((nowEt.h * 60 + nowEt.m + 1) / 15) * 15;
  const minMinutes = isToday ? minMinutesToday : 0;

  const valid = minutes >= minMinutes;

  const handleConfirm = () => {
    if (!valid) return;
    const iso = etWallClockToIso(
      date.y,
      date.m,
      date.d,
      Math.floor(minutes / 60),
      minutes % 60
    );
    onSchedule(iso);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Schedule send</DialogTitle>
          <DialogDescription>
            Time zone: Eastern Time (US and Canada)
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 py-2">
          <DateDropdown value={date} onChange={setDate} today={today} />
          <TimeDropdown
            value={minutes}
            onChange={setMinutes}
            minMinutes={minMinutes}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={handleConfirm}>
            Schedule send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Public SchedulePicker (preset menu + Custom time dialog) ──

export function SchedulePicker({ trigger, onSchedule, busy = false }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  // Computed at render time so previews stay fresh while the menu is closed.
  const tomorrowIso = presetTomorrowAt9();
  const mondayIso = presetNextMondayAt9();
  const inOneHourIso = presetInOneHour();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[260px]">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Schedule send
          </div>
          <DropdownMenuItem
            onClick={() => onSchedule(inOneHourIso)}
            disabled={busy}
            className="flex flex-col items-start gap-0"
          >
            <span className="text-sm">In 1 hour</span>
            <span className="text-[11px] text-muted-foreground">
              {formatPresetTime(inOneHourIso)} ET
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSchedule(tomorrowIso)}
            disabled={busy}
            className="flex flex-col items-start gap-0"
          >
            <span className="text-sm">Tomorrow at 9:00 AM</span>
            <span className="text-[11px] text-muted-foreground">
              {formatPresetWeekday(tomorrowIso)}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSchedule(mondayIso)}
            disabled={busy}
            className="flex flex-col items-start gap-0"
          >
            <span className="text-sm">Next Monday at 9:00 AM</span>
            <span className="text-[11px] text-muted-foreground">
              {formatPresetTime(mondayIso)} ET
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCustomOpen(true)}
            disabled={busy}
          >
            Custom time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CustomTimeDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onSchedule={onSchedule}
        busy={busy}
      />
    </>
  );
}
