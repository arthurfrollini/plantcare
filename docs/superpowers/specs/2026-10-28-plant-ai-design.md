# Plant AI: identification and sick-plant help

Date: 2026-10-28. Status: draft for Arthur's approval.

## Why

Two moments in PlantCare need knowledge the catalog can't hold. You own a plant and don't know what it is, so you can't add it. Or a plant looks wrong and you don't know why. Both are now one photo away. The portfolio case study already describes these features; this design makes them real.

## Who uses it

Arthur on his own phone, and maybe a few friends. The app won't go to the stores. Cost must stay close to zero.

## Goals

1. **Add with AI.** Type a name or take/pick a photo. The app shows the species it found (common name, scientific name, short description, watering, light, difficulty) and one button: **Add to my garden**.
2. **My plant is sick.** From a plant's screen, send a photo (required) and a short description (optional). Get back the likely problem, what to do in short steps, and when to worry. The advice stays on the plant's screen in the yellow box, with **Ask again** and **Mark as healed**, and earlier check-ups stay in a history.

## Non-goals

- Chat or follow-up questions with the model.
- Store publication, payments, or limits designed for strangers.
- Moderating the shared catalog beyond the duplicate check below.

## Anti-goals

- Advice that harms a plant (salt in the soil, bleach, vinegar, sugar water and the like) reaching the screen.
- The API key in the app bundle.
- A species saved to the catalog without the user confirming it.
- A diagnosis invented for a photo that isn't a plant.

## Decisions Arthur made

- Model: **Claude Haiku**, the cheapest Claude model that reads images (`claude-haiku-5-5`, US$0.10 in / US$0.50 out per million tokens; image input and structured outputs confirmed on the Models API). A call with a ~1024 px photo costs about US$0.0005.
- The model is called **only by the API**, never by the app.
- After identification, **Add to my garden** goes straight to the garden: no detour through the catalog screen.
- In "my plant is sick", the **photo is required and the description is optional**.
- The yellow advice box lives on the plant's screen with **Ask again** (or similar) and **Mark as healed**.
- Everything else was left to me ("veja o que achar melhor").

## How it works (my calls)

### Identification

- **Typed name:** the API looks in the catalog first (`toSearchName` over translations, aliases and scientific name). A hit returns that species and costs nothing. A miss asks the model with the text only.
- **Photo:** always goes to the model. The app shrinks it to 1024 px on the long side, JPEG quality 0.7 (`expo-image-manipulator`), before upload.
- **Model output** (structured output, validated with zod): `{ isPlant, confidence: 'high' | 'medium' | 'low', scientificName, names: { en, 'pt-BR' }, about: { en, 'pt-BR' }, waterTips: { en, 'pt-BR' }, light, difficulty, frequencyTimes, frequencyPer }`, with `light`, `difficulty` and the frequency fields restricted to the shared schema's values. `isPlant: false` ends the flow with "couldn't identify a plant".
- **Duplicates:** if the returned scientific name (normalized) is already in the catalog, the API answers with the existing species, not a new one.
- **Proposal held on the server:** a new species is stored as a pending proposal (expires after 24 h) and the app only gets its id. Confirming sends the id, so the app can't make up species data.
- **Add to my garden** (`POST /ai/proposals/:id/add`, or the existing add route for a catalog hit): creates the species with `source: ai` when it's new, then the user's plant with the species defaults (frequency, light, 08:00 reminder, as the catalog's multi-add does). The identification photo becomes the plant's photo.

### Symptom guide first, AI second (Arthur's decision, 2026-10-28)

**My plant is sick** opens a free, offline guide before any AI:

1. A short list of **symptoms** (the nine in the appendix).
2. Tapping one shows its **likely causes**, most common first. Each cause has **what to check** and **what to do**, in English and Brazilian Portuguese.
3. The guide is **personalized with the species data the app already has**: its light and watering needs, plus the user's own schedule. For example: "Your ZZ plant prefers partial shade and watering every 2 weeks; you water it twice a week, so start there."
4. At the bottom, a quieter **Still not sure? Ask AI for a closer look** opens the AI check-up. The symptom picked is pre-filled as the description.

The guide text is fixed, written and reviewed by hand, and lives in `packages/shared` as typed data, with no network and no cost. It only recommends water, light, airflow, pruning, mild soap and repotting, never chemicals. The appendix is the content to review. During implementation each cause is checked against RHS and university extension houseplant guides, and the pages used go in a comment next to the data.

The cost saving is small, because an AI check-up costs about US$0.0005. The real gains are instant answers, offline use, no photo needed, and advice that a person wrote.

### Sick-plant help (AI check-up)

- `POST /me/plants/:id/checkups` (multipart: photo, optional description). The model gets the photo, the species and the description.
- **Output** (structured, zod): `{ isPlant, matchesSpecies, problem, steps: string[] (1-5), whenToWorry, safe: boolean }`, in the app's language (`Accept-Language`).
- `isPlant: false` or `matchesSpecies: false` returns a clear message and saves nothing.
- **Harm guard:** the prompt limits advice to safe home care, and the API checks the text against a list of harmful substances and practices in English and Portuguese. A hit replaces the answer with a safe generic message and logs the case. Nothing harmful is saved.
- A check-up is stored with its photo, description, advice and date. The plant's newest open check-up feeds the yellow box. **Mark as healed** closes it. **Ask again** opens the same flow for a new check-up. **Past check-ups** lists the rest, newest first.

### Cost and limits

- Per user per day (UTC): **10 identifications and 5 check-ups**, counted in an `AiUsage` table. A catalog hit doesn't count.
- A global daily ceiling, `AI_DAILY_SPEND_LIMIT_USD` (default 0.50). `0` turns AI off, and the app then shows the buttons as unavailable.
- Every call records input/output tokens and cost.
- Identification runs with thinking off and low effort. Check-ups run adaptive at low effort. The eval below confirms both hold up.

### Real plant photos (Arthur's decision, 2026-10-28)

The catalog's SVG illustrations are replaced by real photos in the public domain, and species created by the AI follow the same rule.

- **Source:** Wikimedia Commons, **CC0 or public domain only**. CC BY and CC BY-SA images need attribution and are left out. Each photo is stored with its source URL, author and license (new `Plant` fields `imageSource`, `imageAuthor`, `imageLicense`), and the species screen shows a small credit line.
- **The 9 curated species:** picked by hand from Commons, cropped square, resized to 800 px, saved as WebP next to the current SVGs, and reviewed by Arthur on a contact sheet before the seed changes. A test of the Commons API (2026-10-28) found public-domain photos for 8 of the 9 species in the first 50 results. Hydrangea had none, and Peperomia and Phalaenopsis one each, so those need a wider search (common names, more pages).
- **AI-created species:** when you confirm a new species, the API searches Commons by scientific name, takes the first CC0/public-domain photo at least 800 px on its short side, crops and stores it the same way, and records the credit. If nothing qualifies, the species keeps the placeholder. The search runs after the user's plant is saved, so a slow Commons never blocks **Add to my garden**.
- Commons requests send a descriptive `User-Agent`, as its API policy asks.

### Evals

A small set in the repo: about 10 identification photos of real plants from Wikimedia Commons (CC0 or public domain, none of them the photos used in the catalog) with the expected scientific name, and about 6 check-up cases including 2 traps that invite harmful advice. A script runs them against the real model (about US$0.01 a run), off CI, and stores a baseline. It runs before changing prompts or the model.

## Data

- `AiProposal` (id, userId, payload JSON, photoPath, expiresAt).
- `Checkup` (id, userPlantId, photoPath, description?, problem, steps[], whenToWorry, status open|healed, createdAt, healedAt?).
- `AiUsage` (userId, day, kind, count, costUsd).
- Uses the existing `Plant.source = ai`, `PlantTranslation` and `PlantAlias`.

## App

- **Catalog → "Add with AI" tab** (today a placeholder): a name field, plus camera and gallery buttons. A loading state, then a preview sheet with the species and **Add to my garden**. Error states: not a plant, daily limit reached, AI off, network.
- **Plant screen:** the `SickPlantCard` button is enabled. A sheet takes the photo (required) and description (optional), then shows the result. The yellow box shows the open check-up with **Ask again** and **Mark as healed**, and **Past check-ups** collapses below it.
- All new text in English and Brazilian Portuguese.

## Constraints

- Follow the repo's patterns: Fastify routes with zod, Prisma migrations, Vitest (API) and Jest (app), CI green.
- The key lives in `api/.env` as `ANTHROPIC_API_KEY` (Arthur provides it; the finwise key works, or a separate one for separate spend tracking).
- Tests never call the real model: the model client sits behind an interface with a fake in tests.

## Calls made during the builder check

- The API key defaults to the finwise key in `api/.env`; a separate key is a one-line change (my call).

## Left to the builder

- Exact prompts, the harmful-substance list, and the layout of the sheets inside the existing design language.
- Whether identification by name and by photo share one endpoint.

## Done when

- Both flows work on Arthur's phone through Expo Go against the local API.
- Unit and e2e tests cover the catalog-first path, duplicates, proposals, limits, the AI-off switch, the harm guard, `isPlant: false`, and healed/ask-again.
- The eval runs and its baseline is committed.
- The PlantCare README's "Next up" line is replaced by the shipped features.

## Appendix: symptom guide content (for review)

Causes are listed most common first. "Check" is what to look at, "Do" is what to do. Species data (light, watering) is used where it says *species*.

### 1. Yellow leaves
- **Too much water** (the most common cause). Check: the soil is still wet days after watering, the pot has no drainage hole, or water sits in the saucer; lower leaves go yellow and soft. Do: let the top 2–3 cm of soil dry before watering again, empty the saucer, use a pot with a drainage hole.
- **Too little water.** Check: the soil is dry all the way down and pulls away from the pot; leaves are yellow and crisp. Do: water slowly until it runs out of the bottom, then follow the *species* schedule.
- **Too much direct sun.** Check: pale yellow or bleached patches on the leaves facing the window, on a *species* that prefers partial shade or shade. Do: move it to bright light without direct midday sun.
- **An old leaf finishing its life.** Check: only one or two of the lowest, oldest leaves turn yellow, and new growth looks healthy. Do: nothing; remove the leaf once it is fully yellow.
- **Hungry plant.** Check: new leaves come in pale overall, and the plant hasn't been fed in months during spring or summer. Do: feed a balanced houseplant fertilizer at half the label dose, only in spring and summer.

### 2. Brown tips or edges
- **Dry air.** Check: crisp brown tips, the plant sits near air conditioning, a heater or a draft. Do: move it away from the airflow; grouping plants together raises humidity around them.
- **Uneven watering.** Check: the soil swings between bone dry and soaked. Do: water deeply when the top 2–3 cm are dry, and keep a steady schedule.
- **Salt build-up from fertilizer.** Check: a white crust on the soil or the pot rim. Do: flush the pot with plenty of water a few times, letting it drain, and fertilize less often.

### 3. Spots on leaves
- **Sunburn.** Check: dry, pale or brown patches on the side facing the sun, appearing after a move to a sunnier spot. Do: move it out of direct midday sun; damaged patches won't recover, but new leaves will be fine.
- **Leaf spot disease.** Check: brown or black spots, often with a yellow ring, that grow or multiply. Do: cut off the affected leaves, water the soil and not the leaves, give it more airflow, and keep it away from other plants for a while.

### 4. Holes or chewed leaves
- **Natural shape.** Check: some species have splits or holes that are part of the leaf, like the lobed leaves of the imbé. Do: nothing.
- **Chewing pests: caterpillars, snails or slugs, beetles.** Mostly on balconies or near open windows. Check: the undersides of the leaves and the soil, also at night; slime trails mean snails or slugs. Do: remove them by hand and check again over the next days.
- **Physical damage.** Check: clean tears where the plant gets bumped or brushed. Do: move it out of the way; trim the leaf if it bothers you.

### 5. Wilting or drooping
- **Dry soil.** Check: the soil is dry well below the surface. Do: water slowly until it drains; it should perk up within hours.
- **Rotting roots.** Check: the plant wilts even though the soil is wet; the soil smells bad, or the roots are brown and mushy instead of firm. Do: stop watering; if the roots are mushy, take the plant out, cut away the soft roots and repot in fresh, barely moist soil, in a pot with drainage.
- **Heat or a sudden change.** Check: it was moved recently or sits in a hot spot. Do: give it a stable spot away from heat and a few days to adjust.

### 6. White powder, mold or cotton
- **Powdery mildew.** Check: a white, dusty layer on the leaves that rubs off. Do: remove the worst leaves, improve airflow, avoid wetting the leaves.
- **Mold on the soil surface.** Check: white fuzz on top of the soil. Do: mostly harmless and a sign of soil staying wet; scrape it off and water less often.
- **Mealybugs.** Check: small white cottony clumps in the leaf joints or under the leaves. Do: wipe them off with a cotton swab dipped in water with a few drops of mild liquid soap, and repeat weekly until they are gone; keep the plant apart from the others meanwhile.

### 7. Leaves falling off
- **A recent change.** Check: it was moved, repotted or brought home in the last few weeks. Do: keep its spot, light and watering steady; some leaf drop while it adjusts is normal.
- **Watering problems.** Check: the soil is soaked or bone dry. Do: see **Yellow leaves** for too much or too little water.
- **Cold drafts.** Check: it sits near an open window on cold nights or under air conditioning. Do: move it out of the draft.

### 8. Long, stretched, pale growth
- **Not enough light.** Check: long gaps between leaves, the plant leaning toward the window, new leaves smaller and paler. Do: move it closer to a bright window, with indirect light for a *species* that prefers shade or partial shade, and turn the pot a quarter turn each week.

### 9. Tiny bugs
- **Fungus gnats.** Check: tiny dark flies around the soil, worse when the soil stays wet. Do: let the top of the soil dry out between waterings; yellow sticky traps catch the adults.
- **Aphids.** Check: clusters of small green, black or white insects on new growth, sometimes with sticky leaves. Do: rinse them off with a shower of water, then wipe with water and a few drops of mild liquid soap.
- **Spider mites.** Check: fine webbing and tiny speckles on the leaves, often in dry air. Do: rinse the leaves top and bottom, wipe them, raise the humidity around the plant, and repeat weekly.
- **Scale insects.** Check: small brown bumps stuck to stems and leaves, often with sticky leaves. Do: scrape them off gently and wipe with water and a few drops of mild liquid soap.
