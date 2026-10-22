# Plant detail screen and watering schedule

Date: 2026-10-22. Builds on branch `catalog-filter-sheet` (multi-select catalog, edit-only plant form).

## Why

The plant screen in My plants is a long form that still lets people edit things the species should decide (watering frequency, light). Arthur wants a friendlier detail screen in the style of his reference (green header, round photo, care facts with emoji) where the species facts are fixed, coming from the database or, later, the AI, and the user only decides *when* they water: which weekdays, at what time, and how early the reminder arrives.

## Goals

- A detail screen for a plant in the garden: green header, round photo cut in half by it, species name, scientific name, short description.
- Three read-only care tiles side by side: difficulty, light, watering frequency, each with an emoji.
- A schedule the user picks: weekdays (as many as the frequency asks), time on the half hour, and a reminder lead of 5 to 30 minutes.
- Two new frequencies: every two weeks and once a month, for cacti and succulents.
- The reminder push says how long until watering: "In 20 min you need to water your Zamioculca."

## Non-goals

- Nickname and notes: removed from the app for now. The API columns stay so nothing is lost; the app stops showing and sending them.
- Changing a plant's frequency or light per plant. Both come from the species.
- A watering diary or history (the reference shows one; not now).
- AI identification (step 3) and server-sent pushes (step 4).

## Anti-goals

- A schedule that silently drifts: if the species frequency changes, the user must not keep getting reminders for the old count of days without the screen saying so.
- Reminders that fire at the wrong weekday because the lead time crossed midnight.

## The screen

Top to bottom:

1. **Header**: green gradient (`colors.green` to a lighter green), safe-area aware. Back chevron on the left, pencil on the right. The pencil opens a bottom sheet (the shared `BottomSheet`) with Take a photo, Choose from gallery and, when there is a photo, Remove photo. Photo changes save at once.
2. **Photo circle**: about 120 px, white border, centred on the header's bottom edge so the header cuts it in half. Shows the user's photo, else the species illustration, else the 🌱 placeholder.
3. **Name**: species name (localized), then the scientific name smaller and in italics, then the species `about` text.
4. **Care tiles**, one row of three equal cards, read-only:
   - Difficulty: 😌 Easy, 🙂 Medium, 😅 Hard (same emoji as the catalog filters).
   - Light: ☀️ Full sun, ⛅ Partial shade, ☁️ Shade.
   - Watering: 💧 with "Every day", "3x a week", "Every 2 weeks", "Once a month".
5. **Schedule** (editable):
   - **Days**: seven chips, Mon to Sun, in the locale's short names. The user must pick exactly as many as the frequency asks: N for N times a week, 1 for every two weeks or once a month. Hidden for every day. A hint under the chips says how many to pick ("Pick 3 days").
   - **Time**: a row showing the current time; tapping opens a bottom sheet with a scrolling list from 00:00 to 23:30 every 30 minutes.
   - **Reminder**: chips 5, 10, 15, 20, 25, 30 min.
6. **Save**: a button fixed at the bottom (only the content between header and button scrolls). Enabled only when something changed and the day count matches. Saving goes to the confirmation screen, as edits do today.

Removing a plant stays where it is (swipe on My plants).

## Data

### Frequency

`frequencySchema` (shared) gains two cases, both with `times: 1`:

- `{ times: 1, per: 'day' }`, unchanged
- `{ times: 1..7, per: 'week' }`, unchanged
- `{ times: 1, per: 'twoWeeks' }`, new
- `{ times: 1, per: 'month' }`, new; scheduled as every four weeks, so it always lands on the chosen weekday

`Plant.frequencyPer` is a string column, so no catalog migration is needed. The seed keeps its current values; marking any curated species as two-weekly or monthly is a separate content decision.

### User plant

The species decides frequency and light, so the copies on the user plant go away:

- Drop `UserPlant.frequencyTimes`, `frequencyPer` and `light` (migration). The API response's `frequency` and `light` become the species values, and it gains `difficulty`.
- Add `wateringDays Int[]`: ISO weekdays, 1 = Monday to 7 = Sunday, sorted, no duplicates. Empty means "use the default spread".
- Add `reminderLeadMinutes Int @default(15)`: 5 to 30 in steps of 5.
- Add `scheduleStartsOn DateTime?` (date only): the first watering date, the anchor for every-two-weeks and monthly plants. Set by the server whenever the days or time change: the next occurrence of the chosen weekday at the chosen time, in the plant's time zone, from now. Null for daily and weekly plants.
- `reminderTime`: new writes must be on the half hour (`HH:00` or `HH:30`). Existing values such as `09:15` stay readable; the time list shows the stored value until the user changes it.
- Create no longer accepts `frequency`, `light`, `nickname` or `notes` from the app; it takes `catalogPlantId`, `reminderTime`, `timeZone` and optional `wateringDays` and `reminderLeadMinutes`. Update takes `wateringDays`, `reminderTime`, `timeZone`, `reminderLeadMinutes`. `nickname` and `notes` remain accepted by the API for now (no app uses them) so the columns keep working.
- Validation: `wateringDays` must be empty or have exactly the species' required count (always empty for daily). The server rejects anything else with 400.
- Adding from the catalog sends only `catalogPlantId`, the default `reminderTime` (08:00) and `timeZone`, so the pending save after sign-up shrinks to a list of catalog ids. A pending save in the old shape is dropped, as today.

### When the species frequency changes

If the stored `wateringDays` no longer match the species (say the AI corrects 2x to 3x a week), the API returns the plant with `wateringDays: []` and a `scheduleNeedsReview: true` flag computed on read. The app schedules the default spread for it and the detail screen shows a short banner ("The watering for this plant changed. Pick 3 days.").

## Reminders (app)

`reminderSlots` in shared is replaced by a function that returns concrete notification triggers for one plant:

- **Every day**: one daily trigger at time minus lead.
- **N times a week**: one weekly trigger per chosen weekday (or the default spread when none is stored) at time minus lead. When the lead crosses midnight (watering at 00:00 with a 15 min lead), the trigger moves to the previous weekday at 23:45.
- **Every two weeks / monthly**: weekly triggers cannot skip weeks, so these use one-off date triggers for the next three occurrences, counted from `scheduleStartsOn`. The existing syncs (launch, foreground, sign-in, after a save) keep them topped up.

All triggers still count toward the 60-notification cap and the once-per-session cap warning.

Push text (`notification.body`): "In {{minutes}} min you need to water your {{name}}." In Portuguese: "Em {{minutes}} min você precisa regar: {{name}}." (see the calls below). `name` is the species name; nickname is gone.

## Calls I made (Arthur can overturn)

- Monthly means every four weeks, on the chosen weekday, rather than the same day each calendar month: it keeps every schedule weekday-based.
- Default reminder lead 15 min; default weekdays come from the current spread (Mon/Thu, Mon/Wed/Fri and so on); for every two weeks and monthly the default day is Monday.
- Portuguese push text avoids "sua"/"seu" because plant names have different genders ("sua zamioculca", "seu cacto"). "Em 20 min você precisa regar: Zamioculca." If Arthur prefers his exact wording, species translations would need a grammatical gender.
- The pencil only edits the photo; Save is only for the schedule.
- Plants created before this change get `reminderLeadMinutes = 15`, `wateringDays = []` (default spread) and keep their reminder time.

## Left to the builder

Exact spacing, gradient stops, chip sizes, how the time list scrolls to the current value, and test layout, following the existing app patterns (theme tokens in `styles/colors.ts`, i18n in both locales, shared zod schemas, Vitest for the API, Jest for the app).
