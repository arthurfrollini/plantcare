const WEEKDAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

type ZoneClock = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

function zoneClock(now: Date, timeZone: string): ZoneClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: WEEKDAYS[value('weekday')] ?? 1,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

/**
 * The next date (YYYY-MM-DD, in `timeZone`) on the given ISO weekday at
 * `reminderTime`. Today counts only while the time has not passed there.
 */
export function nextOccurrenceDate(
  isoWeekday: number,
  reminderTime: string,
  timeZone: string,
  now: Date,
): string {
  const [hourText = '0', minuteText = '0'] = reminderTime.split(':');
  const target = Number(hourText) * 60 + Number(minuteText);
  const clock = zoneClock(now, timeZone);
  let offset = (isoWeekday - clock.weekday + 7) % 7;
  if (offset === 0 && clock.minutes >= target) offset = 7;
  const date = new Date(
    Date.UTC(clock.year, clock.month - 1, clock.day + offset),
  );
  return date.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export function todayInZone(timeZone: string, now: Date): string {
  const { year, month, day } = zoneClock(now, timeZone);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
