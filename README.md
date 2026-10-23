# PlantCare

A phone app that reminds you to water your plants. The catalog knows what each species needs; you pick the days, the time and how early you want the reminder, and your phone notifies you.

## What it does

- Browse the catalog without an account: search with or without accents, filter by light and care difficulty, and add several plants at once. Sign-up comes when you add your first plants.
- Each plant's screen shows the species' difficulty, light and watering. You pick the watering days, a time on the half hour and a reminder 5 to 30 minutes ahead, and every change saves right away.
- Reminders are local notifications ("In 15 min you need to water your Snake plant.") on daily, weekly, every-two-weeks and monthly schedules.
- My plants lists your garden by next watering, with your own photos, and still opens offline.
- In Profile you set an avatar, your name and the language (English or Brazilian Portuguese), change your password, sign out or delete your account.
- Next up: identifying a plant from a photo or a typed name with AI, and a "my plant is sick" diagnosis.

## How it's built

An npm workspaces monorepo:

| Package | What's in it |
|---|---|
| `app/` | Expo SDK 57, React Native 0.86, React Navigation 7, i18next, expo-notifications, expo-image, Jest |
| `api/` | Fastify 5, Prisma 7 on PostgreSQL 17, zod, JWT access tokens with rotating refresh tokens, private photo storage, Vitest |
| `packages/shared/` | zod schemas and the watering schedule rules, used by both the app and the API |

Keeping the schedule rules in `packages/shared` means the API validates a plant's schedule with the same code the app uses to book its notifications.

## Running it

You need Node.js 22+ and Docker. Run `npm install` once at the repo root.

1. Start the API (details in `api/README.md`): copy `api/.env.example` to `api/.env`, run `docker compose up -d db` from the repo root, then `npm run db:migrate` and `npm run db:seed` in `api/`, and `npm run api` from the root. It listens on `http://localhost:3333`, with interactive docs at `/docs`.
2. Start the app with `npm run app` (details in `app/README.md`) and open it in Expo Go on your phone, on the same Wi-Fi as your computer, or in a simulator.

After pulling new changes, run `npm install` and `npm run db:migrate -w @plantcare/api`.

## Checks

`npm run typecheck`, `npm run lint` and `npm test` run in every package. CI on GitHub Actions runs the same checks on Linux, with the API tests against a PostgreSQL service.

## Docs

- `docs/superpowers/specs/`: the design behind each feature.
- `docs/superpowers/plans/`: the task-by-task plans they were built from.
- `learning/`: study notes in Portuguese on the architecture, data model, auth, reminders, testing and how to present the project.
