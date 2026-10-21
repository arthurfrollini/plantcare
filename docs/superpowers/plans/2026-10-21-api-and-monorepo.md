# PlantCare API and Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into a monorepo and build the PlantCare API (accounts, catalog, the user's plants, photos) running locally, fully tested.

**Architecture:** npm workspaces with `app/` (the existing Expo app, moved), `api/` (Fastify) and `packages/shared` (zod schemas, types and the reminder-schedule helper used by both sides). The API is organized by feature module (`auth`, `me`, `plants`, `user-plants`), each a folder with routes, a service and schemas; Prisma talks to PostgreSQL in Docker. The app is only moved in this plan; wiring it to the API is a second plan.

**Tech Stack:** Node 22, TypeScript ~6.0, Fastify 5, fastify-type-provider-zod 7, zod 4, Prisma 7.10 with `@prisma/adapter-pg`, PostgreSQL 17, Vitest, bcryptjs, `@fastify/jwt`, google-auth-library, `@fastify/swagger` + `@scalar/fastify-api-reference`, tsx (dev) and tsup (build).

**Spec:** `docs/superpowers/specs/2026-10-21-backend-design.md`

## Global Constraints

- Node 22 (`"engines": { "node": ">=22" }` in the root `package.json`).
- TypeScript `~6.0` everywhere (typescript-eslint supports `<6.1`; do not take TypeScript 7).
- Prisma `7.10.x` (`prisma`, `@prisma/client`, `@prisma/adapter-pg`); the npm `latest` tag is an 8.0 release candidate, do not use it.
- `api/` and `packages/shared` use finwise's strict rules: `strict` and `noUncheckedIndexedAccess` in tsconfig; ESLint errors on `no-explicit-any`, all `no-unsafe-*`, `consistent-type-assertions` with `assertionStyle: 'never'` (const assertions allowed), `as unknown as` and `as never`. Narrow with checks or parse with zod instead of casting.
- The API is ESM (`"type": "module"`), tsconfig `"module": "preserve"`, `"moduleResolution": "bundler"`. Dev runs with `tsx watch`, the build bundles with tsup (shared package inlined).
- `packages/shared` is consumed as TypeScript source: its `package.json` `exports` points `"."` to `./src/index.ts` (types and default). No build step for it.
- The API listens on port **3333** (the app already targets `:3333`).
- PostgreSQL runs in Docker as container `plantcare-pg`, image `postgres:17-alpine`, host port **5433**, databases `plantcare` and `plantcare_test`. It must coexist with finwise's `pg` on 5432.
- One error shape for every non-2xx response: `{ "error": { "code": string, "message": string } }`.
- Locales are exactly `en` and `pt-BR`; English is the default and the fallback.
- No observability stack, no deploy, no server push.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Email case: registering `Ana@Example.com` and logging in as `ana@example.com` must work, and registering both must be rejected as a duplicate (emails stored lowercased and trimmed). Test in Task 6.
- Accents in search: `?search=orquidea` must find "Orquídea" and `?search=SAO JORGE` must find "Espada São Jorge" (case- and accent-insensitive). Test in Task 5.
- `Accept-Language` as browsers and phones send it: `pt-BR,pt;q=0.9,en;q=0.8` → Portuguese; `pt` → Portuguese; `fr-FR` or missing → English. Test in Task 5.
- Another user's plant: reading, changing, deleting or fetching the photo of a plant id that belongs to someone else returns 404 (never 403, never the data). Test in Task 9 and Task 10.
- Malformed reminder input: `reminderTime: "25:00"`, `"9:5"`, `timeZone: "Mars/Olympus"`, `{ times: 2, per: "day" }`, `{ times: 8, per: "week" }` are all rejected with 400 and the error shape. Test in Task 2 (schemas) and Task 9 (route).

---

### Task 1: Monorepo layout with the app moved to `app/`

**Files:**
- Move: everything that is the Expo app (`App.tsx`, `index.ts`, `app.json`, `assets/`, `src/`, `custom.d.ts`, `tsconfig.json`, `package.json`, `package-lock.json`) into `app/` with `git mv`
- Create: root `package.json`, root `.gitignore` (merge of the app's), root `README.md` (short: what the repo is, the three folders, how to start each)
- Modify: `app/package.json` (name `@plantcare/app`), `app/README.md` (the current README, paths updated)
- Keep at root: `docs/`, `.git`

**Interfaces:**
- Produces: root `package.json` with `"private": true`, `"workspaces": ["app", "api", "packages/*"]`, `"engines": { "node": ">=22" }`, and scripts `"app": "npm run start -w @plantcare/app"`, `"api": "npm run dev -w @plantcare/api"`, `"test": "npm run test --workspaces --if-present"`, `"lint": "npm run lint --workspaces --if-present"`, `"typecheck": "npm run typecheck --workspaces --if-present"`. A single `package-lock.json` at the root.

- [ ] **Step 1:** Move the app with `git mv` so history follows, create the root files above, delete `app/package-lock.json` and `app/node_modules`, run `npm install` at the root.
- [ ] **Step 2: Verify the app still type-checks and bundles from its new folder**

Run: `cd app && npx tsc --noEmit && npx expo export --platform ios --output-dir /tmp/plantcare-export && npx expo-doctor`
Expected: no type errors, export finishes with `Exported: /tmp/plantcare-export`, expo-doctor reports all checks passed. If Metro cannot resolve hoisted packages, fix it in `app/metro.config.js` (Expo's monorepo support), not by un-hoisting.

- [ ] **Step 3: Commit** (`git commit -m "Move the app into app/ and set up npm workspaces"`)

### Task 2: `packages/shared`: schemas and the reminder schedule

**Files:**
- Create: `packages/shared/package.json` (`@plantcare/shared`, `"type": "module"`, exports `./src/index.ts`, scripts `test`, `typecheck`, `lint`), `tsconfig.json`, `eslint.config.mjs` (finwise rules), `vitest.config.ts`
- Create: `packages/shared/src/index.ts`, `src/schemas.ts`, `src/schedule.ts`
- Test: `packages/shared/src/schemas.test.ts`, `src/schedule.test.ts`

**Interfaces:**
- Produces (all exported from `@plantcare/shared`):
  - `localeSchema = z.enum(['en', 'pt-BR'])`, `type Locale`
  - `lightSchema = z.enum(['full_sun', 'partial_shade', 'shade'])`, `type Light`
  - `difficultySchema = z.enum(['easy', 'medium', 'hard'])`, `type Difficulty`
  - `frequencySchema`: `{ times: number, per: 'day' | 'week' }`, `per: 'day'` only allows `times: 1`, `per: 'week'` allows integers 1–7; `type Frequency`
  - `reminderTimeSchema`: string matching `HH:mm` 24h (`^([01]\d|2[0-3]):[0-5]\d$`)
  - `timeZoneSchema`: string accepted only if `Intl.supportedValuesOf('timeZone')` contains it or it is `"UTC"`
  - `plantSourceSchema = z.enum(['curated', 'ai'])`, `type PlantSource`
  - `catalogPlantSchema`: `{ id: string, slug: string, scientificName: string, source: PlantSource, name: string, about: string, waterTips: string, light: Light, difficulty: Difficulty, frequency: Frequency, imageUrl: string | null }`
  - `catalogPageSchema`: `{ items: CatalogPlant[], nextPage: number | null }`
  - `userSchema`: `{ id: string, name: string, email: string | null, language: Locale, hasPassword: boolean, hasGoogle: boolean }`
  - `authResponseSchema`: `{ accessToken: string, refreshToken: string, user: User }`
  - `userPlantSchema`: `{ id: string, catalogPlantId: string, nickname: string | null, speciesName: string, scientificName: string, about: string, waterTips: string, frequency: Frequency, reminderTime: string, timeZone: string, light: Light | null, notes: string | null, imageUrl: string | null, hasPhoto: boolean, createdAt: string }` (`imageUrl` is the species illustration; the user's photo is fetched separately when `hasPhoto`)
  - `createUserPlantSchema`: `{ catalogPlantId: string, nickname?: string (1–40 chars, trimmed), frequency?: Frequency, reminderTime, timeZone, light?, notes?: string (≤ 500) }`
  - `updateUserPlantSchema`: `nickname?: string | null` (null clears it), `frequency?`, `reminderTime?`, `timeZone?`, `light?: Light | null`, `notes?: string | null`; the species cannot change
  - `reminderSlots(frequency: Frequency, reminderTime: string): Array<{ weekday: number | null, hour: number, minute: number }>` where `weekday` uses Expo's convention (1 = Sunday … 7 = Saturday) and is `null` for daily

- [ ] **Step 1: Write the failing tests.** `schedule.test.ts` asserts the weekly table exactly, plus the daily case:

```ts
const MON = 2, TUE = 3, WED = 4, THU = 5, FRI = 6, SAT = 7, SUN = 1;
it.each([
  [1, [MON]], [2, [MON, THU]], [3, [MON, WED, FRI]], [4, [MON, WED, FRI, SUN]],
  [5, [MON, TUE, THU, FRI, SAT]], [6, [MON, TUE, WED, THU, FRI, SAT]],
  [7, [SUN, MON, TUE, WED, THU, FRI, SAT]],
])('spreads %i weekly reminders', (times, weekdays) => {
  expect(reminderSlots({ times, per: 'week' }, '08:30').map((s) => s.weekday)).toEqual(weekdays);
  expect(reminderSlots({ times, per: 'week' }, '08:30').every((s) => s.hour === 8 && s.minute === 30)).toBe(true);
});
it('daily is one slot without weekday', () => {
  expect(reminderSlots({ times: 1, per: 'day' }, '21:05')).toEqual([{ weekday: null, hour: 21, minute: 5 }]);
});
```

`schemas.test.ts` asserts that `frequencySchema` rejects `{ times: 2, per: 'day' }`, `{ times: 0, per: 'week' }`, `{ times: 8, per: 'week' }`, `{ times: 1.5, per: 'week' }`; `reminderTimeSchema` rejects `"25:00"`, `"9:05"`, `"09:5"` and accepts `"00:00"`, `"23:59"`; `timeZoneSchema` accepts `"America/Sao_Paulo"`, `"UTC"` and rejects `"Mars/Olympus"`; `createUserPlantSchema` rejects a body without `catalogPlantId` and accepts `{ catalogPlantId, reminderTime, timeZone }` alone; `nickname` accepts `"Pikachu"` and rejects `"   "` and a 41-character string.

- [ ] **Step 2: Run them** — `npm test -w @plantcare/shared` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `schemas.ts` and `schedule.ts` with the signatures above; the weekly table is a constant (no formula), Sunday-first sorting as in the 7× case.
- [ ] **Step 4: Run** `npm test -w @plantcare/shared && npm run lint -w @plantcare/shared && npm run typecheck -w @plantcare/shared` — Expected: all pass.
- [ ] **Step 5: Commit** (`"Add the shared schemas and reminder schedule"`)

### Task 3: API skeleton, database and tooling

**Files:**
- Create: `api/package.json` (`@plantcare/api`; scripts `dev` = `tsx watch src/server.ts`, `build` = tsup to `dist/server.js`, `start`, `test` = vitest run, `typecheck`, `lint`, `format`, `db:migrate`, `db:seed`, `db:test:prepare` = migrate the test database), `tsconfig.json`, `eslint.config.mjs` (copy of finwise's rules adapted from jest to vitest), `.prettierrc`, `vitest.config.ts` (`fileParallelism: false`, setup file below), `tsup.config.ts`, `.env.example`, `.gitignore` (`.env`, `uploads/`, `dist/`, `src/generated/`)
- Create: `docker-compose.yml` at the repo root (service `db` as in Global Constraints; `docker/init.sql` creates `plantcare_test`)
- Create: `api/prisma/schema.prisma`, `api/prisma.config.ts`, first migration
- Create: `api/src/env.ts`, `api/src/db.ts`, `api/src/app.ts`, `api/src/server.ts`, `api/src/errors.ts`, `api/src/routes/health.ts`
- Test: `api/test/setup.ts`, `api/test/helpers.ts`, `api/src/routes/health.test.ts`, `api/src/env.test.ts`

**Interfaces:**
- Produces:
  - `env` (from `src/env.ts`), parsed with zod at import: `DATABASE_URL` (string url), `JWT_SECRET` (min 32 chars), `ACCESS_TOKEN_TTL` (default `"15m"`), `REFRESH_TOKEN_TTL_DAYS` (int, default 30), `GOOGLE_CLIENT_IDS` (comma-separated → `string[]`, default empty), `UPLOADS_DIR` (default `"uploads"`), `PORT` (default 3333), `CORS_ORIGIN` (default `"*"`), `NODE_ENV`. Invalid env throws listing every bad key.
  - `prisma` (from `src/db.ts`): a `PrismaClient` built with the pg adapter from `env.DATABASE_URL`.
  - `buildApp(options?: { prisma?: PrismaClient; googleVerifier?: GoogleVerifier; logger?: boolean }): Promise<FastifyInstance>` in `src/app.ts`: registers the zod type provider, CORS, rate-limit (global off, per-route opt-in), swagger + Scalar at `/docs`, the error handler, `@fastify/static` for `api/public` under `/static/`, and every module's routes. `type GoogleVerifier` is defined in Task 7; until then the option is typed in `app.ts` as that alias.
  - `AppError(statusCode: number, code: string, message: string)` in `src/errors.ts`; the error handler maps `AppError`, zod validation errors (400, code `validation_error`), rate-limit (429, `rate_limited`), and anything else (500, `internal_error`, message not leaked) to the one error shape.
  - Test helpers: `createTestApp(options?)` returning `{ app, prisma }` against `plantcare_test`; `resetDb()` truncating all tables between tests.
- Prisma models (in this task, all of them): `User`, `RefreshToken`, `Plant`, `PlantTranslation`, `PlantAlias`, `UserPlant` exactly as in the spec's data model, plus: `Plant.scientificName` unique, `Plant.source` (`curated` | `ai`, default `curated`), `Plant.imageFile` nullable, `PlantAlias.searchName` indexed, `UserPlant.catalogPlantId` required, `User.email` unique (stored lowercased), `RefreshToken.tokenHash` unique, `PlantTranslation` unique on `(plantId, locale)` and a `searchName` column (lowercased, accents removed) indexed, `UserPlant` indexed on `userId`; frequency stored as `frequencyTimes Int` + `frequencyPer String`; ids are cuid.

- [ ] **Step 1: Write the failing tests:** `health.test.ts` — `GET /health` returns 200 `{ status: 'ok' }`; `GET /nope` returns 404 with `{ error: { code: 'not_found', message: expect.any(String) } }`; `env.test.ts` — parsing `{ JWT_SECRET: 'short' }` throws an error whose message mentions `JWT_SECRET` and `DATABASE_URL`.
- [ ] **Step 2: Run** `docker compose up -d db && npm run db:test:prepare -w @plantcare/api && npm test -w @plantcare/api` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** tests, lint, typecheck, `npm run build -w @plantcare/api && node api/dist/server.js` (then `curl localhost:3333/health` and `curl -s localhost:3333/docs | grep -i scalar`) — Expected: all pass, health `{"status":"ok"}`, docs page served.
- [ ] **Step 5: Commit** (`"Add the API skeleton, database and tooling"`)

### Task 4: Catalog seed

**Files:**
- Create: `api/prisma/seed.ts`, `api/prisma/seed-data.ts`, `api/public/plants/<slug>.svg` (the 8 illustrations downloaded once from the URLs in `app/src/services/server.json`, named by slug)
- Create: `api/src/plants/search-name.ts`
- Test: `api/prisma/seed.test.ts`, `api/src/plants/search-name.test.ts`

**Interfaces:**
- Produces: `toSearchName(text: string): string` (NFD normalize, strip combining marks, lowercase, replace hyphens with spaces, collapse spaces, trim). The seed upserts by `slug`, so running it twice changes nothing.
- Seed values: the mock's plants minus **Frutíferas** ("fruit trees" is a category, not a species, so it cannot have a scientific name). Texts are the mock's Portuguese, typo-fixed, plus a faithful English translation written by the implementer; all `source: curated`:

| slug | scientific name | PT name | EN name | light | difficulty | frequency | image | aliases |
|---|---|---|---|---|---|---|---|---|
| aningapara | Montrichardia linifera | Aningapara | Aninga | partial_shade | easy | 2/week | 1.svg | aninga, aninga-pará |
| zamioculca | Zamioculcas zamiifolia | Zamioculca | ZZ plant | shade | easy | **1/week** (mock said daily) | 2.svg | zamioculcas, zz, planta da fortuna |
| peperomia | Peperomia obtusifolia | Peperomia | Baby rubber plant | partial_shade | easy | 3/week | 3.svg | peperômia |
| imbe | Thaumatophyllum bipinnatifidum | Imbé | Lacy tree philodendron | partial_shade | easy | 2/week | 4.svg | guaimbê, philodendron bipinnatifidum |
| espada-sao-jorge | Dracaena trifasciata | Espada São Jorge | Snake plant | partial_shade | easy | **1/week** (mock said daily) | 5.svg | espada de são jorge, sansevieria, língua de sogra |
| yucca | Yucca gigantea | Yucca | Spineless yucca | full_sun | easy | 1/week | 6.svg | iúca, yuca |
| orquidea | Phalaenopsis | Orquídea | Moth orchid | partial_shade | hard | 4/week | 8.svg | orquídea borboleta, phalaenopsis |
| violeta | Streptocarpus ionanthus | Violeta | African violet | partial_shade | medium | 2/week | 3.svg | violeta africana, saintpaulia |
| hortensia | Hydrangea macrophylla | Hortênsia | Hydrangea | full_sun | medium | 1/day | 2.svg | hydrangea |

The two corrected frequencies also get water tips that match them (no "Regue 1 vez no dia"). Before writing the seed, check each scientific name against a botanical source (POWO or GBIF) and fix any that is outdated; `7.svg` (fruit trees) is not copied.

- [ ] **Step 1: Write the failing tests:** `search-name.test.ts` — `toSearchName('Espada São Jorge')` is `'espada sao jorge'`, `toSearchName('  ORQUÍDEA ')` is `'orquidea'`; `seed.test.ts` — after running the seed twice against the test DB there are 9 plants, 18 translations and the aliases from the table (no duplicates), every plant has both locales and a unique scientific name, `zamioculca` has frequency `{ times: 1, per: 'week' }`, and every image file referenced exists in `api/public/plants`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** seed, data and `toSearchName`; wire `db:seed` and Prisma's seed config.
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Commit** (`"Seed the plant catalog in English and Portuguese"`)

### Task 5: Catalog routes

**Files:**
- Create: `api/src/plants/routes.ts`, `api/src/plants/service.ts`, `api/src/i18n.ts`
- Test: `api/src/plants/routes.test.ts`, `api/src/i18n.test.ts`

**Interfaces:**
- Consumes: `catalogPlantSchema`, `catalogPageSchema`, `lightSchema`, `difficultySchema` (Task 2); `toSearchName` (Task 4).
- Produces: `resolveLocale(acceptLanguage: string | undefined): Locale` in `src/i18n.ts` (first supported tag by q-order; any `pt*` → `pt-BR`; else `en`). Routes: `GET /plants?search&light&difficulty&page` (page ≥ 1, 20 per page, ordered by localized name) → `CatalogPage`; `GET /plants/:id` → `CatalogPlant` or 404 `plant_not_found`. `imageUrl` is the path `/static/plants/<file>` (the app prefixes its API base URL). Public, no auth.

- [ ] **Step 1: Write the failing tests:** `resolveLocale` cases from Review Focus (`'pt-BR,pt;q=0.9,en;q=0.8'` → `pt-BR`, `'pt'` → `pt-BR`, `'fr-FR'` → `en`, `undefined` → `en`, `'en;q=0.5,pt-BR;q=0.9'` → `pt-BR`); routes: default list returns 9 English items sorted by name with `nextPage: null`, each with `scientificName` and `source: 'curated'`; `Accept-Language: pt-BR` returns Portuguese names; `?search=orquidea` returns only Orchid; `?search=SAO JORGE` with pt-BR returns "Espada São Jorge"; `?search=lingua de sogra` and `?search=sansevieria` return the snake plant (aliases); `?search=dracaena` returns it too (scientific name); `?light=full_sun` returns exactly yucca and hortensia; `?difficulty=hard` returns only orquidea; `?light=sunny` returns 400 `validation_error`; `GET /plants/unknown` returns 404 `plant_not_found`; `GET /static/plants/<file>` for a returned `imageUrl` returns 200 `image/svg+xml`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** service (match when `toSearchName(search)` is contained in the resolved locale's `PlantTranslation.searchName`, in any `PlantAlias.searchName`, or in the normalized scientific name) and routes.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add catalog routes with search, filters and translations"`)

### Task 6: Email and password auth with refresh rotation

**Files:**
- Create: `api/src/auth/routes.ts`, `api/src/auth/service.ts`, `api/src/auth/tokens.ts`, `api/src/auth/authenticate.ts`
- Test: `api/src/auth/routes.test.ts`, `api/src/auth/tokens.test.ts`

**Interfaces:**
- Consumes: `authResponseSchema`, `userSchema`, `localeSchema` (Task 2).
- Produces:
  - `app.authenticate` preHandler (registered in `buildApp`) that verifies the `Authorization: Bearer` access token and sets `request.userId: string`; missing/invalid/expired → 401 `unauthorized`.
  - `issueTokens(prisma, userId): Promise<{ accessToken: string; refreshToken: string }>` in `tokens.ts`: access token = JWT `{ sub: userId }` signed with `JWT_SECRET`, lifetime `ACCESS_TOKEN_TTL`; refresh token = 48 random bytes base64url, stored only as its SHA-256 hash with `expiresAt = now + REFRESH_TOKEN_TTL_DAYS`.
  - `toUserDto(user): User` in `service.ts` (used by Tasks 7 and 8).
  - Routes: `POST /auth/register { name (1–60), email, password (8–128), language? }` → 201 `AuthResponse`; duplicate email → 409 `email_taken`. `POST /auth/login { email, password }` → 200 `AuthResponse`; wrong email or password → 401 `invalid_credentials` (same message for both). `POST /auth/refresh { refreshToken }` → 200 `AuthResponse` with a new pair, the old refresh token deleted; unknown or expired → 401 `invalid_refresh_token`. `POST /auth/logout { refreshToken }` → 204 (idempotent). Register, login and refresh are rate limited to 10 requests per minute per IP.
  - Expired refresh tokens are deleted when used and by `deleteExpiredRefreshTokens(prisma): Promise<number>`, which `server.ts` runs on start and every 6 hours.
- Passwords hashed with bcryptjs cost 12. Emails trimmed and lowercased before storing and comparing.

- [ ] **Step 1: Write the failing tests:** register → 201 with tokens and `user.hasPassword: true`; the Review Focus email case (`Ana@Example.com` registered, login as `ana@example.com` → 200; registering `ana@example.com` again → 409); wrong password and unknown email both → 401 `invalid_credentials`; a protected test route (registered only in the test app via `app.authenticate`) returns 401 without a token, with a garbage token, and with an expired token (sign one with `expiresIn: '-1s'`), and 200 with a valid one; refresh returns a new pair and reusing the old refresh token → 401; logout then refresh with that token → 401; 11 logins in a minute → 429 `rate_limited`; `deleteExpiredRefreshTokens` removes only expired rows; the stored refresh token value is never the raw token.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add email and password auth with refresh token rotation"`)

### Task 7: Google sign-in

**Files:**
- Create: `api/src/auth/google.ts`
- Modify: `api/src/auth/routes.ts`, `api/src/auth/service.ts`, `api/src/app.ts` (default verifier)
- Test: `api/src/auth/google.test.ts`

**Interfaces:**
- Consumes: `issueTokens`, `toUserDto` (Task 6).
- Produces: `type GoogleProfile = { googleId: string; email: string | null; emailVerified: boolean; name: string | null }`; `type GoogleVerifier = (idToken: string) => Promise<GoogleProfile>` (throws on an invalid token); `createGoogleVerifier(clientIds: string[]): GoogleVerifier` using `OAuth2Client.verifyIdToken` with `audience: clientIds`. Route `POST /auth/google { idToken, name?, language? }` → 200 `AuthResponse`; invalid token → 401 `invalid_google_token`; when `GOOGLE_CLIENT_IDS` is empty the route returns 503 `google_not_configured`.
- Matching: by `googleId` first; else by email only if `emailVerified` (then link the Google id to that user); else create a user with the Google name, or the `name` from the body, or the email's local part. Rate limited like the other auth routes.

- [ ] **Step 1: Write the failing tests** with a fake verifier passed to `createTestApp({ googleVerifier })`: new Google user is created (`hasGoogle: true`, `hasPassword: false`); the same Google id logs into the same user; a verified email that matches a password user links to it (`hasPassword: true`, `hasGoogle: true`); an unverified matching email creates a separate user instead of linking; a verifier that throws → 401 `invalid_google_token`; with no client ids configured → 503 `google_not_configured`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add Google sign-in with ID token verification"`)

### Task 8: The signed-in user (`/me`)

**Files:**
- Create: `api/src/me/routes.ts`
- Test: `api/src/me/routes.test.ts`

**Interfaces:**
- Consumes: `app.authenticate`, `toUserDto` (Task 6).
- Produces: `GET /me` → `User`; `PATCH /me { name?: string (1–60, trimmed), language?: Locale }` → `User`. Both require auth.

- [ ] **Step 1: Write the failing tests:** GET returns the registered user; PATCH `{ language: 'pt-BR' }` persists (a following GET shows it); PATCH `{ name: '   ' }` → 400; PATCH `{ language: 'es' }` → 400; both without a token → 401.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add the signed-in user routes"`)

### Task 9: The user's plants

**Files:**
- Create: `api/src/user-plants/routes.ts`, `api/src/user-plants/service.ts`
- Test: `api/src/user-plants/routes.test.ts`

**Interfaces:**
- Consumes: `createUserPlantSchema`, `updateUserPlantSchema`, `userPlantSchema` (Task 2); `resolveLocale` (Task 5); `app.authenticate` (Task 6).
- Produces: `toUserPlantDto(row, catalogTranslation | null): UserPlant` in `service.ts` (used by Task 10). Routes, all authenticated: `GET /me/plants` → `UserPlant[]` ordered by next reminder time-of-day then name; `POST /me/plants` → 201 `UserPlant`; `PATCH /me/plants/:id` → `UserPlant`; `DELETE /me/plants/:id` → 204. A `catalogPlantId` that does not exist → 400 `plant_not_found`. Any id that is missing or owned by another user → 404 `user_plant_not_found`.
- Behavior from the spec: frequency and light are copied from the species when the body omits them; `speciesName`, `about` and `waterTips` always come from the species translation in the request's locale; `nickname` is returned as stored (null when unset).

- [ ] **Step 1: Write the failing tests:** create with only `catalogPlantId`, `reminderTime`, `timeZone` → frequency and light copied, `nickname: null`, `speciesName` English by default and Portuguese with `Accept-Language: pt-BR`; with `nickname: 'Pikachu'` → `nickname: 'Pikachu'` in both locales while `speciesName` still follows the locale; create without `catalogPlantId` → 400; the Review Focus malformed inputs (`"25:00"`, `"9:5"`, `"Mars/Olympus"`, `{ times: 2, per: 'day' }`, `{ times: 8, per: 'week' }`) → 400 `validation_error`; PATCH changes frequency and `nickname: null` clears the nickname; PATCH with `catalogPlantId` → 400; user B gets 404 for GET-by-list absence, PATCH and DELETE on user A's plant id (Review Focus); DELETE then list no longer contains it; unknown `catalogPlantId` → 400 `plant_not_found`.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add the user's plants routes"`)

### Task 10: Private plant photos

**Files:**
- Create: `api/src/storage.ts`, `api/src/user-plants/photo-routes.ts`
- Test: `api/src/user-plants/photo-routes.test.ts`, `api/src/storage.test.ts`

**Interfaces:**
- Consumes: `app.authenticate` (Task 6), `toUserPlantDto` (Task 9).
- Produces: `interface PhotoStorage { save(key: string, data: Buffer): Promise<void>; read(key: string): Promise<Buffer | null>; remove(key: string): Promise<void> }` and `createDiskStorage(dir: string): PhotoStorage` (keys are `<userPlantId>.<ext>`, never user-supplied file names). Routes, authenticated, owner only: `POST /me/plants/:id/photo` (multipart field `photo`; JPEG, PNG or WebP detected from the file's leading bytes, not the client's content type; max 5 MB) → `UserPlant` with `hasPhoto: true`, replacing any previous photo; `GET /me/plants/:id/photo` → the bytes with the right content type and `Cache-Control: private`; deleting the plant removes its photo file.
- Errors: no file → 400 `photo_missing`; other type → 415 `unsupported_photo_type`; over 5 MB → 413 `photo_too_large`; not owner → 404 `user_plant_not_found`.

- [ ] **Step 1: Write the failing tests** using small fixture images generated in the test (a valid PNG header buffer, a JPEG header buffer, a text file renamed `.png`, a 6 MB buffer): upload PNG → 200 `hasPhoto: true`; GET returns the same bytes; a text file with a `.png` name → 415; 6 MB → 413; no field → 400; user B uploading to or reading user A's plant photo → 404; uploading twice keeps one file; deleting the plant removes the file from the storage dir.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add private plant photo upload"`)

### Task 11: CI, hooks and documentation

**Files:**
- Create: `.github/workflows/ci.yml`, `.husky/pre-commit` (lint-staged on staged `api/` and `packages/` files), root `package.json` `prepare` script
- Modify: root `README.md`, create `api/README.md`

**Interfaces:**
- CI on push and pull request: Node 22; PostgreSQL 17 service container on 5433 with `plantcare_test`; steps `npm ci`, lint, typecheck (all workspaces), Prettier check for `api` and `packages`, `npm run db:test:prepare -w @plantcare/api`, tests (shared and api), `npm run build -w @plantcare/api`, and `cd app && npx tsc --noEmit`.
- `api/README.md`: prerequisites (Docker, Node 22), `cp .env.example .env`, `docker compose up -d db`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, docs at `http://localhost:3333/docs`, how to run tests, the module layout in five lines, and the error shape.

- [ ] **Step 1:** Write the workflow and hooks.
- [ ] **Step 2: Verify the workflow locally:** run every CI command in order from a clean `git clone` of the branch into a temp directory — Expected: all pass. Push the branch and confirm the GitHub Actions run is green (`gh run watch`).
- [ ] **Step 3:** Write the READMEs; follow `api/README.md` from scratch in the temp clone — Expected: `/health` and `/docs` respond.
- [ ] **Step 4: Commit** (`"Add CI, pre-commit hooks and API docs"`)
