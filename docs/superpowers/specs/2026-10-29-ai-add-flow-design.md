# Add with AI: step by step, with a reference photo

Date: 2026-10-29. Status: draft for Arthur's approval.

Mockup: `2026-10-29-ai-add-flow-mockup/fluxo.html` (open in a browser; pt-BR copy, photo identification path, option A chosen).

## Why

Arthur's phone test of "Add with AI" (2026-10-29): typing a name or picking a photo and seeing the modal works, but what comes after doesn't.

- The modal shows no photo. Text alone makes it hard to be sure the AI found the right plant, and a photo is what settles it.
- The species only joins the catalog through "Add to my garden". That part is right (a wrong identification must not reach the shared catalog), but nothing on screen makes it clear.
- The "joined the catalog" toast sits at the top of the Confirmation screen, 24 px from the edge, ignoring the safe area. The iPhone notch covers it.

## Goals

1. Identification takes clear steps: choose a name or photo, watch the search progress, compare photos in the modal, then confirm.
2. The modal shows the species' **reference photo**. When the user identified by their own photo, both photos sit side by side.
3. The reference photo shown in the modal is the one the catalog gets when the user adds the plant.
4. Reference photos come from free-licence sources, Wikimedia Commons then iNaturalist, so "no photo" becomes rare.
5. The end screen says the plant is in the garden and, for a new species, that it joined the catalog. Nothing hides under the notch.

## Non-goals

- Changing the input step (name field, Take photo, Choose photo). Arthur is happy with it.
- Changing the catalog tab's multi-select add, or its Confirmation screen.
- New AI limits, models or prompts for identification.
- Letting users pick between several reference photos.

## Anti-goals

- A species saved to the catalog without the user confirming it in the modal.
- A user's own photo becoming a catalog photo. Catalog images are served without login.
- A photo used without a licence that allows it: Google Images, NC and ND licences, or a missing credit.
- A spinner with no feedback for 5–8 s.

## Decisions Arthur made (2026-10-29)

- Nothing reaches the catalog or the garden until the user taps the add button in the modal.
- The modal shows the reference photo. After a photo identification it also shows the user's photo, side by side.
- **Catalog photo:** always the reference photo, never the user's.
- **Garden photo:** the user's own when they identified by photo. Otherwise the species image (the reference), as today.
- **Sources:** Commons first, then iNaturalist. Every candidate still goes through the Claude photo check.
- **Waiting (option A in the mockup):** the "searching" screen holds until both species and photo are ready, with steps ticking off. The modal then opens complete.
- **No reference photo approved:** the modal shows the placeholder with "No reference photo", and adding is still allowed. The species then joins the catalog without a photo, as it can today.
- **End screen:** the photo in a circle, "<name> is in your garden", and a fixed "✨ Also joined the catalog" badge for a new species. This replaces the toast.
- **"That's not it"** goes back to the input step with a hint. The ✕ only closes. Neither saves anything.

## My calls (Arthur saw these and agreed)

- **Licences:** CC0, public domain, CC BY and CC BY-SA, any version, from both sources. NC, ND, GFDL-only and unknown licences are rejected.
- **Credit:** author and licence in small text under the reference photo, in the modal, and on the plant screen whenever it shows the species image instead of the user's own photo. Tapping the credit opens the source page. For CC BY and CC BY-SA photos the line ends with "cropped", since we crop to a square. Grid and card thumbnails stay without a credit line. Instead, Profile gets a "Photo credits" row that opens a list of every catalog species with a photo credit: name, author, licence, and a link to the source.
- **Minimum size:** the short side drops from 800 px to 700 px, because many iNaturalist photos are 1000×750. Storage is unchanged: 800×800 WebP.

## How it works

### Flow (app)

1. **Input.** Unchanged.
2. **Searching.** The tab is replaced by a full progress view:
   - a photo identification shows the user's photo in a ringed circle; a name search shows a search icon;
   - a title "Identifying your plant…" with a list of steps:
     - "Looking at the photo" (or "Looking up the name") while `identify` runs;
     - "Found: <name>" ✓ once it answers;
     - for a new species only, "Finding a reference photo" while the reference-photo call runs, then ✓.
   - A catalog hit skips the third step: its image already exists.
   - A `none` answer or an error from `identify` goes back to the input with today's messages.
  - **Reference-photo call fails or takes longer than 20 s** (network, 5xx, 429): the modal opens anyway with "No reference photo". The identification already spent is kept. If the server stores a photo after the app gave up, the catalog gets it on add. That is a checked photo, so accepted.
3. **Modal** (`SpeciesPreviewSheet`).
   - **Photo row:** user photo + reference, captioned "Your photo" / "Reference", or the reference alone at full width.
   - **Credit line** under the reference.
   - **Badge:** "✨ New to the catalog" for a proposal, today's "From the catalog" for a hit.
   - **Species info:** name, scientific name, about, care tiles and watering tips, as today.
   - **Buttons:**
     - primary "That's it! Add to my garden";
     - text button "That's not it": closes the modal and shows the hint "No problem! Try a closer photo with the leaf or flower in view, or type the name if you know it." The typed name stays in the field;
     - ✕: closes with no message;
     - "Not now" goes away.
   - **No reference photo:** the reference slot shows the placeholder art and "No reference photo".
4. **Add.** Same calls as today: `createMyPlant` + upload for a hit, `addProposal` for a proposal. While adding, the buttons are disabled.
5. **End screen.** Confirmation gains two optional params:
   - `photo`: what to show in the circle. The user's local photo when there is one, otherwise the `imageUrl` from the add response. The proposal's reference file is gone by then, moved into the catalog. Omitted when neither exists.
   - `badge`: shown for a proposal.
   - Title: "<name> is in your garden". Subtitle: "We'll remind you to water. You can change the times on the plant's screen."
   - Button: "See my plants", as today.
   - The `toast` param and its top-pinned view are removed.

Copy in pt-BR mirrors the mockup: "É essa! Adicionar ao jardim", "Não é essa planta", "✨ Nova no catálogo", "✨ Também entrou no catálogo", "Sem foto de referência", "Identificando sua planta…", "Achamos: <nome>", "Buscando foto de referência".

### Reference photo (API)

- **New route `POST /ai/proposals/:id/reference-photo`** (auth, owner only, rate-limited like the other AI routes):
  - finds and checks a photo for the proposal's species, stores it with the proposal, and returns `{ photo: { url, credit } | null }`;
  - **idempotent:** once searched, it returns what was stored, including `null`, without searching again;
  - **errors:** an expired or used proposal returns today's 410/409/404 codes.
- **New route `GET /ai/proposals/:id/reference-photo/image`** (auth, owner only) serves the stored file. The app loads it with the auth header, like plant photos.
- **Storage:** `proposals/<id>-ref.webp`, already cropped to 800×800 WebP by the same code as species photos. `AiProposal` gains `referenceStatus` (`none` = not searched yet, `found`, `notFound`), plus the photo key and credit columns: author, licence, source page. Migration required.
- **Time budget:** the search stops at 15 s, including downloads and checks. Whatever was approved by then is stored, or nothing is.
- **Outages are not answers:** when every source failed (network errors, timeouts or 5xx) and no candidate was even checked, the status stays `none`. A later call, or the add fallback, can then try again. `notFound` means candidates were checked and none was approved, or no source had any candidate.
- **Search order:**
  - Commons first (category search, as today), then iNaturalist;
  - up to 2 candidates from each, in that order;
  - at most 4 Claude checks per proposal;
  - stop at the first approved photo.
  - Checks are recorded as `speciesPhoto` usage: they count toward the daily spend ceiling, not the per-user limits, as today.
- **iNaturalist:**
  - `GET https://api.inaturalist.org/v1/taxa?q=<scientific name>&rank=species`, taking the result whose `name` equals the scientific name exactly;
  - then `GET /v1/taxa/<id>` and its `taxon_photos[].photo`;
  - licence from `license_code`; size from `original_dimensions`;
  - **image:** the `original` variant (swap `square` for `original` in `url`). The 700 px minimum is checked on the downloaded file, for both sources;
  - **credit:** the author parsed from `attribution`, the licence, and `https://www.inaturalist.org/photos/<photo id>` as the source;
  - **request headers:** send a descriptive `User-Agent`;
  - **failures:** network errors and timeouts mean "no candidates", as with Commons.
- **Commons:**
  - the licence filter widens to CC BY and CC BY-SA (`isPublicDomain` becomes a free-licence check);
  - the minimum short side becomes 700 px.
- **Add route** (`/ai/proposals/:id/add`), when the species is new or has no image:
  - if the proposal has a stored reference photo, it is moved to `species/<id>.webp` with its credit;
  - if the proposal's status is `none` (an old app, a failed call, or an outage), today's attach-with-wait runs as a fallback;
  - if it was searched and found nothing, the species stays without a photo.
  - It never overwrites an existing species image.
- **Cleanup:** expired proposals drop their reference file with the user photo. Deleting an account drops both.

### Catalog hits

- A hit uses the catalog image as its reference, with its stored credit.
- A catalog species without an image shows "No reference photo". No search runs for it.

## Tests (Arthur's rule: test what the user sees)

- **API:**
  - reference-photo route: found, not found, idempotent, wrong owner, expired, an outage leaving the status `none`, the 15 s budget;
  - a route or field that lists catalog photo credits for the Photo credits screen;
  - iNaturalist parsing and licence filtering with a fake fetch;
  - Commons accepting CC BY-SA and rejecting NC;
  - add moving the stored photo into the catalog;
  - add falling back when the proposal was never searched;
  - cleanup removing the reference file.
- **App:** progress steps, both photo layouts, credit, placeholder, reference call failing → placeholder, "That's not it" hint, ✕, Confirmation photo + badge, the Photo credits list.
- **`navigation.test.tsx`:** the AI flow walks through to the new end screen and back to the garden.
- **Eval:** two `speciesPhoto` cases from free-licence iNaturalist photos. One is a field shot of the whole plant, which must pass. The other is a close-up of only the fruit or seeds of the named species, which must be rejected. Baseline updated.
- **Live:** the scratch e2e script calls reference-photo for a new species and checks that the catalog image after add is byte-identical to the one the modal served. Throwaway user and species deleted after.
- **On the iOS simulator:** a screenshot of the end screen and the modal at notch size.

## Calls made during the builder check (mine, for Arthur to check)

- The reference search has a 15 s budget. The app waits 20 s, then opens the modal with "No reference photo".
- An outage is not stored as "no photo", so the add can still try later.
- iNaturalist downloads the original image, and the 700 px minimum is checked on the downloaded file.
- Credits: tapping one opens the source; BY and BY-SA credits say "cropped"; Profile gets a "Photo credits" list for the photos in the grid and on the cards.
- The end screen uses the photo URL from the add response.
- Second eval case: a close-up of only fruit or seeds, which must be rejected.

## Left to the builder

- Layout details within the mockup: spacing, photo heights, animation of the step list.
- How the progress view replaces the tab content (state in `AiIdentify` or a child component).
- Exact iNaturalist response schema in zod, and how much of `attribution` to keep.

## Done when

- The mockup flow works on Arthur's phone for both a name and a photo identification.
- Adding a new species puts the same photo in the modal and in the catalog, and the garden has the user's own photo when there is one.
- Nothing about the add is hidden by the notch.
- `npm run typecheck && npm run lint && npm test` is green; the eval meets its baseline; the live e2e run passes.
