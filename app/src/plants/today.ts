import { toLocalDateString, wateringTimeOn, type UserPlant } from '@plantcare/shared';

export type TodayRow = {
  plant: UserPlant;
  time: Date;
  done: boolean;
  late: boolean;
};

/** Furthest day looked at for the next watering; monthly plants repeat every 28 days. */
const LOOKAHEAD_DAYS = 35;

/** Plants due on the device's calendar day of `now`, by time and then name. */
export function todayRows(plants: UserPlant[], now: Date): TodayRow[] {
  const today = toLocalDateString(now);
  const rows: TodayRow[] = [];
  for (const plant of plants) {
    const time = wateringTimeOn(plant, now);
    if (!time) continue;
    const done = plant.lastWateredOn === today;
    rows.push({ plant, time, done, late: !done && time < now });
  }
  return rows.sort(
    (a, b) =>
      a.time.getTime() - b.time.getTime() || a.plant.speciesName.localeCompare(b.plant.speciesName),
  );
}

/** The first watering from tomorrow on, for the message on a day with nothing to water. */
export function nextWateringAfterToday(
  plants: UserPlant[],
  now: Date,
): { plant: UserPlant; at: Date } | null {
  for (let offset = 1; offset <= LOOKAHEAD_DAYS; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    let best: { plant: UserPlant; at: Date } | null = null;
    for (const plant of plants) {
      const at = wateringTimeOn(plant, day);
      if (at && (!best || at < best.at)) best = { plant, at };
    }
    if (best) return best;
  }
  return null;
}
