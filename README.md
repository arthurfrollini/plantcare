# PlantCare

A phone app that reminds you to water your plants. The catalog knows what each species needs; you pick the days, the time and how early you want the reminder, and your phone notifies you.

## What it does

- Browse the catalog without an account: search with or without accents, filter by light and care difficulty, and add several plants at once. Sign-up comes when you add your first plants. Catalog photos come from Wikimedia Commons and iNaturalist under free licences (CC0, public domain, CC BY, CC BY-SA); each is credited on the plant's screen and in Profile → Photo credits.
- Each plant's screen shows the species' difficulty, light and watering. You pick the watering days, a time on the half hour and a reminder 5 to 30 minutes ahead, and every change saves right away.
- Reminders are local notifications ("In 15 min you need to water your Snake plant.") on daily, weekly, every-two-weeks and monthly schedules.
- The Today card on the home screen shows what to water today. Tap "Watered ✓" ("Reguei ✓" in Portuguese) to tick a plant and see your progress; a ticked watering skips its reminder, and undoing the tick brings it back.
- My plants lists your garden by next watering, with your own photos, and still opens offline.
- In Profile you set an avatar, your name and the language (English or Brazilian Portuguese), change your password, sign out or delete your account.
- Add with AI: type a plant's name or take a photo, and Claude Haiku finds the species while the screen ticks off each step. For a new species the API also finds a reference photo, from Wikimedia Commons and then iNaturalist, which Claude checks first: a coin, a drawing, a diagram, a fruit on its own or another plant is skipped for the next candidate. The preview shows that photo beside yours, so you can tell whether it is the right plant before anything is saved; "That's it! Add to my garden" puts the species in the catalog with that same photo, and your own photo on your plant.
- "My plant is sick" opens a free, offline symptom guide first, with nine symptoms, their likely causes and your plant's own light and watering next to them. If that isn't enough, an AI check-up reads a photo and an optional note; its advice stays in a yellow box until you mark the plant as healed.
- AI use has limits: 10 identifications and 5 check-ups per person per day, plus a daily spending ceiling for the whole app. Advice that mentions harmful substances is replaced before it is saved.

## How it's built

An npm workspaces monorepo:

| Package | What's in it |
|---|---|
| `app/` | Expo SDK 58, React Native 0.88, React Navigation 7, i18next, expo-notifications, expo-image, Jest |
| `api/` | Fastify 5, Prisma 7 on PostgreSQL 17, zod, JWT access tokens with rotating refresh tokens, private photo storage, Vitest |
| `packages/shared/` | zod schemas and the watering schedule rules, used by both the app and the API |

Keeping the schedule rules in `packages/shared` means the API validates a plant's schedule with the same code the app uses to book its notifications.

## Running it

You need Node.js 22+ and Docker. Run `npm install` once at the repo root.

1. Start the API (details in `api/README.md`): copy `api/.env.example` to `api/.env`, run `docker compose up -d db` from the repo root, then `npm run db:migrate` and `npm run db:seed` in `api/`, and `npm run api` from the root. It listens on `http://localhost:3333`, with interactive docs at `/docs`.
2. Start the app with `npm run app` (details in `app/README.md`) and open it in Expo Go on your phone, on the same Wi-Fi as your computer, or in a simulator.

After pulling new changes, run `npm install` and `npm run db:migrate -w @plantcare/api`.

The AI features need an Anthropic API key in `api/.env`:

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Without it the AI buttons show as unavailable; everything else works. |
| `AI_MODEL` | `claude-haiku-5-5` | The model used for identification and check-ups. |
| `AI_DAILY_SPEND_LIMIT_USD` | `0.5` | Daily ceiling for the whole app, in US dollars. `0` turns the AI off. |

## Checks

`npm run typecheck`, `npm run lint` and `npm test` run in every package. `npm run eval:ai -w @plantcare/api` runs the plant AI against 16 real photo cases with the real model (about US$0.01) and compares the result with `api/evals/plant-ai/baseline.json`. CI on GitHub Actions runs the same checks on Linux, with the API tests against a PostgreSQL service.

## Docs

- `docs/superpowers/specs/`: the design behind each feature.
- `docs/superpowers/plans/`: the task-by-task plans they were built from.
