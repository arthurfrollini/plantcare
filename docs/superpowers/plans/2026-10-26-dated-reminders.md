# Dated Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule every reminder as a dated one-off and skip the waterings already ticked, with a "keep going" notification when the queue runs out.

**Architecture:** Shared replaces `reminderTriggers` with a pure `reminderMoments(input, from, until)` that lists each reminder's fire time and its watering date. The app's sync builds all plants' moments for a year and drops the watered ones. It schedules the soonest 59 as DATE triggers plus one keep-going notification. `useMyPlants` resyncs after a mark or undo.

**Tech Stack:** zod 4 + Vitest (`packages/shared`), Expo SDK 57 + expo-notifications + Jest (`app`).

**Spec:** `docs/superpowers/specs/2026-10-26-dated-reminders-design.md`

## Global Constraints

- Branch `dated-reminders` (checked out, based on `home-today`). No merge or PR without Arthur.
- At most 60 scheduled notifications: 59 reminders plus 1 keep-going. Horizon one year.
- Copy (en / pt-BR): title "🌱 Your reminders are running out" / "🌱 Seus lembretes estão acabando"; body "Open PlantCare to keep getting watering reminders." / "Abra o PlantCare pra continuar recebendo os lembretes de rega." The existing reminder copy is unchanged.
- **Lint and types:** lint forbids `any`, type assertions and non-null assertions.
- **Jest:** fake only `Date` with the `app/src/plants/testClock.ts` helper, and use generous timeouts.
- **Docs:** no emojis on README text, and run the humanizer on README prose.

## Review Focus

1. A daily plant ticked today gets no reminder today, but does get tomorrow's (Task 2 test).
2. A reminder whose lead moves it before midnight belongs to the next day's watering, so ticking today does not drop it (Task 1 test).
3. With more reminders than fit, the 59 kept are the soonest across all plants, and the keep-going fires at the 60th's moment (Task 2 test).
4. Undo brings back today's reminder when it is still ahead (Task 2 test via `useMyPlants`).
5. A plant with a malformed time is skipped without breaking the others (Task 2 test).

---

### Task 1: Shared reminder moments

**Files:**
- Modify: `packages/shared/src/schedule.ts` and `schedule.test.ts`

**Interfaces:**
- Produces:
  - `type ReminderMoment = { at: Date; wateringOn: string }`.
  - `reminderMoments(input: ScheduleInput, from: Date, until: Date): ReminderMoment[]`. It returns every reminder with `from < at <= until`, in time order. `at` is the watering time minus `reminderLeadMinutes`, and `wateringOn` is the watering's local `YYYY-MM-DD`. Watering days come from the same rule as `wateringTimeOn`: daily, the effective weekdays, or the two-weekly/monthly occurrences with an anchor or the fixed fallback. A malformed time throws, as `reminderTriggers` does today.
  - `reminderTriggers` and `ReminderTrigger` are removed. Their tests move to `reminderMoments` wherever they still describe behaviour.

- [ ] **Step 1: Failing tests.**
  - Daily at 08:30 with a 15-minute lead, from Thu 2026-10-22 09:00 to Sun 2026-10-25 23:59, gives Fri, Sat and Sun at 08:15 with matching `wateringOn`. Thursday's 08:15 has passed, so it is not included.
  - Weekly `[2,4]` across two weeks gives only Tuesdays and Thursdays.
  - Watering at 00:10 with a 15-minute lead gives `at` on the previous day at 23:55, with `wateringOn` set to the watering day (Review Focus 2).
  - A monthly plant anchored at `'2026-01-05'` gives 28-day steps that match `wateringTimeOn`.
  - A two-weekly plant with a null anchor gives the fixed-reference Mondays.
  - A malformed time throws.
  - A one-year range for a daily plant gives 365 or 366 moments.
- [ ] **Step 2: Run** `npm test -w @plantcare/shared`. Expected: fail.
- [ ] **Step 3: Implement.** Build on `wateringTimeOn`, walking local days from `from` minus one day to `until` plus one day. Do not duplicate the occurrence logic.
- [ ] **Step 4: Run** the shared tests, lint and typecheck, and `npx prettier --check packages api`. Expected: pass. The app's `sync.ts` breaks until Task 2.
- [ ] **Step 5: Commit** `git commit -m "List each reminder with the watering it belongs to"`.

### Task 2: App schedules dated reminders

**Files:**
- Modify: `app/src/reminders/sync.ts` (+ `sync.test.ts`), `app/src/plants/useMyPlants.ts` (+ test), `app/src/plants/savePlant.ts`, both locale files, `README.md`

**Interfaces:**
- Consumes: Task 1 `reminderMoments`.
- Produces:
  - `syncReminders(plants: UserPlant[]): Promise<{ scheduled: number; skipped: number }>`. The signature and queueing stay the same. `scheduled` counts the reminders scheduled, not counting the keep-going. `skipped` counts the moments left out by the cap, plus one per malformed plant, plus all moments when permission is denied or cancelling failed.
  - The DATE trigger is the only trigger used.
  - The keep-going notification has `data: { kind: 'keepGoing' }`. A reminder has `data: { userPlantId }`, as today.
  - `warnIfCapped`, `resetCapWarning` and the `myPlants.capReached` strings are removed, along with their callers in `useMyPlants.ts` and `savePlant.ts`.
  - After a successful mark or undo, `useMyPlants` calls `syncReminders(next)` without awaiting it in the UI path. It never prompts for permission.

- [ ] **Step 1: Failing tests** in `sync.test.ts`, with expo-notifications faked as today:
  - all triggers are DATE;
  - Review Focus 1: a daily plant with `lastWateredOn` today and its reminder still ahead gets no reminder for today, and does get tomorrow's;
  - Review Focus 3: three daily plants over a year keep the 59 soonest in time order, and the keep-going fires at the 60th moment with the spec's copy in the current language;
  - with few moments, such as one monthly plant, every reminder is scheduled and the keep-going fires one year after `now`;
  - Review Focus 5: one plant with a malformed time leaves the others scheduled.

  In `useMyPlants.test.tsx`: after a mark, `syncReminders` is called with the updated list. A failed mark does not call it. Review Focus 4: after an undo, the list passed has `lastWateredOn` null.
- [ ] **Step 2: Run** `npm test -w @plantcare/app -- src/reminders src/plants`. Expected: fail.
- [ ] **Step 3: Implement.** In `README.md`'s "What it does", add one line for the Today card and the skipped reminder. Keep it plain, with no emojis.
- [ ] **Step 4: Run** the whole repo: `npm run db:test:prepare -w @plantcare/api && npm test`, `cd app && npx tsc --noEmit`, `npm run lint`, and `npx prettier --check api packages`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Schedule each reminder by date and skip the ones already watered"`.
