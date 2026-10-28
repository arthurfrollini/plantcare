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

### Sick-plant help

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

### Evals

A small set in the repo: about 10 identification photos of real plants (Arthur's own) with the expected scientific name, and about 6 check-up cases including 2 traps that invite harmful advice. A script runs them against the real model (about US$0.01 a run), off CI, and stores a baseline. It runs before changing prompts or the model.

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

- AI-created species have no catalog illustration; the catalog card shows the existing placeholder (my call).
- The API key defaults to the finwise key in `api/.env`; a separate key is a one-line change (my call).

## Left to the builder

- Exact prompts, the harmful-substance list, and the layout of the sheets inside the existing design language.
- Whether identification by name and by photo share one endpoint.

## Done when

- Both flows work on Arthur's phone through Expo Go against the local API.
- Unit and e2e tests cover the catalog-first path, duplicates, proposals, limits, the AI-off switch, the harm guard, `isPlant: false`, and healed/ask-again.
- The eval runs and its baseline is committed.
- The PlantCare README's "Next up" line is replaced by the shipped features.
