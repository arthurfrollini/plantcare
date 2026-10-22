import { reminderSlots, type UserPlant } from '@plantcare/shared';

/** The next time this plant's reminder fires, on the device clock, or null for a bad reminder time. */
export function nextWateringAt(plant: UserPlant, now: Date = new Date()): Date | null {
  let slots;
  try {
    slots = reminderSlots(plant.frequency, plant.reminderTime);
  } catch {
    return null;
  }
  let best: Date | null = null;
  for (const slot of slots) {
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(slot.hour, slot.minute, 0, 0);
      const weekdayOk = slot.weekday === null || candidate.getDay() + 1 === slot.weekday;
      if (weekdayOk && candidate.getTime() > now.getTime()) {
        if (!best || candidate < best) best = candidate;
        break;
      }
    }
  }
  return best;
}

/** Plants ordered by their next reminder; plants without a valid one go last. */
export function sortByNextWatering(plants: UserPlant[]): { plant: UserPlant; next: Date | null }[] {
  const now = new Date();
  return plants
    .map((plant) => ({ plant, next: nextWateringAt(plant, now) }))
    .sort((a, b) => {
      if (a.next && b.next) return a.next.getTime() - b.next.getTime();
      if (a.next) return -1;
      if (b.next) return 1;
      return 0;
    });
}
