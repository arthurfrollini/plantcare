# PlantCare backend and monorepo: design

Date: 2026-10-21
Status: approved 2026-10-21

## Intent

PlantCare is an Expo app that reminds people to water their plants. Today its data comes from a json-server mock and everything else lives on the device. This project gives it a real backend: accounts, a curated plant catalog, and the user's own plants stored server side, so a reinstall or a new phone keeps everything. It is also a portfolio piece next to finwise, so it should read as a small, well organized, well tested Node service, not an enterprise architecture.

This project is step 2 of an agreed sequence: (1) languages and Profile (done), (2) backend, (3) AI plant identification and diagnosis, (4) server-driven notifications. Steps 3 and 4 are out of scope here but the design must not block them.

## Goals

- Turn the repository into a monorepo with the mobile app and the API side by side.
- A Fastify API in TypeScript, organized by feature modules, running locally with Docker Compose.
- Accounts with email and password, and Google sign-in.
- A curated plant catalog, seeded from today's mock data, with English and Brazilian Portuguese texts, filterable by light and care difficulty, searchable by name.
- The user's plants (from the catalog or created manually) and their reminder settings stored in the API.
- The app switched from json-server to the API, including the account flow and the new catalog filters.
- Unit and end-to-end tests, CI, and simple documentation.

## Non-goals

- Deploying anywhere. The API runs on the developer's Mac only.
- Observability (Prometheus, Grafana, Loki, Jaeger). finwise already showcases that.
- Server-sent push notifications. Reminders stay local notifications scheduled on the device (step 4 revisits this).
- AI features (step 3). The data model should leave room for them.
- Users writing catalog content. Species are only created from curated data or by the AI (step 3); there is no moderation tooling.
- Dark mode (decided against: the animated splash is light only).

## Anti-goals

- Clean architecture layering (domain/application/infra folders, repository interfaces for everything). Keep it simple: one folder per module with routes, a service and schemas.
- A user's private plant ever appearing in someone else's catalog.
- Losing a user's plants or reminders when they sign in on a new device.

## Decided by the product owner

- Stack: Node.js with Fastify.
- Organization: feature modules, readable, no clean architecture.
- Local only, with Docker Compose and the basics finwise has (env validation, migrations, seed, lint, tests, CI).
- No observability. Tests yes. Documentation yes, kept simple.
- Monorepo, not a separate API repository.
- Authentication modeled on finwise: bcrypt passwords, short-lived JWT access token, refresh token stored in the database with rotation and cleanup of expired tokens. Plus Google sign-in.
- The app is usable without an account. An account is required only when the user saves a plant. The name typed on the first screen becomes the account name.
- Users table holds at least name, email, Google id and language preference. The avatar stays as initials (no photo upload for users).
- Language preference is stored on the account once the user has one, and the app follows it on any device. English is the default.
- Catalog: curated by the team, seeded from the current mock plants. Each plant gets a light level and a care difficulty. The room/environment filter is removed.
- Catalog filters: light and care difficulty, plus search by name.
- Every user plant belongs to a catalog species. There are no private, species-less plants. A user can give their plant a free nickname ("Gretting", "Babosa", "Pikachu") that only they see; the catalog keeps the species under its real name (for example *Aloe vera*).
- Adding a plant: the main path is a photo (AI identification, step 3). The alternative is typing the species name: the API first searches the catalog (scientific name, localized names and common names, accent- and case-insensitive) and only calls the AI on a miss (step 3). The AI resolves the typed name to a scientific name; if that species already exists, the typed name is saved as a new common name; otherwise the AI creates the species for everyone, in English and Portuguese. Until step 3, only species already in the catalog can be added.
- User plants show the user's real photo when there is one; otherwise the species illustration (curated species) or the mascot. Generated illustrations are dropped.
- Google sign-in scope for this project: the API endpoint and the app button are built and tested with simulated Google tokens. Real Google sign-in (Google Cloud OAuth clients and a development build on a phone) is done later, together with the development build.
- Plant form fields. Required: species (from the catalog), watering frequency, reminder time (frequency pre-filled from the species). Optional: nickname, photo (camera or gallery), light, notes.
- One form for every way of adding a plant: picking a species from the catalog or by typed name pre-fills it, and the AI (step 3) will pre-fill it from a photo.
- Watering frequency must actually be honored: "4 times a week" schedules four reminders a week, not one (the current app schedules one).

## Decided by the designer (review these)

- Monorepo layout: `app/` (Expo app, moved from the repository root) and `api/` (Fastify), with npm workspaces at the root and a small `packages/shared` for the zod schemas and types both sides use (plant, user plant, frequency, light, difficulty, locale). If sharing turns out to fight Metro or the API build, the fallback is duplicating the few types and dropping the package.
- API stack: TypeScript strict (same flags as finwise: `strict`, `noUncheckedIndexedAccess`), Prisma with PostgreSQL, zod for every request and response through `fastify-type-provider-zod`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/cors`, `@fastify/multipart` and `@fastify/static`, pino logs (Fastify's default logger).
- Tests: Vitest for unit and e2e (`fastify.inject` against a dedicated test database). Lint: ESLint with finwise's strict rules (no `any`, no unsafe casts) plus Prettier and husky.
- API docs: OpenAPI generated from the zod schemas, served at `/docs` (Scalar). README covers setup.
- Docker Compose: one PostgreSQL service with its own container name and host port (5433) so it can run next to finwise's `pg` on 5432. The API runs on the host with `npm run dev`, not in a container.
- Google sign-in: the app obtains a Google ID token natively and posts it to `POST /auth/google`; the API verifies it with `google-auth-library` against the configured client ids, then finds or creates the user (matching by Google id, then by email) and issues the same access and refresh tokens as password login. This needs a development build of the app; inside Expo Go the Google button is hidden and email and password still work.
- Translations: a `PlantTranslation` table (plant id, locale, name, about, water tips) rather than JSON columns. The API returns the texts in the language sent in `Accept-Language` (`en` or `pt-BR`), falling back to English. Search matches the name in the requested language.
- Light levels: `full_sun`, `partial_shade`, `shade`. Care difficulty: `easy`, `medium`, `hard`. The seed assigns these to the 10 mock plants by hand.
- Watering frequency: `{ times: number, per: 'day' | 'week' }`, the same shape the mock uses (`repeat_every` renamed to `per`). The app spreads weekly reminders across the week at the chosen time (for example 4 per week on Monday, Wednesday, Friday and Sunday).
- Images: catalog illustrations are served by the API as static files, so the app no longer depends on an external host. User photos are uploaded through the API (multipart, JPEG/PNG/WebP, max 5 MB) and stored on local disk under `api/uploads/`, behind a storage helper that can later point at S3.
- Reminders remain local notifications. The API stores the reminder time (`HH:mm`), the IANA time zone and the frequency; after sign-in the app fetches the user's plants and reschedules all reminders.
- The existing on-device plants (saved before this project) are not migrated. The only user today is the developer.
- Signing in without saving a plant: the Welcome screen gets an "I already have an account" link and Profile gets "Sign in" when signed out, both opening the same auth screen used in the save flow. A returning user on a new phone signs in directly and skips the name step. When the account already has a name, the account name wins over the one typed on the device.
- Frequency limits: `per: 'day'` allows only `times: 1` (the catalog never goes above once a day); `per: 'week'` allows 1 to 7. One reminder time per plant. Weekly reminders are repeating weekly triggers, so a plant uses at most 7 of iOS's 64 pending local notifications; the app warns if a sync would exceed the limit.
- `GET /me/plants` returns the nickname (if any) plus the species name, about and water tips translated into the requested language from the catalog.
- Editing: My Plants opens a saved plant in the same form (edit and save, which reschedules its reminders). The species cannot be changed after saving. The photo is optional; a user photo replaces the illustration for that plant only.
- Sync: when signed in, the app refreshes My Plants and reschedules all reminders on launch and when it returns to the foreground. If the API is unreachable it shows the last synced list read-only, with a notice. Sign out cancels every local reminder and clears the cached list.
- User photos are private: served through an authenticated route (`GET /me/plants/:id/photo`), never as public static files.
- Lint scope: the finwise strict rules (no `any`, no unsafe casts, `noUncheckedIndexedAccess`) apply to `api/` and `packages/shared`. The app keeps `strict` TypeScript and gets ESLint with the recommended rules; files touched by this project are cleaned up to the strict standard, the rest of the app is not rewritten for lint alone.

## Data model (sketch)

- `User`: id, name, email (unique, nullable for Google-only), password hash (nullable for Google-only), Google id (unique, nullable), language (`en` | `pt-BR`, default `en`), timestamps.
- `RefreshToken`: id, user id, token (hashed), expires at, created at. Rotated on every refresh; expired ones deleted on a schedule or on use.
- `Plant` (catalog): id, slug, scientific name (unique), source (`curated` | `ai`), light, difficulty, default frequency, illustration path (nullable: AI-created species have none), timestamps.
- `PlantAlias`: plant id, name, search name (indexed). Common names in any language ("babosa", "língua de sogra", "snake plant"); the catalog search matches them too.
- `PlantTranslation`: plant id, locale, name, about, water tips. Unique on (plant id, locale).
- `UserPlant`: id, user id, catalog plant id (required), nickname (nullable), frequency, reminder time, time zone, light (nullable), notes (nullable), photo path (nullable), timestamps. Frequency and light are copied from the catalog at save time so the user's edits stay personal; the species name and texts always follow the catalog translation in the requested language.

## API surface (sketch)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/google`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /me`, `PATCH /me` (name, language)
- `GET /plants?search=&light=&difficulty=&page=` (public, no auth), `GET /plants/:id`
- `GET /me/plants`, `POST /me/plants`, `PATCH /me/plants/:id`, `DELETE /me/plants/:id`, `POST /me/plants/:id/photo`, `GET /me/plants/:id/photo`
- `GET /health`
- Every route validates input and output with zod and is listed in `/docs`. Errors use one JSON shape. Auth routes are rate limited.

## App changes in scope

- Move the app into `app/` and keep it running in Expo Go (SDK 57) with `npx expo start` from that folder.
- Replace json-server with the API client. The API base URL keeps today's behavior (the Metro host, overridable with `EXPO_PUBLIC_API_URL`).
- Catalog screen: remove the room filter; add search, light and difficulty filters; texts come from the API in the selected language.
- The unified plant form (catalog pre-fill and manual entry), with the photo picker for manual plants.
- Account flow: when a signed-out user saves a plant, show sign up / sign in (email and password; Google only in a development build), then finish the save.
- Tokens stored in `expo-secure-store`; refresh on 401 once, then sign out.
- Profile: language change saved to the account when signed in; sign out.
- My plants: list from the API; delete removes it server side and cancels its local reminders; reminders rescheduled after sign-in.

## Testing

- Unit tests for the services (auth token rotation, Google user matching, frequency to schedule conversion, translation fallback).
- E2E tests for every route against a real PostgreSQL test database, including: registering, logging in, refreshing (old token rejected after rotation), a user unable to read or change another user's plants, filters and search, upload limits.
- The frequency to schedule conversion lives in `packages/shared` and is unit tested there, since the app uses it to schedule notifications.
- CI on GitHub Actions: install, lint, type check, format check, API tests with a PostgreSQL service container, build.

## Left to the builder

- Exact folder names inside each module, test file layout, script names.
- Access and refresh token lifetimes (finwise's values are a fine default).
- Pagination size and the exact error codes.
- How the app's API client is structured.
- The exact weekday spread for weekly frequencies, as long as it is even and documented.

## Later (not this project)

- Step 3: AI identification by photo and by typed species name (catalog first, AI on a miss, new species created for everyone). Diagnosis from a plant's detail in My Plants ("Report a problem"): photo plus optional description, likely cause with confidence, actions (water less, more light, fertilizer), a one-tap "apply" when the action is a setting change, and a diagnosis history per plant.
- Step 4: server-driven notifications.
- Maestro end-to-end flows for the app.
