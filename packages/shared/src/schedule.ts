import { reminderTimeSchema, type Frequency } from './schemas';

export type ReminderSlot = {
  /** Expo convention: 1 = Sunday ... 7 = Saturday; null for daily. */
  weekday: number | null;
  hour: number;
  minute: number;
};

const SUN = 1;
const MON = 2;
const TUE = 3;
const WED = 4;
const THU = 5;
const FRI = 6;
const SAT = 7;

const WEEKLY_WEEKDAYS: Record<number, readonly number[]> = {
  1: [MON],
  2: [MON, THU],
  3: [MON, WED, FRI],
  4: [MON, WED, FRI, SUN],
  5: [MON, TUE, THU, FRI, SAT],
  6: [MON, TUE, WED, THU, FRI, SAT],
  7: [SUN, MON, TUE, WED, THU, FRI, SAT],
};

export function reminderSlots(
  frequency: Frequency,
  reminderTime: string,
): ReminderSlot[] {
  if (!reminderTimeSchema.safeParse(reminderTime).success) {
    throw new Error(`Invalid reminder time: ${reminderTime}`);
  }
  const [hourText = '', minuteText = ''] = reminderTime.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (frequency.per === 'day') {
    return [{ weekday: null, hour, minute }];
  }
  const weekdays = WEEKLY_WEEKDAYS[frequency.times] ?? [];
  return weekdays.map((weekday) => ({ weekday, hour, minute }));
}
