# Add with AI: step by step, with a reference photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Add with AI" tab shows search progress, opens a modal with a checked reference photo (beside the user's own photo after a photo identification), and adds the species with that same photo to the catalog, ending on a screen the notch can't cover.

**Architecture:** The API gains a per-proposal reference-photo search (Commons, then iNaturalist; Claude checks each candidate; 15 s budget) stored on the proposal and moved into the catalog on add. The app calls it between `identify` and the modal, shows progress steps, and passes the photo to a reworked Confirmation. Credits for CC BY / BY-SA photos show under the photo, on the plant screen, and in a new Photo credits list.

**Tech Stack:** Fastify 5 + zod type provider, Prisma 7 (Postgres), sharp, Vitest; Expo SDK 58 / RN 0.88, React Navigation, Jest 30 + Testing Library; zod schemas in `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-10-29-ai-add-flow-design.md` (mockup: `docs/superpowers/specs/2026-10-29-ai-add-flow-mockup/fluxo.html`)

## Global Constraints

- Node 22: `source ~/.nvm/nvm.sh && nvm use 22`. Root checks: `npm run typecheck && npm run lint && npm test` (3 old app lint warnings are expected).
- App formatting: `npx prettier --single-quote --print-width 100 --write <files>` (no prettier config in `app/`). API formatting runs through lint-staged.
- Accepted licences: CC0, public domain, CC BY, CC BY-SA, any version. Rejected: NC, ND, GFDL-only, unknown.
- Minimum short side 700 px, checked on the downloaded file. Stored as 800×800 WebP (quality 80), same crop as today.
- At most 2 Commons + 2 iNaturalist candidates, at most 4 Claude checks per proposal, stopping at the first approval. 15 s total budget on the server; the app waits 20 s.
- Checks count as `speciesPhoto` usage: the daily spend ceiling, not the per-user limits.
- The user's own photo never becomes a catalog photo. Nothing is saved before the add button.
- The API key stays in `api/.env`; never print it. Phone-only app: no web code.
- Copy: en + pt-BR, from the spec and mockup ("É essa! Adicionar ao jardim", "Não é essa planta", "✨ Nova no catálogo", "✨ Também entrou no catálogo", "Sem foto de referência", "Identificando sua planta…", "Achamos: {{name}}", "Buscando foto de referência", "Olhando a foto", "Procurando pelo nome", "{{name}} está no seu jardim", "Vamos te lembrar de regar. Os horários podem ser trocados no detalhe da planta.", "Tudo bem! Tente uma foto mais de perto, com a folha ou a flor bem visível, ou digite o nome se souber.", "Créditos das fotos", "recortada").
- Commit messages: imperative subject, blank line, body, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit or push only as the plan's steps say; no push.

## Review Focus

1. **Catalog hit whose image is an SVG illustration** (curated species): the reference slot must render the illustration through `SpeciesImage`, with no credit line, and Confirmation's circle must not try to load SVG in `expo-image`. Tests in Task 6 and Task 7.
2. **Two users add the same new species**: the second add finds the species already has an image. It must not overwrite it, and must still delete its own proposal's reference file. Test in Task 2.
3. **The reference call is fired twice for one proposal** (re-render, retry): one search, one set of checks, the same answer. Test in Task 2.
4. **Licence strings as Commons actually writes them**: "CC BY-SA 4.0", "CC-BY-SA-3.0", "CC BY 2.0", "Public domain", "CC0", "CC BY-NC-SA 4.0", "GFDL", "Attribution". Only the free ones pass. Table test in Task 1.
5. **iNaturalist name mismatch** (a genus result, a synonym, a different-case name): only an exact case-insensitive `name` match with `rank === 'species'` is used, otherwise no candidates. Test in Task 1.

---

### Task 1: Free-licence photo sources and the reference search

**Files:**
- Modify: `api/src/ai/commons.ts`
- Create: `api/src/ai/inaturalist.ts`, `api/src/ai/reference-photo.ts`
- Modify: `api/scripts/refetch-species-photo.ts` (follow the renames)
- Test: `api/src/ai/commons.test.ts`, `api/src/ai/inaturalist.test.ts` (new), `api/src/ai/reference-photo.test.ts` (new); fixture `api/src/ai/fixtures/inaturalist-taxa.json` and `inaturalist-taxon.json` (trimmed real responses for `Zantedeschia aethiopica`)

**Interfaces:**
- Produces:
  - `type SourcePhoto = { url: string; author: string; license: string; source: string }`. Renames `CommonsPhoto`; same fields.
  - `isFreeLicense(license: string): boolean` (commons.ts).
  - `findCommonsPhotos(scientificName, fetchImpl?): Promise<SourcePhoto[] | null>`: up to 2; `null` when Commons failed (network, timeout, non-2xx, bad JSON), `[]` when it answered with none. Replaces `findPublicDomainPhotos`.
  - `findCommonsPhotoByTitle(title, fetchImpl?): Promise<SourcePhoto | null>`. Renames `findPublicDomainPhotoByTitle`.
  - `findINaturalistPhotos(scientificName, fetchImpl?): Promise<SourcePhoto[] | null>` (inaturalist.ts): up to 2, same null/[] meaning.
  - `downloadPhoto(photo: SourcePhoto, fetchImpl?): Promise<Buffer | null>`: unchanged, plus returns null when the decoded short side is under 700 (use `sharp(buf).metadata()`: the smaller of width and height).
  - `type ReferenceSearch = { status: 'found'; photo: SourcePhoto; webp: Buffer } | { status: 'notFound' } | { status: 'unavailable' }`.
  - `findReferencePhoto(options: { scientificName: string; check: CheckSpeciesPhoto; fetchImpl?: typeof fetch; deadlineMs?: number /* default 15_000 */; log?: (message: string, error?: unknown) => void }): Promise<ReferenceSearch>` (reference-photo.ts). Never throws.
  - `toSpeciesWebp(original: Buffer): Promise<Buffer>`: the 800×800 cover crop, exported from commons.ts and used by `storeSpeciesPhoto`.
  - `storeSpeciesPhoto(prisma, storage, plantId, photo: SourcePhoto, webp: Buffer)`: now takes the already-cropped WebP.
  - `attachSpeciesPhoto(...)`: same options as today. Now implemented as `findReferencePhoto` + `storeSpeciesPhoto` when `found`.

- [ ] **Step 1: Write the failing tests**

  `commons.test.ts`:
  - `it.each` on `isFreeLicense`: true for `CC0`, `CC0 1.0`, `Public domain`, `PD-self`, `CC BY 2.0`, `CC BY-SA 4.0`, `CC-BY-SA-3.0`, `CC BY-SA 3.0 de`. False for `CC BY-NC-SA 4.0`, `CC BY-ND 4.0`, `GFDL`, `Attribution`, `''`.
  - `findCommonsPhotos` keeps a CC BY-SA file. It returns 2 at most. It returns `null` on a 500 and on a rejected fetch, and `[]` on a search with no pages.
  - The existing size filter now passes a 750 px short side.

  `inaturalist.test.ts` (fake fetch serving the fixtures by URL):
  - It returns the free-licence `taxon_photos` in order, at most 2. Each `url` has `square` swapped for `original`, the credit author comes from `attribution` (e.g. `(c) Jane Doe, some rights reserved (CC BY)` → `Jane Doe`), the licence is `CC BY` / `CC BY-SA` / `CC0`, and the source is `https://www.inaturalist.org/photos/<id>`.
  - It skips `cc-by-nc`, `cc-by-nc-sa` and `null` licences.
  - It returns `[]` when the taxa search has no result whose `name` equals the scientific name (case-insensitive) with `rank` `species`.
  - It returns `null` on a 500 or a timeout.
  - It sends a `user-agent` header.

  `reference-photo.test.ts`:
  - Commons rejected twice, then iNat approved → `found` with the iNat photo; the check was called 3 times.
  - Every candidate rejected → `notFound`, with the check called 4 times at most.
  - Commons `null` and iNat `null` → `unavailable`.
  - Commons `[]` and iNat `null`, with no candidate checked → `unavailable`.
  - Commons `[]` and iNat `[]` → `notFound`.
  - A download under 700 px is skipped without a check.
  - With `deadlineMs: 100` and a check that never resolves → returns within ~200 ms, as `notFound` if a candidate was checked, else `unavailable`.
  - A check that rejects counts as a no.

- [ ] **Step 2: Run them and watch them fail**

  Run: `npm test -w @plantcare/api -- src/ai/commons.test.ts src/ai/inaturalist.test.ts src/ai/reference-photo.test.ts`
  Expected: FAIL (missing exports / modules).

- [ ] **Step 3: Implement**

  - **inaturalist.ts:**
    - `GET https://api.inaturalist.org/v1/taxa?q=<name>&rank=species&per_page=5`, then `GET https://api.inaturalist.org/v1/taxa/<id>`.
    - Both use the Commons `USER_AGENT` and `AbortSignal.timeout(5000)`.
    - Parse with zod; unknown fields are allowed.
    - Licence map: `cc0`→`CC0`, `cc-by`→`CC BY`, `cc-by-sa`→`CC BY-SA`; anything else is skipped.
  - **reference-photo.ts:** walk the Commons candidates, then the iNat ones, under one `AbortSignal.timeout(deadlineMs)`. Race each download and check against that signal.
  - **Outage vs no photo:** `unavailable` only when no candidate reached a check and at least one source returned `null`.

- [ ] **Step 4: Run them and watch them pass, then the API suite**

  Run: `npm test -w @plantcare/api`
  Expected: all pass. Existing `identify-routes.test.ts` add-photo tests still pass through `attachSpeciesPhoto`.

- [ ] **Step 5: Commit** — "Find reference photos on Commons and iNaturalist under free licences"

### Task 2: Reference photo on the proposal

**Files:**
- Modify: `api/prisma/schema.prisma` + new migration `api/prisma/migrations/<timestamp>_proposal_reference_photo/`
- Modify: `api/src/ai/identify-routes.ts`, `api/src/app.ts`, `api/src/me/account-routes.ts`
- Modify: `packages/shared/src/schemas.ts` (+ export from the package index if schemas are re-exported there)
- Test: `api/src/ai/identify-routes.test.ts`, `api/src/me/account-routes.test.ts`, `packages/shared` schema test file

**Interfaces:**
- Consumes (Task 1): `findReferencePhoto`, `storeSpeciesPhoto`, `SourcePhoto`.
- Produces:
  - **Prisma, `AiProposal`:**
    - `referenceStatus String @default("none")`, one of `none` | `found` | `notFound`;
    - `referenceKey String?`, `referenceAuthor String?`, `referenceLicense String?`, `referenceSource String?`.
  - **Shared:** `referencePhotoResponseSchema = z.object({ photo: z.object({ url: z.string(), credit: imageCreditSchema }).nullable() })`, `type ReferencePhotoResponse`.
  - **`POST /ai/proposals/:id/reference-photo`** (authenticate, `rateLimit`):
    - 200 `ReferencePhotoResponse`, with `url` = `/ai/proposals/<id>/reference-photo/image`;
    - 404 `proposal_not_found` (other user or unknown), 409 `proposal_used`, 410 `proposal_expired`.
  - **`GET /ai/proposals/:id/reference-photo/image`** (authenticate, owner only): `image/webp`, 404 when there is no file.
  - **`identifyRoutes`:** its 3rd parameter becomes an object, `photos: { attach: AttachSpeciesPhoto; findReference: (scientificName: string, userId: string) => Promise<ReferenceSearch> }`.
  - **`BuildAppOptions`** gains `referenceDeadlineMs?: number`, defaulting to 15 000.
  - **`app.ts`** wires `findReference` through `findReferencePhoto` with `speciesPhotoCheck` and `commonsFetch`. The same fetch is used for iNaturalist.

- [ ] **Step 1: Write the failing tests** (`identify-routes.test.ts`, with a fake fetch serving Commons, iNat and photos)
  - `reference-photo` on a fresh proposal:
    - returns `{ photo: { url, credit } }` and the image route serves WebP 800×800;
    - usage shows `speciesPhoto` and `/ai/status` still says `identifyLeft: 9`.
  - Calling it again returns the same body without new checks or fetches (`ai.calls` length unchanged).
  - Two concurrent calls → one search: the check is called once and both bodies are equal.
  - Every candidate rejected → `{ photo: null }`; a second call returns `null` without searching.
  - Both sources fail → `{ photo: null }` and the status stays `none`. A later call searches again.
  - Other user's proposal → 404. Used → 409. Expired → 410.
  - **Add after `found`:** the species gets `species/<id>.webp` with the bytes of the reference file and its credit; the reference file is removed; no new search runs.
  - **Add after `notFound`:** the species has `imageKey` null, and no search runs.
  - **Add with status `none`:** today's attach-with-wait runs (the existing tests cover this path; keep them).
  - **Second user, same species:** user B's proposal for a species that user A already added with a photo. B's add leaves A's image untouched and removes B's reference file.
  - **Cleanup:** `clearExpiredProposals` removes `referenceKey` files.
  - `account-routes.test.ts`: deleting the account removes a proposal's reference file.

- [ ] **Step 2: Run them and watch them fail**

  Run: `npm test -w @plantcare/api -- src/ai/identify-routes.test.ts src/me/account-routes.test.ts`
  Expected: FAIL (404 on the new routes, missing columns).

- [ ] **Step 3: Implement**
  - Migration: `npm run db:migrate -w @plantcare/api -- --name proposal_reference_photo`.
  - **Single flight:** an in-process `Map<proposalId, Promise<ReferencePhotoResponse>>` inside `identifyRoutes`.
  - **On `found`:** store at `proposals/<id>-ref.webp` and set the columns. On `notFound`, set the status. On `unavailable`, write nothing.
  - **In the add route,** after `createAiSpecies`:
    - if `species.imageKey` is null and `referenceStatus === 'found'`, read the file and `storeSpeciesPhoto` it;
    - if `referenceStatus === 'none'`, run today's race with `attach`;
    - always remove `referenceKey` afterwards.

- [ ] **Step 4: Run the API and shared suites**

  Run: `npm test -w @plantcare/api && npm test -w @plantcare/shared && npm run typecheck`
  Expected: all pass.

- [ ] **Step 5: Commit** — "Search a reference photo per proposal and carry it into the catalog"

### Task 3: Photo credits list

**Files:**
- Modify: `api/src/plants/routes.ts`, `api/src/plants/service.ts`, `packages/shared/src/schemas.ts`
- Test: `api/src/plants/routes.test.ts`

**Interfaces:**
- Produces:
  - **Shared:** `photoCreditSchema = z.object({ id: z.string(), name: z.string(), scientificName: z.string(), imageUrl: z.string(), credit: imageCreditSchema })`, and `type PhotoCredit`.
  - **`GET /plants/credits`:** public, `Accept-Language` aware. Returns `PhotoCredit[]` for every species with a stored photo and a credit, sorted by `name` in that locale. It is registered before `/plants/:id`.

- [ ] **Step 1: Failing test** — two species, one with credit columns and one without: the list has one entry, with the versioned `imageUrl` and the credit; the name is in pt-BR when asked.
- [ ] **Step 2: Run it** — `npm test -w @plantcare/api -- src/plants/routes.test.ts`. Expected: FAIL (404 or schema).
- [ ] **Step 3: Implement** with `speciesImageUrl` / `speciesImageCredit` / `pickTranslation`.
- [ ] **Step 4: Run** — `npm test -w @plantcare/api`. Expected: pass.
- [ ] **Step 5: Commit** — "List the catalog's photo credits"

### Task 4: Eval cases for iNaturalist photos

**Files:**
- Modify: `api/evals/plant-ai/cases.json`, `api/evals/plant-ai/baseline.json`
- Add: two photos under `api/evals/plant-ai/photos/`

- [ ] **Step 1:** Pick two CC0, CC BY or CC BY-SA photos from iNaturalist, with their credit in `cases.json` like the existing ones:
  - `inat-<species>-whole-plant`: a field shot of a whole plant, `expect: suitable`;
  - `inat-<species>-fruit-only`: a close-up of only the fruit or seeds of the named species, `expect: unsuitable`.
- [ ] **Step 2:** Run `npm run eval:ai -w @plantcare/api -- --only species-photo` (real model, ~US$0.002). Expected: 10/10. If either fails, show Arthur the model's reason before changing the prompt.
- [ ] **Step 3:** Run the full eval with `--update-baseline`. Expected: identify ≥ 9/10, check-up 6/6, species photo 10/10.
- [ ] **Step 4: Commit** — "Add iNaturalist photos to the species photo eval"

### Task 5: App API calls and the credit line

**Files:**
- Modify: `app/src/api/endpoints.ts`, `app/src/api/endpoints.test.ts`
- Create: `app/src/components/CreditLine.tsx`, `app/src/components/CreditLine.test.tsx`

**Interfaces:**
- Consumes (Tasks 2–3): `referencePhotoResponseSchema`, `photoCreditSchema`.
- Produces:
  - `findReferencePhoto(proposalId: string): Promise<ReferencePhotoResponse>`: axios `timeout: 20000`.
  - `referencePhotoSource(url: string, accessToken: string): { uri; headers; cacheKey }`: `cacheKey` is the url.
  - `listPhotoCredits(): Promise<PhotoCredit[]>`.
  - `CreditLine({ credit, style? }: { credit: ImageCredit; style?: StyleProp<TextStyle> })`: renders `Foto: <author> · <license>`, adding ` (recortada)` / ` (cropped)` when the licence starts with `CC BY`. A tap opens `credit.source` with `Linking.openURL`. `accessibilityRole="link"`.

- [ ] **Step 1: Failing tests** — the endpoints parse the responses (axios-mock-adapter, as in the existing file) and use the 20 s timeout. `CreditLine`: a CC BY-SA credit reads `Photo: Jane Doe · CC BY-SA 4.0 (cropped)`; a public-domain one has no suffix; a press calls `Linking.openURL` with the source.
- [ ] **Step 2: Run** — `npm test -w @plantcare/app -- endpoints CreditLine`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the copy keys `credit.photo`, `credit.cropped` in en and pt-BR.
- [ ] **Step 4: Run** — same command. Expected: PASS.
- [ ] **Step 5: Commit** — "Call the reference photo and credits routes from the app"

### Task 6: The preview modal compares photos

**Files:**
- Modify: `app/src/components/SpeciesPreviewSheet.tsx`, `app/src/i18n/locales/en.ts`, `app/src/i18n/locales/pt-BR.ts`
- Test: `app/src/components/SpeciesPreviewSheet.test.tsx` (new; today the sheet is only tested through `AiIdentify.test.tsx`)

**Interfaces:**
- Consumes (Task 5): `CreditLine`.
- Produces:
  - `SpeciesPreview` gains:
    - `reference: { kind: 'photo'; source: ImageSource; credit: ImageCredit | null } | { kind: 'illustration'; url: string } | null`;
    - `ownPhoto: string | null`, a local uri.
  - `previewFromResult(result, language, extras: { reference: SpeciesPreview['reference']; ownPhoto: string | null })`.
  - `SpeciesPreviewSheetProps`: `{ species; adding; onAdd; onNotThis: () => void; onClose: () => void }`. `onNotThis` replaces "Not now".

- [ ] **Step 1: Failing tests**
  - With `ownPhoto` and a photo reference: both images render, captioned "Your photo" / "Reference", with the credit line under the reference.
  - Without `ownPhoto`: one full-width reference, no captions.
  - `reference: null`: a placeholder with the text "No reference photo".
  - Illustration reference (a catalog hit with SVG): `SpeciesImage` renders `plant-illustration` and there is no credit line.
  - The badge reads "✨ New to the catalog" for a proposal and "From the catalog" for a hit.
  - "That's it! Add to my garden" calls `onAdd`; "That's not it" calls `onNotThis`; ✕ calls `onClose`.
  - While `adding`, all three are disabled and there is no "Not now" text.
- [ ] **Step 2: Run** — `npm test -w @plantcare/app -- SpeciesPreviewSheet`. Expected: FAIL.
- [ ] **Step 3: Implement** to the mockup (photo row ~104 px tall with two photos, ~140 px with one; radius 12). Format with prettier.
- [ ] **Step 4: Run** — same. Expected: PASS.
- [ ] **Step 5: Commit** — "Show the reference photo in the species preview"

### Task 7: Progress steps, the reference call, and the new end screen

**Files:**
- Modify: `app/src/components/AiIdentify.tsx`, `app/src/pages/Confirmation.tsx`, locales
- Create: `app/src/components/IdentifyProgress.tsx`
- Test: `app/src/components/AiIdentify.test.tsx`, `app/src/pages/Confirmation.test.tsx`, `app/src/routes/navigation.test.tsx`

**Interfaces:**
- Consumes: Tasks 5–6.
- Produces:
  - `IdentifyProgress({ photoUri: string | null; steps: { label: string; done: boolean }[] })`: the ringed circle (the photo, or a search icon), the title "Identifying your plant…", and the step list with ✓ or a spinner.
  - `ConfirmationParams` loses `toast` and gains:
    - `photo?: { uri: string; headers?: Record<string, string> }`;
    - `badge?: string`.
  - When `photo` is set, the circle replaces the emoji.

- [ ] **Step 1: Failing tests**

  `AiIdentify.test.tsx`:
  - Name → proposal:
    - the progress shows "Looking up the name" ✓, "Found: ZZ plant" ✓ and "Finding a reference photo";
    - then the modal opens with the reference image (source uri ends with `/reference-photo/image`);
    - `findReferencePhoto` was called with the proposal id.
  - Photo → catalog hit: no `findReferencePhoto` call; the modal shows the user's photo and the catalog image.
  - The reference call rejects (network) → the modal opens with "No reference photo"; the add still calls `addProposal`.
  - "That's not it" → the modal closes, the hint text shows, and the typed name is still in the field.
  - ✕ → closes with no message.
  - Add for a proposal → `Confirmation` with:
    - `title` "ZZ plant is in your garden" and `badge` "✨ Also joined the catalog";
    - `photo.uri` = the user's local uri (photo path) or `assetUrl(addResponse.imageUrl)` (name path);
    - no `toast`.
  - Add for a catalog hit → no `badge`.

  `Confirmation.test.tsx`:
  - With `photo` and `badge`: the photo image and the badge render, and no emoji.
  - Without them: the emoji, as today.
  - Nothing is absolutely positioned at the top: there is no `toastArea`.

  `navigation.test.tsx`: the existing AI test mocks `POST /ai/proposals/pr1/reference-photo` → `{ photo: null }` and asserts "ZZ plant is in your garden" and "✨ Also joined the catalog", then "See my plants" → garden.

- [ ] **Step 2: Run** — `npm test -w @plantcare/app -- AiIdentify Confirmation navigation`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - `AiIdentify` holds a `phase` of `'input' | 'searching'`. While searching it renders `IdentifyProgress` in place of the input content.
  - A catalog hit with an image whose URL is not an SVG uses `{ kind: 'photo', source: { uri: assetUrl(url) }, credit: plant.imageCredit }`. An SVG uses `{ kind: 'illustration', url }`.
  - On "That's not it", set the message `'notThis'`.
  - Remove the `toast` code and its style from Confirmation.
- [ ] **Step 4: Run** — `npm test -w @plantcare/app`. Expected: PASS.
- [ ] **Step 5: Commit** — "Walk the AI add through progress, comparison and a notch-safe end screen"

### Task 8: Credits on the plant screen and in Profile

**Files:**
- Modify: `app/src/pages/PlantDetail.tsx`, `app/src/pages/Profile.tsx`, `app/src/routes/stack.routes.tsx`, locales
- Create: `app/src/pages/PhotoCredits.tsx`, `app/src/pages/PhotoCredits.test.tsx`
- Test: `app/src/pages/PlantDetail.test.tsx`, `app/src/pages/Profile.test.tsx`, `app/src/routes/navigation.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`listPhotoCredits`, `CreditLine`).
- Produces:
  - `RootStackParamList.PhotoCredits: undefined`.
  - `PhotoCredits` screen: a back header like PlantDetail's; a list of 48 px `SpeciesImage` + name + `CreditLine`; loading and error states as on other screens.

- [ ] **Step 1: Failing tests**
  - PlantDetail:
    - species photo shown with `imageCredit` set → the credit line is visible;
    - the user's own photo shown → no credit line;
    - an illustration → no credit line.
  - Profile: a "Photo credits" row is shown signed in and signed out, and opens `PhotoCredits`.
  - PhotoCredits: renders the mocked list; a failed load shows the retry message.
  - navigation.test: Profile → Photo credits → Back.
- [ ] **Step 2: Run** — `npm test -w @plantcare/app -- PlantDetail Profile PhotoCredits navigation`. Expected: FAIL.
- [ ] **Step 3: Implement.** Format with prettier.
- [ ] **Step 4: Run** — `npm run typecheck && npm run lint && npm test` at the root. Expected: green, with the 3 old warnings only.
- [ ] **Step 5: Commit** — "Credit species photos on the plant screen and in Profile"

### Task 9: Live checks

No code commit unless a check finds a bug. A bug found gets its own failing test first.

- [ ] **Step 1:** Restart the API (touch `api/src/server.ts`) and run the migration on the dev DB.
- [ ] **Step 2:** Extend the scratchpad `e2e/flows.mjs`:
  - name → new species → `POST reference-photo`. Assert the photo is non-null or the status is explained, and log the source (Commons or iNat) and the credit.
  - The second call is identical.
  - Add, then compare `GET /plants/:id/image` bytes with the reference image bytes fetched before the add. They must be equal.
  - `GET /plants/credits` includes the species.
  - Throwaway user; delete it and the created species afterwards.

  Expected: all PASS.
- [ ] **Step 3:** In the iOS simulator (Expo Go, notch device), screenshot:
  - the progress view;
  - the modal with two photos;
  - the modal with a single photo;
  - the end screen.
  
  Check the end screen has nothing under the notch and the credit line is legible.
- [ ] **Step 4:** Ask Arthur to test on his phone: one name and one photo identification of a species not in the catalog.
