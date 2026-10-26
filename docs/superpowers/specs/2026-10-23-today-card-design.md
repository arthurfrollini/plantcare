# My plants: the "Today" card

Date: 2026-10-23. Builds on `main` after PR #6.

## Why

My plants is the screen the app opens on, and today it leads with a single sentence about the next watering ("Don't forget to water your X in 3 hours"). Arthur wants the first thing he sees in the morning to be what needs watering today, with a way to tick it off, and his garden below.

## Goals

- A "Today" card at the top of My plants listing every plant with a watering scheduled today, in time order, with a "Watered ✓" button on each.
- Progress for the day: "2 of 3" and a bar.
- Watering is recorded on the server, so it survives reinstalls and other devices, and can later feed a history and a streak.
- The garden (the current list of plant cards) stays below, titled "My garden".

## Non-goals

- Skipping or cancelling today's notification for a plant already watered. Weekly reminders repeat on the phone and iOS cannot cancel one occurrence of a series; doing this means moving every reminder to dated triggers, a separate piece of work.
- Marking a plant watered on a day it is not scheduled.
- A watering history screen, a streak, or statistics (the data is kept so they can come later).
- Missed waterings from previous days.

## Anti-goals

- A plant ticked as watered that shows as not watered after reopening the app.
- The card claiming a plant is due today when its reminder schedule says otherwise.

## The card

```
Today                          2 of 3 💧
▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░
🌿 Zamioculca     09:30     [Watered ✓]
🌵 Cactus         13:00     ✓ Watered    (tap to undo)
🌱 Imbé           18:30     [Watered ✓]
```

- **Which plants:** those whose schedule has a watering on today's date, on the device clock, using the shared `nextWatering`/trigger rules (daily, the chosen weekdays, or the two-weekly/monthly date). One row per plant even if it is daily.
- **Each row:** the plant's photo or illustration (small, round), species name, watering time, and the button.
- **Watered:** the row turns to a done state with "✓ Watered" in green. Tapping it again undoes, for the current day only.
- **Late:** a row whose time has passed and is not ticked shows its time in red with "late".
- **Order:** by watering time; done rows stay in place so the list does not jump.
- **Progress:** "N of M" and a bar in the app green; all done shows "All watered today 🌱".
- **Nothing today:** the card says "Nothing to water today 🌱" and when the next watering is ("Next: Imbé tomorrow at 08:00").
- **Offline:** the card shows from the cached list; the button shows an error toast if the request fails and the row stays as it was.
- Tapping a row's plant (not the button) opens its detail screen, like the garden cards.

## Data

- New table `Watering`: `id`, `userPlantId` (FK, cascade on plant delete), `wateredOn` (date, the plant's local date), `createdAt`. Unique on `(userPlantId, wateredOn)`.
- `POST /me/plants/:id/waterings` with `{ wateredOn: 'YYYY-MM-DD' }` → 201 with the updated plant; repeating it for the same day is a no-op 200 (idempotent). The server rejects a date more than one day away from the server's current date in the plant's time zone (guards against a wrong clock), 400.
- `DELETE /me/plants/:id/waterings/:wateredOn` → 200 with the updated plant (undo); 200 when there was nothing to undo.
- `UserPlant` gains `lastWateredOn: string | null` (`YYYY-MM-DD`). The card treats a plant as watered today when `lastWateredOn` equals today's local date.
- The app sends the device's local date. Plants keep their own time zone for the server check only.

## Calls I made (Arthur can overturn)

- Undo is allowed the same day only, by tapping the done row.
- Late is shown, not nagged: no extra notification.
- Daily plants count once per day.
- The "garden" list keeps its current cards and order (by next watering).
- The old "next watering" sentence goes away; the empty-day message carries that information instead.

## Left to the builder

Exact layout, colours from `styles/colors.ts`, icons, and test layout, following the plant detail screen's patterns (Tappable, Toast, strings in both locales).
