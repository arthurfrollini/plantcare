# API (Fastify + Prisma) — PlantCare

Fastify 5, Prisma 7.10 com o adapter `pg`, zod 4 via `fastify-type-provider-zod`. Documentação interativa em `http://localhost:3333/docs` (OpenAPI + Scalar).

## Rotas

| Rota | O que faz |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout` | Sessão (ver Autenticação) |
| `GET /plants`, `GET /plants/:id` | Catálogo com busca, filtros de luz e dificuldade, paginação, idioma pelo `Accept-Language` |
| `GET/PATCH /me` | Nome e idioma |
| `POST/GET/DELETE /me/avatar` | Foto de perfil |
| `POST /me/password`, `DELETE /me` | Troca de senha e exclusão de conta |
| `GET/POST /me/plants`, `PATCH/DELETE /me/plants/:id` | Plantas do usuário |
| `POST/GET/DELETE /me/plants/:id/photo` | Foto da planta |

## Padrões

- **Validação nas duas pontas com o mesmo schema.** A rota declara `body`, `params` e `response` com zod; se a resposta não bater com o schema, a API falha em vez de vazar um campo errado.
- **Schemas estritos** em criar e editar planta: um campo desconhecido (por exemplo `frequency`) dá 400.
- **Erros com código estável:** `{ error: { code, message } }`, como `wrong_password`, `invalid_watering_days`, `user_plant_not_found`. O app decide a mensagem pelo código, não pelo texto.
- **Escopo por dono:** toda rota de `/me/plants` busca por `id` **e** `userId`; o id de outra pessoa dá 404, nunca os dados dela.

## Fotos

- Upload multipart com limite de 5 MB e tipo detectado pelos primeiros bytes (JPEG, PNG, WebP); o resto dá 415.
- Gravadas em disco (`PhotoStorage`). A chave é validada por regex, então nada escapa da pasta de uploads.
- Servidas só ao dono, com `X-Content-Type-Options: nosniff`. A versão (`photoVersion`, `avatarVersion`) vai na URL de cache do app para trocar a imagem quando a foto muda.

## Migrações

- `prisma migrate dev` precisa de terminal interativo quando a migração apaga colunas. Nos planos foi usado `prisma migrate diff` para gerar o SQL numa pasta de migração e `migrate deploy` para aplicar.
- Depois de puxar a `main`: `npm run db:migrate -w @plantcare/api`.
