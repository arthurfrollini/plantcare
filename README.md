# PlantCare

A mobile app that reminds you to water your plants, with a schedule that fits each species.

This is a monorepo with three packages:

- `app/`: the Expo (React Native) app
- `api/`: the Fastify API with a PostgreSQL database (accounts, plant catalog, your plants, photos)
- `packages/shared/`: types and schemas used by both

## Running it

Requires Node.js 22+ and Docker. Run `npm install` once at the repo root.

1. Start the API, see `api/README.md`. In short: copy `api/.env.example` to `api/.env`, run `docker compose up -d db` from the repo root, then `npm run db:migrate` and `npm run db:seed` in `api/`, and `npm run api` from the root. It listens on `http://localhost:3333`.
2. Start the app with `npm run app`, see `app/README.md`. Open it in Expo Go on a phone, or in a simulator.

## Checks

`npm run typecheck`, `npm run lint` and `npm test` run in every package. CI runs the same checks, plus the API tests against a PostgreSQL service.
