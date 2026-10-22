import { format } from 'date-fns';

import { dateLocale } from '../i18n';

/** ISO weekdays, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * 1 January 2024 was a Monday, so day N of that month is ISO weekday N. The short name is cut to
 * three letters: Portuguese "EEE" is "segunda", too wide for seven chips in a row.
 */
export function weekdayName(isoDay: number, pattern: 'EEE' | 'EEEE'): string {
  const name = format(new Date(2024, 0, isoDay), pattern, { locale: dateLocale() });
  const shown = pattern === 'EEE' ? name.slice(0, 3) : name;
  return shown.charAt(0).toUpperCase() + shown.slice(1);
}
