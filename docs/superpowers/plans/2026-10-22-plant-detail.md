# Plant Detail and Watering Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plant edit form with a detail screen where the species decides frequency and light and the user picks weekdays, a half-hour time and a reminder lead; add every-two-weeks and monthly frequencies.

**Architecture:** The shared package owns the schedule rules (frequencies, required day counts, default days, reminder triggers, next watering), so the API validates with the same rules the app schedules with. The API drops the per-plant frequency and light copies, stores the chosen days, lead and an anchor date, and reports when stored days no longer fit the species. The app gets a `usePlantDetail` hook and a `PlantDetail` screen; reminders and My plants read the shared trigger function.

**Tech Stack:** zod 4 (`packages/shared`), Fastify 5 + Prisma 7.10 + Vitest (`api`), Expo SDK 57 + React Navigation 7 + Jest + date-fns (`app`), `expo-linear-gradient` (new).

**Spec:** `docs/superpowers/specs/2026-10-22-plant-detail-design.md`

## Global Constraints

- Branch `plant-detail` from `main` (already created). No merge or PR without Arthur.
- Weekdays are ISO everywhere in data: 1 = Monday ... 7 = Sunday. Expo weekly triggers use 1 = Sunday ... 7 = Saturday; convert only at the trigger boundary.
- Reminder time on writes: `HH:00` or `HH:30`, 00:00 to 23:30. Stored older values (e.g. `09:15`) stay readable.
- Reminder lead: 5, 10, 15, 20, 25 or 30 minutes; default 15.
- Frequencies: `{times:1, per:'day'}`, `{times:1..7, per:'week'}`, `{times:1, per:'twoWeeks'}` (every 14 days), `{times:1, per:'month'}` (every 28 days).
- Default weekdays: 1x `[1]`, 2x `[1,4]`, 3x `[1,3,5]`, 4x `[1,3,5,7]`, 5x `[1,2,4,5,6]`, 6x `[1..6]`, 7x `[1..7]`; twoWeeks and month `[1]`; day `[]`.
- Push copy, en: `In {{minutes}} min you need to water your {{name}}.`; pt-BR: `Em {{minutes}} min você precisa regar: {{name}}.` `name` is the species name.
- Nickname and notes leave the app; the API keeps accepting and returning them.
- Every sheet in this plan (time list, photo options) is the existing `BottomSheet` from `app/src/components/BottomSheet.tsx`, the one the catalog filters use, with its slide and blurred backdrop. No new modal component or animation.
- Every new string exists in `app/src/i18n/locales/en.ts` and `pt-BR.ts`.
- Lint rules stay as they are: no `any`, no type assertions, no non-null assertions. App Jest tests that wait on the sheet animation or a refetch need `waitFor(..., { timeout: 5000 })`; CI runs on Linux and is slower than the Mac.
- After the migration: `npm run db:migrate -w @plantcare/api` locally and `npm run db:test:prepare -w @plantcare/api` before API tests.

## Review Focus

1. Watering at 00:00 with a 15 min lead on Mondays must remind on Sunday 23:45, not Monday 23:45 (Task 1 test).
2. A monthly plant whose anchor is months in the past must remind for the next three future waterings, skipping one whose reminder time already passed (Task 1 test).
3. A species changed from 2x to 3x a week while the plant stores two days: API flags `scheduleNeedsReview`, the app shows the banner, preselects the default three days and allows Save (Tasks 2 and 5 tests).
4. A plant saved with `09:15` before this change: opening and saving only the days must not send `reminderTime` and must not be rejected (Task 5 test).
5. Every-two-weeks or monthly plants need exactly one day; tapping a second day moves the selection instead of being ignored (Task 5 test).

---

### Task 1: Shared schedule rules

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/schedule.ts` (replace `reminderSlots`)
- Modify: `packages/shared/src/index.ts` (exports)
- Test: `packages/shared/src/schemas.test.ts`, `packages/shared/src/schedule.test.ts`

**Interfaces:**
- Produces (schemas.ts):
  - `frequencySchema` with the four cases above; `Frequency` type.
  - `isoWeekdaySchema` (int 1..7), `wateringDaysSchema` (array of ISO weekdays, strictly ascending, so no duplicates).
  - `halfHourTimeSchema` (regex `^([01]\d|2[0-3]):(00|30)$`), `reminderLeadSchema` (int, 5..30, multiple of 5), `DEFAULT_REMINDER_LEAD = 15`.
  - `userPlantSchema`: keeps `id, catalogPlantId, nickname, speciesName, scientificName, about, waterTips, reminderTime, timeZone, notes, imageUrl, hasPhoto, photoVersion, createdAt`; `frequency: frequencySchema` (species); `light: lightSchema` (species, no longer nullable); adds `difficulty: difficultySchema`, `wateringDays: wateringDaysSchema`, `reminderLeadMinutes: reminderLeadSchema`, `scheduleStartsOn: string | null` (`YYYY-MM-DD`), `scheduleNeedsReview: boolean`.
  - `createUserPlantSchema`: `catalogPlantId`, `reminderTime: halfHourTimeSchema`, `timeZone`, optional `wateringDays`, `reminderLeadMinutes`, `nickname`, `notes`. No `frequency`, no `light`.
  - `updateUserPlantSchema`: optional `wateringDays`, `reminderTime` (half hour), `timeZone`, `reminderLeadMinutes`, `nickname` (nullable), `notes` (nullable). No `frequency`, no `light`.
- Produces (schedule.ts):
  - `requiredWateringDays(f: Frequency): number` (day 0, week `times`, twoWeeks/month 1)
  - `defaultWateringDays(f: Frequency): number[]`
  - `type ScheduleInput = { frequency: Frequency; wateringDays: number[]; reminderTime: string; reminderLeadMinutes: number; scheduleStartsOn: string | null }`
  - `type ReminderTrigger = { kind: 'daily'; hour: number; minute: number } | { kind: 'weekly'; weekday: number /* Expo: 1 = Sunday */; hour: number; minute: number } | { kind: 'date'; date: Date }`
  - `reminderTriggers(input: ScheduleInput, now: Date, upcoming = 3): ReminderTrigger[]`; throws on a malformed `reminderTime`.
  - `nextWatering(input: ScheduleInput, now: Date): Date | null`: the next watering time (not the reminder) on the device clock; null for a malformed time.
- Days used for scheduling: `wateringDays` when its length equals `requiredWateringDays`, else `defaultWateringDays`.

- [ ] **Step 1: Write failing tests** in `schedule.test.ts` (dates built with `new Date(y, m, d, h, min)`, device-local):
  - `requiredWateringDays` → 0, 3, 1, 1 for day, 3x week, twoWeeks, month; `defaultWateringDays({times:3, per:'week'})` → `[1,3,5]`; month → `[1]`.
  - daily, `07:00`, lead 15 → `[{kind:'daily', hour:6, minute:45}]`.
  - daily, `00:00`, lead 15 → `[{kind:'daily', hour:23, minute:45}]`.
  - weekly 2x, days `[1,4]`, `08:30`, lead 30 → weekly Expo weekdays 2 and 5 at 08:00.
  - weekly 1x, days `[1]`, `00:00`, lead 15 → `{kind:'weekly', weekday:1, hour:23, minute:45}` (Sunday).
  - weekly 3x with stored `[1,4]` (wrong count) → uses `[1,3,5]` → Expo weekdays 2, 4, 6.
  - month, anchor `'2026-01-05'` (a Monday), `09:00`, lead 15, now `2026-10-22 12:00` → three `date` triggers 15 min before the next three 28-day steps from the anchor that are after now.
  - twoWeeks, anchor where today's watering is at 09:00, now 08:50, lead 15: today's reminder (08:45) already passed, so the first trigger is 14 days later.
  - twoWeeks with `scheduleStartsOn: null`, days `[3]` → anchor is the next Wednesday at the time, from now.
  - `nextWatering` for weekly `[1,4]` 08:30 with now Tuesday 10:00 → Thursday 08:30.
  - malformed `reminderTime: '25:00'` → `reminderTriggers` throws, `nextWatering` returns null.
- [ ] **Step 2: Add schema tests** in `schemas.test.ts`: `frequencySchema` accepts `{times:1, per:'twoWeeks'}` and `{times:1, per:'month'}`, rejects `{times:2, per:'month'}`; `wateringDaysSchema` rejects `[3,1]`, `[1,1]`, `[0]`, `[8]`; `halfHourTimeSchema` accepts `13:30`, rejects `13:15`, `24:00`; `reminderLeadSchema` accepts 5 and 30, rejects 0, 7, 35; `createUserPlantSchema` rejects a `frequency` key (strict object) and `reminderTime: '08:15'`.
- [ ] **Step 3: Run** `npm test -w @plantcare/shared`. Expected: the new tests fail.
- [ ] **Step 4: Implement** the schemas and `schedule.ts`. Reminder time = watering time minus lead; when that goes below 00:00 a weekly trigger moves to the previous weekday (ISO 1 → 7). ISO to Expo weekday: `iso % 7 + 1`. Date triggers: interval 14 or 28 days from the anchor (anchor date at `reminderTime`, local); take occurrences whose *reminder* is after `now`, first `upcoming` of them. Remove `reminderSlots` and its tests.
- [ ] **Step 5: Run** `npm test -w @plantcare/shared && npm run lint -w @plantcare/shared && npm run typecheck -w @plantcare/shared`. Expected: all pass. (App and API compile errors are expected until Tasks 2 to 4.)
- [ ] **Step 6: Commit** `git add packages/shared && git commit -m "Add the shared watering schedule rules and the two new frequencies"`.

### Task 2: API schedule fields and photo removal

**Files:**
- Modify: `api/prisma/schema.prisma`; Create: migration via `npm run db:migrate -w @plantcare/api -- --name plant_schedule`
- Create: `api/src/user-plants/schedule-start.ts`, test `api/src/user-plants/schedule-start.test.ts`
- Modify: `api/src/user-plants/service.ts`, `api/src/user-plants/routes.ts`, `api/src/user-plants/photo-routes.ts`
- Test: `api/src/user-plants/routes.test.ts`, `api/src/user-plants/photo-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas, `requiredWateringDays`.
- Produces:
  - Prisma `UserPlant`: drop `frequencyTimes`, `frequencyPer`, `light`; add `wateringDays Int[] @default([])`, `reminderLeadMinutes Int @default(15)`, `scheduleStartsOn DateTime? @db.Date`.
  - `nextOccurrenceDate(isoWeekday: number, reminderTime: string, timeZone: string, now: Date): string` (`YYYY-MM-DD` in that zone; today counts only if the time has not passed there).
  - DTO: `frequency`, `light`, `difficulty` from the species; `scheduleNeedsReview = required > 0 && stored.length > 0 && stored.length !== required`; when true, or when the species is daily, `wateringDays` is returned as `[]`.
  - Create/update reject `wateringDays` that are neither empty nor of the required length with 400, code `invalid_watering_days`.
  - `scheduleStartsOn` is set to `nextOccurrenceDate(days[0], time, zone, now)` on create and whenever `wateringDays` or `reminderTime` change, for twoWeeks/month species (days[0] = stored day or `1`); null for other frequencies.
  - `DELETE /me/plants/:id/photo` → 200 with the plant (`hasPhoto: false`, `photoVersion` updated), removes the stored file; 404 `user_plant_not_found` for another user's plant; 200 when there was no photo.
  - Listing sort stays by reminder time, then species name (no nickname).

- [ ] **Step 1: Write failing tests**
  - `schedule-start.test.ts`: Wednesday 3, `09:00`, `America/Sao_Paulo`, now `2026-10-22T11:00:00Z` (08:00 there, a Thursday) → `'2026-10-28'`; same with Thursday 4 → `'2026-10-22'`; Thursday 4 at now `2026-10-22T13:00:00Z` (10:00 there) → `'2026-10-29'`.
  - `routes.test.ts`: replace "copies frequency and light" with "returns the species frequency, light and difficulty and the default lead"; add "rejects wateringDays of the wrong length" (3x species, `[1,4]` → 400 `invalid_watering_days`); "saves days, time and lead"; "rejects a reminder time off the half hour" (`08:15` → 400); "sets scheduleStartsOn for a monthly species" (update the seeded species to `frequencyPer: 'month'` in the test); "flags scheduleNeedsReview when the species frequency changed" (store `[1,4]`, change species to 3x, list → `wateringDays: []`, `scheduleNeedsReview: true`); replace "updates frequency and clears the nickname" with "clears the nickname with null"; drop frequency/light from PATCH tests (a `frequency` key → 400).
  - `photo-routes.test.ts`: "removes the photo", "answers 404 removing another user's photo", "answers 200 removing when there is none".
- [ ] **Step 2: Run** `npm run db:test:prepare -w @plantcare/api && npm test -w @plantcare/api`. Expected: new tests fail.
- [ ] **Step 3: Implement** the Prisma change and migration, `schedule-start.ts` (use `Intl.DateTimeFormat` with `timeZone` to read the zone's date, weekday and time; no new dependency), the service and the routes. Update the OpenAPI descriptions on the routes.
- [ ] **Step 4: Run** `npm run db:test:prepare -w @plantcare/api && npm test -w @plantcare/api && npm run lint -w @plantcare/api && npm run typecheck -w @plantcare/api && npx prettier --check api packages`. Expected: all pass.
- [ ] **Step 5: Commit** `git add api packages && git commit -m "Store watering days, lead and anchor per plant and read care facts from the species"`.

### Task 3: App data layer

**Files:**
- Modify: `app/src/api/endpoints.ts`, `app/src/plants/pendingSave.ts`, `app/src/plants/savePlant.ts`, `app/src/pages/PlantSelect.tsx`, `app/src/components/PlantCardSecondary.tsx`, `app/src/pages/MyPlants.tsx`, `app/src/plants/testFixtures.ts`
- Test: `app/src/plants/savePlant.test.ts`, `app/src/plants/pendingSave.test.ts`, `app/src/pages/PlantSelect.test.tsx`, `app/src/pages/Auth.test.tsx`, `app/src/pages/MyPlants.test.tsx`

**Interfaces:**
- Consumes: Task 1 `UserPlant`, `UpdateUserPlant`.
- Produces:
  - `deletePlantPhoto(id: string): Promise<UserPlant>` in `endpoints.ts`.
  - `SpeciesPick = { catalogPlantId: string }`; `PendingSave = { plants: SpeciesPick[] }` (min 1).
  - `createBody(pick: SpeciesPick): CreateUserPlant` → `{ catalogPlantId, reminderTime: '08:00', timeZone: deviceTimeZone() }`.
  - `type ScheduleValues = { wateringDays: number[]; reminderTime: string; reminderLeadMinutes: number }` and `scheduleChanges(saved: UserPlant, values: ScheduleValues): UpdateUserPlant` (only changed fields; `timeZone` added when `reminderTime` changes).
  - `changesBody` and `PlantFormValues` are removed together with the form in Task 6; until then they may stay.
  - Fixtures gain `difficulty`, `wateringDays: [1,4]`, `reminderLeadMinutes: 15`, `scheduleStartsOn: null`, `scheduleNeedsReview: false`, `light` non-null, and `reminderTime: '09:30'`.

- [ ] **Step 1: Write failing tests**: `createBody({catalogPlantId:'c2'})` equals `{ catalogPlantId:'c2', reminderTime:'08:00', timeZone: deviceTimeZone() }`; `scheduleChanges` sends only `{ wateringDays:[1,3,5] }` when only days changed, `{ reminderTime:'07:30', timeZone }` when only time changed, nothing when nothing changed; pending save of the old shape (with `frequency`) is dropped; catalog add posts only `catalogPlantId`, `reminderTime`, `timeZone`; My plants shows the species name even when the API returns a nickname.
- [ ] **Step 2: Run** `npm test -w @plantcare/app`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** In the catalog, `toggle` stores `{ catalogPlantId }`.
- [ ] **Step 4: Run** `npm test -w @plantcare/app && npx tsc --noEmit -p app && npm run lint -w @plantcare/app`. Expected: pass, except compile errors in `usePlantForm.ts`, `PlantForm.tsx`, `reminders/sync.ts`, `plants/nextWatering.ts` that Tasks 4 to 6 remove; list them in the report.
- [ ] **Step 5: Commit** `git commit -m "Send only the species when adding and drop nicknames from My plants"`.

### Task 4: Reminders and next watering on the shared triggers

**Files:**
- Modify: `app/src/reminders/sync.ts`, `app/src/plants/nextWatering.ts`, both locale files (`notification.body`)
- Test: `app/src/reminders/sync.test.ts`, `app/src/plants/nextWatering.test.ts` (create if missing)

**Interfaces:**
- Consumes: `reminderTriggers`, `nextWatering`, `ScheduleInput` (Task 1).
- Produces: `syncReminders(plants)` unchanged in signature and contract (serialized, never rejects, cap 60, `{scheduled, skipped}`); `nextWateringAt(plant, now)` and `sortByNextWatering` unchanged in signature.

- [ ] **Step 1: Write failing tests**: a monthly plant schedules three `DATE` triggers; a weekly plant at `00:00` lead 15 schedules a `WEEKLY` trigger on the previous weekday at 23:45; the body reads `In 15 min you need to water your Monstera.` and, with pt-BR, `Em 15 min você precisa regar: Monstera.`; a malformed time still counts one skipped; the cap still counts date triggers.
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/reminders src/plants/nextWatering`. Expected: fail.
- [ ] **Step 3: Implement.** `DATE` triggers use `Notifications.SchedulableTriggerInputTypes.DATE`.
- [ ] **Step 4: Run** the same command. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Schedule reminders from the chosen days with the lead time"`.

### Task 5: `usePlantDetail` hook

**Files:**
- Create: `app/src/plants/usePlantDetail.ts`, test `app/src/plants/usePlantDetail.test.tsx`
- Delete: `app/src/plants/usePlantForm.ts`, `app/src/plants/usePlantForm.test.tsx`

**Interfaces:**
- Consumes: `scheduleChanges`, `deletePlantPhoto`, `uploadPlantPhoto`, `pickPhoto`, `syncAfterSave`, `confirmationParams` (Tasks 1 and 3, existing modules).
- Produces: `usePlantDetail({ userPlantId }: { userPlantId: string })` returning
  `{ load: 'loading' | 'ready' | { error: FormError }, plant: UserPlant | null, values: ScheduleValues, requiredDays: number, needsReview: boolean, canSave: boolean, saving: boolean, error: FormError | null, photoSource: ImageSource | null, photoBusy: boolean, photoMessage: PhotoMessage | null, toggleDay(day: number): void, setReminderTime(t: string): void, setLead(m: number): void, save(): Promise<void>, changePhoto(source: PhotoSource): Promise<void>, removePhoto(): Promise<void>, handleSavedPhotoError(): Promise<void>, retryLoad(): void }`.
  - Initial days: the plant's `wateringDays` when it has the required count, else `defaultWateringDays(plant.frequency)`.
  - `toggleDay`: when `requiredDays === 1`, the tapped day replaces the selection; otherwise a selected day is removed and an unselected day is added only while under the required count.
  - `canSave`: something differs from the plant (a review counts as a difference) and, when `requiredDays > 0`, exactly `requiredDays` days are picked.
  - `save`: PATCH with `scheduleChanges` (skipped when empty), then `syncAfterSave`, then `StackActions.replace('Confirmation', confirmationParams(t, false))`. Double taps save once (ref guard).
  - `changePhoto` / `removePhoto`: upload or delete at once, replace `plant` with the response, keep `values`.

- [ ] **Step 1: Write failing tests** (port the photo, permission, HEIC, double-tap, network-retry and load-retry cases from `usePlantForm.test.tsx`), plus: Review Focus 3 (review → defaults preselected, `canSave` true), Review Focus 4 (`09:15` plant, change days only → PATCH body has no `reminderTime`), Review Focus 5 (monthly, tap 3 then 5 → `[5]`), 3x a week full selection ignores a fourth day, `canSave` false with two of three days, daily plant has `requiredDays` 0 and can save a time change.
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/plants/usePlantDetail`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Add the plant detail hook with the schedule rules and instant photo edits"`.

### Task 6: Plant detail screen

**Files:**
- Create: `app/src/pages/PlantDetail.tsx`, `app/src/components/CareTiles.tsx`, `app/src/components/TimeSheet.tsx`, `app/src/components/PhotoSheet.tsx`; test `app/src/pages/PlantDetail.test.tsx`
- Delete: `app/src/pages/PlantForm.tsx`, `PlantForm.test.tsx`, `app/src/components/PhotoPicker.tsx` if nothing else uses it; `changesBody`, `PlantFormValues` and unused `plantForm.*` strings
- Modify: `app/src/routes/stack.routes.tsx` (route `PlantForm` → `PlantDetail`, params `{ userPlantId: string }`), `app/src/pages/MyPlants.tsx` (navigate to `PlantDetail`), both locale files, `app/package.json` (`npx expo install expo-linear-gradient`)

**Interfaces:**
- Consumes: `usePlantDetail` (Task 5), `BottomSheet`, `Button`.
- Produces: the screen described in the spec, section "The screen". `PhotoSheet({ visible, hasPhoto, onChoose, onClose })` is also a `BottomSheet`.
  - Header: `LinearGradient` from `colors.green` to `colors.green_light`, back chevron (`accessibilityLabel` `plantDetail.back`) and pencil (`plantDetail.editPhoto`).
  - Photo circle 120 px, white 4 px border, centred on the header's bottom edge.
  - `CareTiles({ difficulty, light, frequency })`: three equal cards; emoji 😌/🙂/😅, ☀️/⛅/☁️, 💧.
  - Days: chips Mon..Sun with short names from date-fns `format(date, 'EEE', { locale: dateLocale() })`, `accessibilityRole="checkbox"` with `checked`; hidden when `requiredDays === 0`; hint `plantDetail.pickDays` (plural).
  - `TimeSheet({ visible, value, onSelect, onClose })`, inside `BottomSheet`: 48 rows 00:00..23:30, the current value highlighted and scrolled into view; a stored off-grid value such as `09:15` still shows in the row above the list.
  - Lead chips 5..30.
  - Review banner when `needsReview`: `plantDetail.review` (plural).
  - Save button fixed at the bottom, disabled unless `canSave`; spinner while saving.
- Strings (en / pt-BR):
  - `frequency.day` Every day / Todo dia; `frequency.week_one` 1x a week / 1x por semana; `frequency.week_other` {{count}}x a week / {{count}}x por semana; `frequency.twoWeeks` Every 2 weeks / A cada 2 semanas; `frequency.month` Once a month / Uma vez por mês
  - `plantDetail.back` Back / Voltar; `plantDetail.editPhoto` Edit photo / Editar foto; `plantDetail.days` Watering days / Dias de rega; `plantDetail.pickDays_one` Pick 1 day / Escolha 1 dia; `plantDetail.pickDays_other` Pick {{count}} days / Escolha {{count}} dias; `plantDetail.time` Time / Horário; `plantDetail.lead` Remind me / Me avise; `plantDetail.leadOption` {{minutes}} min / {{minutes}} min; `plantDetail.review_one` The watering for this plant changed. Pick 1 day. / A rega dessa planta mudou. Escolha 1 dia.; `plantDetail.review_other` The watering for this plant changed. Pick {{count}} days. / A rega dessa planta mudou. Escolha {{count}} dias.; `plantDetail.save` Save / Salvar

- [ ] **Step 1: Write failing tests** in `PlantDetail.test.tsx`: shows species name, scientific name, about and the three tiles for the fixture (`Easy`, `Partial shade`, `2x a week`); days chips reflect `[1,4]` as checked; picking a third day on a 2x plant does nothing; Save disabled until a change, enabled after changing the lead, then PATCH `{ reminderLeadMinutes: 20 }` and confirmation; time sheet lists 48 rows and selecting `13:30` enables Save; a daily plant hides the days section; review banner text for a review plant; pencil opens the photo sheet with Take a photo, Choose from gallery and Remove photo (only when `hasPhoto`). Sheet-close waits use `{ timeout: 5000 }`.
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/pages/PlantDetail`. Expected: fail.
- [ ] **Step 3: Implement**, remove the old form files and strings, rename the route.
- [ ] **Step 4: Run** `npm test -w @plantcare/app && npx tsc --noEmit -p app && npm run lint -w @plantcare/app` and the whole repo `npm test`. Expected: all pass, no compile errors left from earlier tasks.
- [ ] **Step 5: Check on the iOS simulator** (Metro on 8081; temporarily set the stack's `initialRouteName` to reach the screen, revert before committing): header cut through the photo, tiles on one row, days, time sheet, lead chips, fixed Save. Screenshot to the scratchpad.
- [ ] **Step 6: Commit** `git commit -m "Replace the plant form with the plant detail screen"`.
