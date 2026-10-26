import { reminderTimeSchema, type Frequency } from './schemas';

export type ScheduleInput = {
  frequency: Frequency;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  wateringDays: number[];
  reminderTime: string;
  reminderLeadMinutes: number;
  /** YYYY-MM-DD anchor for every-two-weeks and monthly plants. */
  scheduleStartsOn: string | null;
};

export type ReminderMoment = {
  /** When the reminder fires. */
  at: Date;
  /** Local YYYY-MM-DD of the watering it belongs to. */
  wateringOn: string;
};

const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  1: [1],
  2: [2, 4],
  3: [1, 4, 7],
  4: [1, 3, 5, 7],
  5: [1, 2, 4, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

export function requiredWateringDays(f: Frequency): number {
  if (f.per === 'day') return 0;
  if (f.per === 'week') return f.times;
  return 1;
}

export function defaultWateringDays(f: Frequency): number[] {
  if (f.per === 'day') return [];
  if (f.per === 'week') return [...(DEFAULT_WEEKDAYS[f.times] ?? [])];
  return [1];
}

/** The stored days when their count fits the frequency, else the defaults. */
export function effectiveWateringDays(
  frequency: Frequency,
  wateringDays: number[],
): number[] {
  return wateringDays.length === requiredWateringDays(frequency)
    ? wateringDays
    : defaultWateringDays(frequency);
}

function effectiveDays(input: ScheduleInput): number[] {
  return effectiveWateringDays(input.frequency, input.wateringDays);
}

function parseTime(time: string): { hour: number; minute: number } | null {
  if (!reminderTimeSchema.safeParse(time).success) return null;
  const [hourText = '', minuteText = ''] = time.split(':');
  return { hour: Number(hourText), minute: Number(minuteText) };
}

function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function parseDate(text: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

function intervalDays(frequency: Frequency): number {
  return frequency.per === 'month' ? 28 : 14;
}

/** Watering moments for date-based plants, in order, from the anchor on. */
function* dateOccurrences(
  input: ScheduleInput,
  time: { hour: number; minute: number },
  now: Date,
): Generator<Date> {
  const step = intervalDays(input.frequency);
  const at = (y: number, m: number, d: number) =>
    new Date(y, m, d, time.hour, time.minute);

  const parsed = input.scheduleStartsOn
    ? parseDate(input.scheduleStartsOn)
    : null;
  // Without an anchor, the phase counts from a fixed Monday (2024-01-01), so
  // it stays the same from one sync to the next instead of restarting at now.
  const anchor = parsed
    ? at(...parsed)
    : at(2024, 0, effectiveDays(input)[0] ?? 1);

  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();
  // Skip whole periods that are long gone, with a one-period safety margin.
  const elapsedDays = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(y, m, d)) /
      86_400_000,
  );
  for (let k = Math.max(0, Math.floor(elapsedDays / step) - 1); ; k++) {
    yield at(y, m, d + k * step);
  }
}

export function nextWatering(input: ScheduleInput, now: Date): Date | null {
  const time = parseTime(input.reminderTime);
  if (!time) return null;
  const at = (offset: number) =>
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
      time.hour,
      time.minute,
    );

  const { per } = input.frequency;
  if (per === 'day' || per === 'week') {
    const days = per === 'day' ? null : effectiveDays(input);
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = at(offset);
      if (candidate <= now) continue;
      if (!days || days.includes(isoWeekday(candidate))) return candidate;
    }
    return null;
  }

  for (const watering of dateOccurrences(input, time, now)) {
    if (watering > now) return watering;
  }
  return null;
}

/** Device-local YYYY-MM-DD for a moment. */
export function toLocalDateString(date: Date): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** The watering time on that local calendar day, or null if none. */
export function wateringTimeOn(input: ScheduleInput, day: Date): Date | null {
  const time = parseTime(input.reminderTime);
  if (!time) return null;
  const at = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.hour,
    time.minute,
  );

  const { per } = input.frequency;
  if (per === 'day') return at;
  if (per === 'week') {
    return effectiveDays(input).includes(isoWeekday(at)) ? at : null;
  }

  for (const watering of dateOccurrences(input, time, day)) {
    // Occurrences share the time of day, so the first one not before `at`
    // is either this very day or a later one.
    if (watering >= at) return watering.getTime() === at.getTime() ? at : null;
  }
  return null;
}

/**
 * Every reminder with `from < at <= until`, in time order. `at` is the
 * watering time minus the lead, so a reminder can fall on the day before its
 * watering. Throws on a malformed reminder time.
 */
export function reminderMoments(
  input: ScheduleInput,
  from: Date,
  until: Date,
): ReminderMoment[] {
  if (!parseTime(input.reminderTime)) {
    throw new Error(`Invalid reminder time: ${input.reminderTime}`);
  }
  const moments: ReminderMoment[] = [];
  // A watering up to a day after `until` can still remind inside the window
  // when the lead is long, and one a day before `from` can still be ahead.
  // Stepping by calendar day (not 24 h) keeps DST changes from drifting.
  const first = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() - 1,
  );
  const last = new Date(
    until.getFullYear(),
    until.getMonth(),
    until.getDate() + 1,
  );
  for (let k = 0; ; k++) {
    const day = new Date(
      first.getFullYear(),
      first.getMonth(),
      first.getDate() + k,
    );
    if (day > last) break;
    const watering = wateringTimeOn(input, day);
    if (!watering) continue;
    const at = new Date(
      watering.getTime() - input.reminderLeadMinutes * 60_000,
    );
    if (at > from && at <= until) {
      moments.push({ at, wateringOn: toLocalDateString(watering) });
    }
  }
  return moments.sort((a, b) => a.at.getTime() - b.at.getTime());
}
