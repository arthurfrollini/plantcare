# PlantCare

A mobile app that reminds you to water your plants, with a schedule that fits each species.

## Layout

- `app/`: the Expo (React Native) app
- `api/`: the Fastify API
- `packages/shared/`: types and schemas shared by both

## Getting started

Requires Node.js 22+. Run `npm install` once at the repo root.

- App: `npm run app` (see `app/README.md`)
- API: `npm run api` (needs the Docker database, see `api/README.md`)
- Checks: `npm run typecheck`, `npm run lint`, `npm test`
