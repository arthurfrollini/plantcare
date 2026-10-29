import { differenceInCalendarDays, format } from 'date-fns';
import type { TFunction } from 'i18next';

import { dateLocale } from '../i18n';

/** "at 01:30" / "à 01:30": Portuguese takes the singular for one o'clock. */
export function wateringAt(t: TFunction, when: Date): string {
  const time = format(when, 'HH:mm');
  return when.getHours() === 1 ? t('today.atOne', { time }) : t('today.at', { time });
}

/** "Today at 12:55", "Tomorrow at 12:55", "Friday at 08:00", then "November 4 at 08:00". */
export function describeWatering(t: TFunction, when: Date, now: Date): string {
  const at = wateringAt(t, when);
  const days = differenceInCalendarDays(when, now);
  const locale = dateLocale();
  if (days <= 0) return t('when.today', { at });
  if (days === 1) return t('when.tomorrow', { at });
  // Within the coming week a weekday is unambiguous; otherwise, the date.
  if (days <= 6) {
    const day = format(when, 'EEEE', { locale });
    return t('when.weekday', { day: day.charAt(0).toUpperCase() + day.slice(1), at });
  }
  return t('when.date', { date: format(when, t('today.dateFormat'), { locale }), at });
}
