import { nextWatering, type UserPlant } from '@plantcare/shared';

/** The next watering moment on the device clock, or null for a bad reminder time. */
export function nextWateringAt(plant: UserPlant, now: Date = new Date()): Date | null {
  return nextWatering(plant, now);
}

/** Plants ordered by their next watering; plants without a valid one go last. */
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
