# PlantCare App ↔ API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the Expo app from json-server and on-device plant storage to the PlantCare API: accounts, the curated catalog with the new filters, one plant form for create and edit with photos, My Plants from the API, and reminders kept in sync.

**Architecture:** A typed API layer in `app/src/api/` (axios + the shared zod schemas) with a session in `expo-secure-store` and a single-flight token refresh. An `AuthProvider` exposes the signed-in user and drives reminder sync. Screens stay in `app/src/pages/`; new logic lives in focused modules (`api/`, `auth/`, `reminders/`, `plants/`) that carry their own tests. Reminders stay local notifications, rebuilt from the API's list.

**Tech Stack:** Expo SDK 57, React Native 0.86, React Navigation 7, axios, zod 4 via `@plantcare/shared`, expo-secure-store, expo-image, expo-image-picker, expo-notifications, i18next, Jest (`jest-expo`) + `@testing-library/react-native`, axios-mock-adapter, ESLint (`eslint-config-expo` + typescript-eslint).

**Spec:** `docs/superpowers/specs/2026-10-21-backend-design.md` (section "App changes in scope" and the designer decisions on sign-in, sync, editing, photos and lint scope). The API it talks to is described by `docs/superpowers/plans/2026-10-21-api-and-monorepo.md`.

## Global Constraints

- Expo SDK 57 (App Store Expo Go is 57); every Expo/RN package is added with `npx expo install` from `app/`. Nothing may require a development build except the real Google sign-in, which stays hidden.
- The app must keep running in Expo Go (`npx expo start` from `app/`) and type-checking with `strict`.
- API base URL: today's behavior (`apiUrl()` from the Metro host, port 3333, `EXPO_PUBLIC_API_URL` overrides). Image and photo paths from the API are relative and must be prefixed with that base URL.
- Every API request sends `Accept-Language` with the current app language (`en` or `pt-BR`). Every response is parsed with the matching `@plantcare/shared` schema.
- Never send `Content-Type: application/json` on a request without a body (the API answers 400 to an empty JSON body).
- Tokens live in `expo-secure-store` only. On a 401 the client refreshes once; concurrent 401s share that one refresh; if it fails, the user is signed out.
- English is the default language; every new user-facing string goes in both `app/src/i18n/locales/en.ts` and `pt-BR.ts` in the plain tone already used there.
- Light labels: EN `Full sun`, `Partial shade`, `Shade`; PT `Sol pleno`, `Meia-sombra`, `Sombra`. Difficulty labels: EN `Easy`, `Medium`, `Hard`; PT `Fácil`, `Médio`, `Difícil`.
- Lint scope (spec): the app gets ESLint with the recommended rules everywhere; files created or rewritten by this plan (`src/api/**`, `src/auth/**`, `src/reminders/**`, `src/plants/**` and every page this plan rewrites) also get the strict rules (no `any`, no type assertions, no unsafe-*).
- The old on-device plants (`@plantcare:plants`) are not migrated (spec); the json-server mock is removed.
- Google sign-in: the button exists but only renders when a `GoogleIdTokenProvider` is supplied; none is supplied in this plan (real Google needs a development build).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- API unreachable (Mac off, phone on another network) on the catalog, the form and My Plants: a clear message with a retry action, never an endless spinner; My Plants shows the last synced list read-only with a notice. Tests in Task 5 and Task 8.
- An expired access token with several requests in flight (My Plants opening while reminders sync): exactly one refresh call, all requests retried with the new token; a failed refresh signs out once. Test in Task 3.
- A signed-out user taps Save on the form: the auth screen opens, and after signing in the plant is created exactly once, even with a double tap on Save. Test in Task 7.
- Switching language in Profile while the catalog or My Plants is open: the next fetch uses the new language and species names change. Test in Task 4 (Accept-Language follows the switch) and Task 5.
- Photo permission denied, or the user cancels the picker: the form still saves without a photo and says why there is none. Test in Task 7.

---

### Task 1: App test and lint tooling

**Files:**
- Modify: `app/package.json` (scripts `test`, `lint`), root `.github/workflows/ci.yml` (run `npm run lint -w @plantcare/app` and `npm test -w @plantcare/app`)
- Create: `app/jest.config.js` (preset `jest-expo`, setup file), `app/jest.setup.ts` (AsyncStorage mock, `expo-secure-store` in-memory mock, `expo-notifications` mock), `app/eslint.config.js`
- Modify: `app/src/components/Header.tsx` (export `initials`)
- Test: `app/src/components/Header.test.tsx`

**Interfaces:**
- Produces: `npm test -w @plantcare/app` and `npm run lint -w @plantcare/app`; the shared mocks every later test relies on; `export function initials(name: string): string` from `Header.tsx`.
- ESLint: `eslint-config-expo` flat config + typescript-eslint recommended for `src/**`; an override with the strict rules from `api/eslint.config.mjs` (no-explicit-any, all no-unsafe-*, consistent-type-assertions `never`) for `src/api/**`, `src/auth/**`, `src/reminders/**`, `src/plants/**`. Existing files must pass the recommended rules; fix them minimally (no rewrites).

- [ ] **Step 1: Write the failing test** `Header.test.tsx`: `initials('Ana Clara Souza')` → `'AC'`; `initials('  arthur ')` → `'A'`; `initials('')` → `''`; and rendering `<Header />` inside a navigation container with AsyncStorage holding `@plantcare:user = 'Arthur Frollini'` shows `AF` and `Arthur Frollini`.
- [ ] **Step 2: Run** `npm test -w @plantcare/app` — Expected: FAIL (no test runner configured yet).
- [ ] **Step 3: Implement** the tooling (`npx expo install jest-expo jest @types/jest`, `npm install -D @testing-library/react-native -w @plantcare/app`, `npx expo lint` style config), export `initials`, add the CI steps.
- [ ] **Step 4: Run** `npm test -w @plantcare/app && npm run lint -w @plantcare/app && npm run typecheck -w @plantcare/app` — Expected: all pass.
- [ ] **Step 5: Commit** (`"Add Jest and ESLint to the app"`)

### Task 2: Hand-off fixes in the shared package and the API

**Files:**
- Modify: `packages/shared/src/schedule.ts`, `api/src/auth/google.ts`, `api/src/auth/service.ts`
- Test: `packages/shared/src/schedule.test.ts`, `api/src/auth/google.test.ts`

**Interfaces:**
- Produces: `reminderSlots(frequency, reminderTime)` throws `Error('Invalid reminder time: <value>')` unless `reminderTime` matches `HH:mm` 24h (same rule as `reminderTimeSchema`). The Google verifier distinguishes verification failures (401 `invalid_google_token`, unchanged) from transport failures fetching Google's keys (502 `google_unavailable`).

- [ ] **Step 1: Write the failing tests:** `reminderSlots({ times: 1, per: 'day' }, '9:5')`, `'25:00'` and `''` throw `Invalid reminder time`; a fake verifier that throws an error marked as a network failure (define `class GoogleUnavailableError extends Error` in `google.ts` and throw it from the fake) → 502 `google_unavailable`; a fake that throws a plain `Error` → still 401 `invalid_google_token`.
- [ ] **Step 2: Run** `npm test -w @plantcare/shared && npm test -w @plantcare/api` — Expected: FAIL.
- [ ] **Step 3: Implement:** validate in `reminderSlots`; in `createGoogleVerifier`, wrap errors from fetching certificates (anything thrown that is not a token verification error from `google-auth-library`) in `GoogleUnavailableError`; map it to `AppError(502, 'google_unavailable', ...)` in the service.
- [ ] **Step 4: Run** both suites, lint and typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Reject malformed reminder times and report Google outages as 502"`)

### Task 3: API client and session

**Files:**
- Create: `app/src/api/config.ts`, `app/src/api/client.ts`, `app/src/api/endpoints.ts`, `app/src/auth/session.ts`
- Delete: `app/src/services/api.ts` (its `apiUrl()` moves to `config.ts`), `app/src/services/server.json`; remove `json-server` and the `server` script from `app/package.json`
- Test: `app/src/api/client.test.ts`, `app/src/api/endpoints.test.ts`, `app/src/auth/session.test.ts`

**Interfaces:**
- Consumes: `currentLanguage()` from `app/src/i18n`; shared schemas and types (`catalogPageSchema`, `catalogPlantSchema`, `userSchema`, `authResponseSchema`, `userPlantSchema`, `CreateUserPlant`, `UpdateUserPlant`, `Light`, `Difficulty`, `Locale`).
- Produces:
  - `config.ts`: `apiUrl(): string`; `assetUrl(path: string): string` (joins base URL and a relative path).
  - `session.ts`: `type Tokens = { accessToken: string; refreshToken: string }`; `loadTokens(): Promise<Tokens | null>`, `saveTokens(t: Tokens): Promise<void>`, `clearTokens(): Promise<void>` (secure-store keys `plantcare.accessToken`, `plantcare.refreshToken`).
  - `client.ts`: `api` (axios instance) with interceptors that add `Accept-Language: currentLanguage()` and `Authorization: Bearer <access>` when tokens exist, never set `Content-Type` when there is no body, and on 401 run one shared refresh (`POST /auth/refresh`), save the new tokens and retry once; if the refresh fails, clear tokens and call the handler registered with `setSignedOutHandler(fn: () => void): void`. Also `class ApiError extends Error { status: number | null; code: string }` (`status: null`, `code: 'network'` when the API is unreachable) and `toApiError(e: unknown): ApiError`.
  - `endpoints.ts` (each parses the response with its schema): `listCatalog(q: { search?: string; light?: Light; difficulty?: Difficulty; page?: number }): Promise<CatalogPage>`, `getCatalogPlant(id: string): Promise<CatalogPlant>`, `register(b: { name: string; email: string; password: string; language: Locale }): Promise<AuthResponse>`, `login(b: { email: string; password: string }): Promise<AuthResponse>`, `loginWithGoogle(b: { idToken: string; name?: string; language: Locale }): Promise<AuthResponse>`, `logout(refreshToken: string): Promise<void>`, `getMe(): Promise<User>`, `updateMe(b: { name?: string; language?: Locale }): Promise<User>`, `listMyPlants(): Promise<UserPlant[]>`, `createMyPlant(b: CreateUserPlant): Promise<UserPlant>`, `updateMyPlant(id: string, b: UpdateUserPlant): Promise<UserPlant>`, `deleteMyPlant(id: string): Promise<void>`, `uploadPlantPhoto(id: string, file: { uri: string; mimeType: string }): Promise<UserPlant>`, `plantPhotoSource(plant: UserPlant, accessToken: string): { uri: string; headers: Record<string, string>; cacheKey: string } | null` (null when `!plant.hasPhoto`; `cacheKey` is `<id>-<photoVersion>`).

- [ ] **Step 1: Write the failing tests** (axios-mock-adapter on `api`): `Accept-Language` is `en` by default and `pt-BR` after `changeLanguage('pt-BR')`; `Authorization` is set only when tokens are saved; `deleteMyPlant` sends no `Content-Type`; three concurrent requests that get 401 trigger exactly one `POST /auth/refresh` and all three succeed with the new token (Review Focus); a failing refresh clears tokens and calls the signed-out handler exactly once; a network error becomes `ApiError { status: null, code: 'network' }`; an API error body becomes `ApiError { status, code }`; `listCatalog({ light: 'shade', page: 2 })` sends those query params and parses the page; a response that fails its schema rejects; `assetUrl('/static/plants/yucca.svg')` joins without a double slash; `plantPhotoSource` returns null without a photo and a cacheKey that changes with `photoVersion`; session round-trips and clears.
- [ ] **Step 2: Run** `npm test -w @plantcare/app` — Expected: FAIL.
- [ ] **Step 3: Implement** (`npx expo install expo-secure-store`, `npm install -D axios-mock-adapter -w @plantcare/app`).
- [ ] **Step 4: Run** tests, lint, typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add the typed API client with session and single-flight refresh"`)

### Task 4: Accounts — AuthProvider, auth screen and entry points

**Files:**
- Create: `app/src/auth/AuthProvider.tsx`, `app/src/pages/Auth.tsx`, `app/src/auth/GoogleSignInButton.tsx`
- Modify: `app/App.tsx` (wrap routes in `AuthProvider`), `app/src/routes/stack.routes.tsx` (route `Auth: { mode: 'signIn' | 'signUp'; afterAuth?: 'savePendingPlant' }`), `app/src/pages/Welcome.tsx` (link "I already have an account"), `app/src/pages/Profile.tsx` (signed out: "Sign in"; signed in: name, email, "Sign out"; language change calls `updateMe` when signed in), `app/src/components/Header.tsx` (name from the account when signed in), locales
- Test: `app/src/auth/AuthProvider.test.tsx`, `app/src/pages/Auth.test.tsx`, `app/src/pages/Profile.test.tsx`

**Interfaces:**
- Consumes: Task 3 endpoints, session and `setSignedOutHandler`; `changeLanguage` from i18n.
- Produces: `useAuth(): { status: 'loading' | 'signedOut' | 'signedIn'; user: User | null; signIn(email: string, password: string): Promise<void>; signUp(name: string, email: string, password: string): Promise<void>; signInWithGoogle(idToken: string): Promise<void>; signOut(): Promise<void>; setLanguage(l: Locale): Promise<void> }` and `type GoogleIdTokenProvider = () => Promise<string | null>` (prop of `GoogleSignInButton`; the button renders nothing when no provider is passed).
- Rules from the spec: sign-up sends the current language and the name typed on the first screen (pre-filled, editable); after sign-in the account language is applied with `changeLanguage` and the account name replaces the local one (`@plantcare:user`); a returning user can sign in from Welcome and skip the name step (Welcome → Auth → plant catalog); `signOut` calls `logout`, clears tokens, cancels every reminder (Task 6's `cancelAllReminders`, wired when Task 6 lands — until then a no-op import) and clears the My Plants cache key `@plantcare:myPlantsCache`. Auth errors map to messages: `invalid_credentials`, `email_taken`, `validation_error`, `rate_limited`, `network`.

- [ ] **Step 1: Write the failing tests:** sign-up posts the typed name and current language, saves tokens, `status` becomes `signedIn`; sign-in with an account in `pt-BR` switches the app language to `pt-BR` (Review Focus: a following catalog request carries `Accept-Language: pt-BR`); wrong password shows the `invalid_credentials` message and stays signed out; the signed-out handler from Task 3 moves `status` to `signedOut`; Profile signed in shows email and Sign out, and changing language there calls `PATCH /me { language }`; Profile signed out shows Sign in; `GoogleSignInButton` renders nothing without a provider and, with a fake provider returning `'fake-id-token'`, calls `POST /auth/google` with that token.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** tests, lint, typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add sign up, sign in and sign out"`)

### Task 5: Catalog screen with search, light and difficulty filters

**Files:**
- Modify: `app/src/pages/PlantSelect.tsx` (rewrite), `app/src/components/PlantCardPrimary.tsx` (illustration from `assetUrl(imageUrl)`), locales
- Delete: `app/src/components/EnvironmentButton.tsx` (replaced)
- Create: `app/src/components/FilterChip.tsx`, `app/src/plants/useCatalog.ts`
- Test: `app/src/plants/useCatalog.test.ts`, `app/src/pages/PlantSelect.test.tsx`

**Interfaces:**
- Consumes: `listCatalog`, `assetUrl`, `toApiError` (Task 3); i18n language.
- Produces: `useCatalog(filters: { search: string; light: Light | null; difficulty: Difficulty | null }): { plants: CatalogPlant[]; loading: boolean; error: ApiError | null; loadMore(): void; retry(): void }` — search debounced 300 ms, refetches from page 1 when filters or the app language change, appends pages while `nextPage` is not null, ignores stale responses.
- Screen: search field, a chip row for light (All + 3) and one for difficulty (All + 3), the grid of species cards; tapping a card opens the plant form (Task 7) with `{ mode: 'create', catalogPlantId }`. The room filter and its copy are removed. Error state: message + Retry button.

- [ ] **Step 1: Write the failing tests:** typing `orq` fires one request after 300 ms with `search=orq`; selecting `Shade` sends `light=shade` and resets to page 1; `loadMore` requests page 2 only while `nextPage` is set; a slow response from an old query does not overwrite the newer one; switching language refetches (Review Focus); the screen shows the network message and Retry when the API is unreachable, and Retry refetches (Review Focus).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** tests, lint, typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Rebuild the catalog with search and light and difficulty filters"`)

### Task 6: Reminder sync

**Files:**
- Create: `app/src/reminders/sync.ts`
- Delete: `app/src/libs/storage.ts` (its notification and AsyncStorage plant code is replaced; move `PlantProps` users to shared types)
- Test: `app/src/reminders/sync.test.ts`

**Interfaces:**
- Consumes: `reminderSlots` (shared), i18n `notification.title` / `notification.body`.
- Produces: `syncReminders(plants: UserPlant[]): Promise<{ scheduled: number; skipped: number }>` — cancels every scheduled notification, then schedules one per slot (`WEEKLY` trigger with `weekday`, `hour`, `minute`, or `DAILY`), with `data: { userPlantId }` and the body naming `nickname ?? speciesName`; schedules at most 60 (leaves headroom under iOS's 64) in the order the API returns plants and reports the rest as `skipped`. `cancelAllReminders(): Promise<void>`. `ensureNotificationPermission(): Promise<boolean>` (moved from the old storage file).

- [ ] **Step 1: Write the failing tests** (expo-notifications mock): a 4×/week plant at `08:30` schedules four WEEKLY triggers on weekdays 2, 4, 6, 1; a daily plant schedules one DAILY trigger; a nickname is used in the body; existing notifications are cancelled first; 20 plants at 4×/week schedule 60 and report `skipped: 20`; a plant with a malformed time is skipped without aborting the others (Task 2 makes `reminderSlots` throw).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** (`"Rebuild reminders from the user's plants"`)

### Task 7: One plant form for create and edit, with photos

**Files:**
- Modify: `app/src/pages/PlantSave.tsx` → rename to `app/src/pages/PlantForm.tsx` (route `PlantForm: { mode: 'create'; catalogPlantId: string } | { mode: 'edit'; userPlantId: string }`), `app/src/routes/stack.routes.tsx`, locales
- Create: `app/src/plants/usePlantForm.ts`, `app/src/plants/pendingSave.ts`, `app/src/components/PhotoPicker.tsx`
- Test: `app/src/plants/usePlantForm.test.ts`, `app/src/pages/PlantForm.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4, 6 (`getCatalogPlant`, `createMyPlant`, `updateMyPlant`, `uploadPlantPhoto`, `listMyPlants`, `useAuth`, `syncReminders`).
- Produces: `usePlantForm(params)`: values `{ nickname: string; frequency: Frequency; reminderTime: string; light: Light | null; notes: string; photo: { uri: string; mimeType: string } | null }`, pre-filled from the species (create) or the saved plant (edit); `submit(): Promise<void>` guarded against re-entry. `pendingSave.ts`: `setPendingSave(v: FormValues & { catalogPlantId: string })`, `takePendingSave(): FormValues & { catalogPlantId: string } | null` (AsyncStorage key `@plantcare:pendingSave`).
- Form: species name and illustration (or the saved photo) on top, nickname, frequency (per day / per week; times 1–7 for week, fixed 1 for day), reminder time picker, light chips (optional), notes, photo (camera or gallery via `expo-image-picker`; JPEG/PNG/WebP), Save. On save: signed out → `setPendingSave` and navigate to `Auth { mode: 'signUp', afterAuth: 'savePendingPlant' }`; `Auth` finishes the pending save after success (Task 4 screen gains this branch). Create → `createMyPlant` then `uploadPlantPhoto` when a photo was chosen; edit → `updateMyPlant` (+ photo when changed). Then `syncReminders(await listMyPlants())`, then the existing Confirmation screen (`Done` / `See my plants`).

- [ ] **Step 1: Write the failing tests:** create pre-fills frequency and light from the species; submitting with nickname `Pikachu` posts `{ catalogPlantId, nickname: 'Pikachu', frequency, reminderTime, timeZone }` with the device time zone, then uploads the photo when one was picked; a double tap on Save creates once (Review Focus); signed out → pending save stored and Auth opened, and after sign-up the plant is created exactly once and the pending save is cleared (Review Focus); edit pre-fills from the saved plant and sends only changed fields; picker permission denied or cancelled → saves without a photo and shows the permission message (Review Focus); per day forces times 1.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (`npx expo install expo-image-picker`; add its permission strings to `app.json`). **Step 4: Run** tests, lint, typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Add one plant form for create and edit, with photos"`)

### Task 8: My Plants from the API, offline cache and sync triggers

**Files:**
- Modify: `app/src/pages/MyPlants.tsx` (rewrite), `app/src/components/PlantCardSecondary.tsx` (photo via `expo-image` with `plantPhotoSource`, else illustration, else mascot; nickname over species name), `app/src/auth/AuthProvider.tsx` (sync on sign-in, on launch when signed in, and when the app returns to the foreground), locales
- Create: `app/src/plants/myPlantsCache.ts`, `app/src/plants/useMyPlants.ts`
- Test: `app/src/plants/useMyPlants.test.ts`, `app/src/pages/MyPlants.test.tsx`, `app/src/auth/AuthProvider.test.tsx` (extend)

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7.
- Produces: `useMyPlants(): { plants: UserPlant[]; offline: boolean; loading: boolean; refresh(): Promise<void>; remove(id: string): Promise<void> }` — fetches `listMyPlants`, writes `@plantcare:myPlantsCache`, falls back to the cache with `offline: true` on `ApiError.code === 'network'`; `remove` calls `deleteMyPlant` then `syncReminders` with the remaining plants (disabled while `offline`).
- Screen: signed out → message and Sign in button; signed in → next-watering summary (existing copy), list, offline notice ("Showing your last synced plants. Changes need a connection."), tap a card → `PlantForm { mode: 'edit' }`, swipe → remove with the existing confirm dialog. `syncReminders` warning: when `skipped > 0`, an alert explains that only 60 reminders fit on the phone.

- [ ] **Step 1: Write the failing tests:** online list renders nickname and species name and caches it; API unreachable → cached list with the offline notice and swipe-delete disabled (Review Focus); delete sends `DELETE` without `Content-Type`, removes the card and resyncs reminders; a plant with `hasPhoto` renders an image whose source carries the Authorization header and a cacheKey with `photoVersion`; signed out shows the Sign in prompt; AuthProvider runs `syncReminders` after sign-in and when AppState goes to `active` while signed in, and not while signed out; `skipped > 0` shows the 60-reminders alert.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** (`npx expo install expo-image`). **Step 4: Run** tests, lint, typecheck — Expected: PASS.
- [ ] **Step 5: Commit** (`"Load My Plants from the API with an offline cache and synced reminders"`)

### Task 9: Docs and end-to-end check

**Files:**
- Modify: root `README.md`, `app/README.md` (run the API instead of json-server; Google sign-in needs a development build), `.github/workflows/ci.yml` if Task 1's app steps need adjusting

- [ ] **Step 1:** Update the READMEs.
- [ ] **Step 2: Verify:** from a clean state run the API (`docker compose up -d db`, migrate, seed, `npm run dev -w @plantcare/api`) and the app web build (`npx expo start --web` in `app/`) and walk through, in English and then Portuguese: Welcome → name → catalog (search `orq`, filter Shade) → open a species → form → Save → sign up → Confirmation → My Plants shows the plant → edit nickname → delete. Record what was seen (web cannot schedule notifications or pick a camera photo; note those as manual checks for the phone). Expected: every step works; no console errors besides the known web notification warnings.
- [ ] **Step 3:** Push the branch and confirm CI is green (`gh run watch`).
- [ ] **Step 4: Commit** (`"Document running the app against the API"`)
