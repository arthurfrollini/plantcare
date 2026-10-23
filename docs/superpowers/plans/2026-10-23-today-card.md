# Today Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead My plants with a "Today" card listing today's waterings with a "Watered ✓" button, backed by a server-side watering log, and keep the garden below.

**Architecture:** Shared gets a pure "which plants water on this date, at what time" function built on the existing schedule rules. The API stores one `Watering` row per plant per local date and exposes mark and undo routes; plants report `lastWateredOn`. The app derives today's rows from the plant list (no extra request), updates the list and its offline cache after mark or undo, and renders a `TodayCard` above the garden.

**Tech Stack:** zod 4 (`packages/shared`), Fastify 5 + Prisma 7.10 + Vitest (`api`), Expo SDK 57 + Jest (`app`).

**Spec:** `docs/superpowers/specs/2026-10-23-today-card-design.md`

## Global Constraints

- Branch `home-today` (checked out). No merge or PR without Arthur.
- Dates on the wire are `YYYY-MM-DD`. The app uses the device's local date; the server checks the date is within one day of the current date in the plant's time zone.
- One watering per plant per date (unique `(userPlantId, wateredOn)`); marking twice is a no-op, undoing nothing is a no-op.
- Undo is for today only (the app only offers it on today's rows).
- Strings in both `app/src/i18n/locales/en.ts` and `pt-BR.ts`, Portuguese written naturally. Copy (en / pt-BR): "Today" / "Hoje"; "{{done}} of {{total}}" / "{{done}} de {{total}}"; "Watered ✓" / "Reguei ✓" (button); "✓ Watered" / "✓ Regada" (done state); "late" / "atrasada"; "All watered today 🌱" / "Tudo regado hoje 🌱"; "Nothing to water today 🌱" / "Nada pra regar hoje 🌱"; "Next: {{name}} {{when}}" / "Próxima: {{name}} {{when}}"; "My garden" / "Meu jardim"; "Couldn't save. Try again." / "Não consegui salvar. Tente de novo."
- Use `Tappable` for the buttons, the existing `Toast` for errors, colors from `styles/colors.ts`. New app files join the strict lint list in `app/eslint.config.js`. Lint forbids `any`, type assertions and non-null assertions.
- Jest: wait for disappearance with `.not.toBeOnTheScreen()`, sheet/toast waits with generous timeouts; CI is a slower Linux runner.
- After the migration: `npm run db:migrate -w @plantcare/api`; before API tests: `npm run db:test:prepare -w @plantcare/api`.

## Review Focus

1. A plant ticked at 23:50 shows as not watered after midnight (its `lastWateredOn` is yesterday) (Task 3 test).
2. A monthly or two-weekly plant appears only on its watering date, including with a null anchor (Task 1 test).
3. Two quick taps on "Watered ✓" send one request, and a repeated POST does not create a second row (Tasks 2 and 3 tests).
4. Reopening the app the same day shows the done state from the server and still allows undo (Task 3 test).
5. A device whose date is one day ahead of the plant's time zone near midnight is accepted; three days off is rejected with 400 (Task 2 test).

---

### Task 1: Shared "waterings on a date"

**Files:**
- Modify: `packages/shared/src/schedule.ts`, `packages/shared/src/schemas.ts`, tests next to them

**Interfaces:**
- Produces:
  - `localDateSchema` (`^\d{4}-\d{2}-\d{2}$`, a real calendar date) and `toLocalDateString(date: Date): string` (device-local `YYYY-MM-DD`).
  - `wateringTimeOn(input: ScheduleInput, day: Date): Date | null` — the watering time on that local calendar day if the schedule waters then (daily: always; weekly: the effective weekdays; two-weekly/monthly: the same occurrences `reminderTriggers` uses, anchor or fixed fallback), else null; null for a malformed time.
  - `userPlantSchema` gains `lastWateredOn: localDateSchema.nullable()`.

- [ ] **Step 1: Failing tests**: weekly `[2,4]` (Tue, Thu) at `08:30` → a Tuesday gives Tuesday 08:30, a Wednesday gives null; daily → any day; monthly with anchor `'2026-01-05'` → `2026-11-23` (a 28-day step) gives 09:00 there and `2026-11-24` gives null; two-weekly with `scheduleStartsOn: null` and day `[1]` → the fixed-reference Mondays only; malformed time → null; `toLocalDateString(new Date(2026, 0, 5, 23, 59))` → `'2026-01-05'`; `localDateSchema` rejects `'2026-02-30'`.
- [ ] **Step 2: Run** `npm test -w @plantcare/shared`. Expected: fail.
- [ ] **Step 3: Implement**, reusing `effectiveDays`, `parseTime`, `isoWeekday` and the occurrence logic of `dateOccurrences` rather than duplicating it.
- [ ] **Step 4: Run** shared tests, lint, typecheck, `npx prettier --check packages api`. Expected: pass (API/app type errors from the new `lastWateredOn` are fixed in Tasks 2 and 3).
- [ ] **Step 5: Commit** `git commit -m "Add the shared rule for which plants water on a given day"`.

### Task 2: API watering log

**Files:**
- Modify: `api/prisma/schema.prisma` + migration `watering_log`; `api/src/user-plants/service.ts`; `api/src/user-plants/routes.ts` (or a new `waterings-routes.ts` registered beside it)
- Test: `api/src/user-plants/waterings.test.ts` (or the routes test)

**Interfaces:**
- Consumes: Task 1 `localDateSchema`, `userPlantSchema`.
- Produces:
  - Prisma `Watering { id, userPlantId (FK, onDelete Cascade), wateredOn DateTime @db.Date, createdAt }`, `@@unique([userPlantId, wateredOn])`, index on `userPlantId`.
  - DTO `lastWateredOn`: the latest `wateredOn` for the plant as `YYYY-MM-DD`, or null.
  - `POST /me/plants/:id/waterings` body `{ wateredOn }` → 201 with the plant when created, 200 when it already existed; 404 for another user's plant; 400 `invalid_watering_date` when `wateredOn` is more than one day from today in the plant's time zone.
  - `DELETE /me/plants/:id/waterings/:wateredOn` → 200 with the plant whether or not a row existed; 404 for another user's plant; 400 for a malformed date.

- [ ] **Step 1: Failing tests**: mark today → 201, `lastWateredOn` is that date; mark again → 200, one row; undo → 200, `lastWateredOn` null; undo again → 200; another user → 404 on both; Review Focus 5 (yesterday and tomorrow relative to the plant's zone accepted, three days off → 400); deleting the plant deletes its waterings; list (`GET /me/plants`) carries `lastWateredOn`.
- [ ] **Step 2: Run** `npm run db:test:prepare -w @plantcare/api && npm test -w @plantcare/api`. Expected: fail.
- [ ] **Step 3: Implement** (migration as in earlier plans: `prisma migrate diff` into a migration folder and `migrate deploy` if `migrate dev` needs a TTY). Compute the plant-zone date with `Intl.DateTimeFormat` like `schedule-start.ts`.
- [ ] **Step 4: Run** API tests, shared tests, API lint and typecheck, `npx prettier --check api packages`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Record waterings per plant and day"`.

### Task 3: App data for today

**Files:**
- Modify: `app/src/api/endpoints.ts`, `app/src/plants/useMyPlants.ts`, `app/src/plants/testFixtures.ts`
- Create: `app/src/plants/today.ts` (+ test)
- Test: `app/src/plants/useMyPlants.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - endpoints: `markWatered(id: string, wateredOn: string): Promise<UserPlant>`, `undoWatered(id: string, wateredOn: string): Promise<UserPlant>`.
  - `todayRows(plants: UserPlant[], now: Date): TodayRow[]` with `TodayRow = { plant: UserPlant; time: Date; done: boolean; late: boolean }`, sorted by `time` then species name; `done` when `lastWateredOn === toLocalDateString(now)`; `late` when not done and `time < now`.
  - `nextWateringAfterToday(plants: UserPlant[], now: Date): { plant: UserPlant; at: Date } | null` for the empty-day message.
  - `useMyPlants` gains `markWatered(id: string): Promise<boolean>` and `undoWatered(id: string): Promise<boolean>`: send today's local date, replace the plant in the list and the cache with the response, return false on failure without changing the list; a second call for the same plant while one is in flight is ignored.

- [ ] **Step 1: Failing tests**: `todayRows` covers order, done, late and Review Focus 1 (`lastWateredOn` of yesterday → not done) and Review Focus 2 via the shared rule; `nextWateringAfterToday` returns tomorrow's first watering; hook: mark updates the plant and the cache, failure leaves both, Review Focus 3 (two quick calls → one POST), Review Focus 4 (a plant loaded with today's `lastWateredOn` can be undone).
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/plants`. Expected: fail.
- [ ] **Step 3: Implement.** Add `today.ts` to the strict lint list.
- [ ] **Step 4: Run** app tests, `cd app && npx tsc --noEmit`, app lint. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Derive today's waterings and let My plants mark them"`.

### Task 4: Today card on My plants

**Files:**
- Create: `app/src/components/TodayCard.tsx` (+ test)
- Modify: `app/src/pages/MyPlants.tsx` (+ test), both locale files, `app/eslint.config.js`

**Interfaces:**
- Consumes: Task 3 `todayRows`, `nextWateringAfterToday`, `markWatered`, `undoWatered`.
- Produces:
  - `TodayCard({ rows, next, accessToken, busyId, onToggle, onOpen })`: title "Today", "N of M" with a progress bar, one row per plant (round photo or illustration like the garden card, species name, time, the button or the done state, red time with "late"); all-done and nothing-today messages per the spec; tapping the plant part calls `onOpen`, the button calls `onToggle`.
  - My plants: Header, then `TodayCard`, then the "My garden" title and the existing garden list; the old spotlight sentence and image are removed; a failed toggle shows the existing `Toast` with the error copy. Re-renders "today" when the app returns to the foreground or the date changes (use the existing focus/foreground refresh).

- [ ] **Step 1: Failing tests**: rows render in order with times; tapping "Watered ✓" POSTs today's date and the row turns to "✓ Watered"; tapping the done row undoes (DELETE); a late row shows "late"; all done shows "All watered today 🌱"; no plants due shows "Nothing to water today 🌱" and "Next: …"; a failed POST shows the error toast and keeps the button; the garden title "My garden" and its cards are still there; pt-BR strings render.
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/pages/MyPlants src/components/TodayCard`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole repo: `npm run db:test:prepare -w @plantcare/api && npm test`, `cd app && npx tsc --noEmit`, `npm run lint`, `npx prettier --check api packages`. Expected: pass.
- [ ] **Step 5: Simulator check** as in earlier plans (temporary preview route rendering `TodayCard` and the garden with fixture data in pt-BR, reverted before commit): mixed done/late/pending rows, all done, nothing today. Screenshots to `/private/tmp/claude-501/-Users-Arthur/b965fe38-4dcc-4301-90fa-d95a0f2a46aa/scratchpad/today-*.png`.
- [ ] **Step 6: Commit** `git commit -m "Lead My plants with the Today card"`.
