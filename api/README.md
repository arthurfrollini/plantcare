# PlantCare API

Fastify 5 + Prisma 7 + PostgreSQL 17. Types and schemas come from `@plantcare/shared`.

## Prerequisites

- Node.js 22+
- Docker

## Run it

From the repo root, install once with `npm install`, then:

```sh
cd api
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3333`. Health check: `/health`. Interactive docs: `http://localhost:3333/docs`.

## Tests

```sh
npm run db:test:prepare   # applies migrations to plantcare_test
npm test
```

Tests use `.env.test` and the `plantcare_test` database from the same Docker container (port 5433).
Other checks: `npm run typecheck`, `npm run lint`, `npm run format`.

## Layout

- `src/app.ts`: builds the Fastify app (plugins, docs, error handler); `src/server.ts` starts it
- `src/auth/`, `src/me/`, `src/plants/`, `src/user-plants/`: one folder per module (routes, service, tests)
- `src/env.ts`, `src/db.ts`, `src/errors.ts`, `src/i18n.ts`, `src/storage.ts`: config, Prisma client, error helpers, locale, photo storage
- `prisma/`: schema, migrations and seed
- `test/`: shared test helpers

## Errors

Every non-2xx response has the same shape:

```json
{ "error": { "code": "validation_error", "message": "..." } }
```
