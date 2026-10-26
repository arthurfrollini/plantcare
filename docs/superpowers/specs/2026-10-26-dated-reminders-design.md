# Dated reminders: skip the ones already watered

Date: 2026-10-26. Builds on branch `home-today` (the Today card and the watering log).

## Why

With the Today card, Arthur can tick a plant as watered before its reminder fires. The reminder still fires, which is noise. Daily and weekly plants use repeating notification triggers ("every Tuesday at 08:15"), and iOS cannot cancel one occurrence of a series, so today's reminder can't be dropped on its own.

## Goals

- Every reminder is a one-off notification for one watering (a dated trigger), for every frequency. Two-weekly and monthly plants already work this way.
- A watering ticked as done gets no reminder. Undoing the tick brings the reminder back.
- The phone holds at most 64 pending notifications, and the app already stays at 60. Reminders fill the 60 slots soonest first, across all plants. The app refills the queue whenever it syncs.
- When the queue is about to run out (the person hasn't opened the app for a while), one last notification asks them to open PlantCare so reminders keep coming.

## Non-goals

- Refilling in the background. That needs a background task, which iOS runs when it chooses and which doesn't run in Expo Go. Leave it for the first store build.
- Changing what a reminder says or when it fires (lead time, copy).
- Reminders for missed waterings.

## How it works

- **When the app syncs:** on launch and sign-in, when it returns to the foreground, after saving or removing a plant (all of these already happen), and now also after a successful "Watered ✓" or undo.
- **What each sync does:**
  1. Builds every upcoming reminder for every plant from now up to one year ahead. Each reminder has the moment it fires and the date of the watering it belongs to.
  2. Drops the reminders whose watering date equals the plant's `lastWateredOn`.
  3. Sorts the rest by time and schedules the first 59.
- **The last notification:** slot 60 is the "keep going" notification. It fires at the moment the first reminder left out would have fired. If none was left out within the year, it fires one year from now.
- **Watering date:** a reminder whose lead moves it before midnight (watering at 00:10, 15-minute lead) still belongs to the next day's watering.
- **Bad times:** a plant with a malformed reminder time gets no reminders, as today.

## Copy (en / pt-BR)

- **Keep-going title:** "🌱 Your reminders are running out" / "🌱 Seus lembretes estão acabando"
- **Keep-going body:** "Open PlantCare to keep getting watering reminders." / "Abra o PlantCare pra continuar recebendo os lembretes de rega."

## Calls I made (Arthur can overturn)

- **Horizon:** one year ahead.
- **Keep-going timing:** fires at the moment the first left-out reminder would have fired, so it arrives right when reminders would start missing.
- **Cap alert removed:** the old one-time "Only 60 reminders fit on your phone" alert goes away. Filling the 60 slots is now normal and the queue rolls forward.
- **Time zones:** a phone that changes time zone fires at the old local time until the next sync (the next time the app opens).

## Left to the builder

- **Order:** ties at the same minute sort by plant.
- **Notification data:** `data` on the keep-going notification so it can be told apart.
- **Tests:** how to fake `expo-notifications`, following the current `sync.test.ts`.
