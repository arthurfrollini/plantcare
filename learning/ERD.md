# ERD — PlantCare

Banco PostgreSQL 17 (container `plantcare-pg`, porta 5433), modelado com Prisma 7.

```
User
├── id                PK  cuid
├── name                  string (1–60)
├── email                 string? único, minúsculo
├── passwordHash          string? (bcrypt; null em conta só Google)
├── googleId              string? único
├── language              "en" | "pt-BR"
├── avatarPath            string? (chave no storage)
├── avatarUpdatedAt       DateTime? (vira avatarVersion na API)
│
├──1:N── RefreshToken
│        ├── tokenHash     único (sha-256 do token; o token em si nunca é salvo)
│        └── expiresAt     30 dias
│
└──1:N── UserPlant
         ├── catalogPlantId  FK ──────────▶ Plant
         ├── wateringDays    int[]  dias ISO (1 = segunda … 7 = domingo)
         ├── reminderTime    "HH:mm" (escrita só em :00 ou :30)
         ├── reminderLeadMinutes  5..30 (padrão 15)
         ├── scheduleStartsOn     Date? âncora das plantas quinzenais/mensais
         ├── timeZone        IANA (ex.: America/Sao_Paulo)
         ├── photoPath / photoUpdatedAt
         └── nickname, notes  (ainda no banco, fora do app)

Plant (catálogo)
├── slug, scientificName (único)
├── source            curated | ai
├── light             full_sun | partial_shade | shade
├── difficulty        easy | medium | hard
├── frequencyTimes / frequencyPer   day | week | twoWeeks | month
├──1:N── PlantTranslation   (locale, name, about, waterTips)
└──1:N── PlantAlias         (nomes populares, para a busca)
```

## Pontos para lembrar

- **Apagar um `User` apaga em cascata** os `RefreshToken` e `UserPlant`. Os arquivos de foto não estão no banco, então a rota `DELETE /me` junta as chaves antes de apagar e remove os arquivos depois.
- **A planta do usuário não guarda mais frequência nem luz.** Isso saiu numa migração: os valores vêm sempre da espécie. Se a espécie mudar de frequência e os dias guardados não baterem mais, a API devolve `scheduleNeedsReview: true` e o app pede para escolher os dias de novo.
- **Busca sem acento.** A busca do catálogo normaliza o texto (NFD, remove acentos, minúsculas) e procura em nome, nome científico e apelidos populares.
