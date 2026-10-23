# Testes, CI e qualidade — PlantCare

## Ferramentas

- **App:** Jest + React Native Testing Library + axios-mock-adapter.
- **API:** Vitest contra um PostgreSQL de verdade (banco de teste separado, recriado por `npm run db:test:prepare`).
- **Shared:** Vitest.
- **Tipos e lint:** TypeScript estrito com `noUncheckedIndexedAccess`; ESLint proíbe `any`, `as` (type assertion) e `!` (non-null) nos arquivos novos.
- **Pre-commit:** lint-staged roda o ESLint nos arquivos alterados.

## CI (GitHub Actions)

Em cada push e PR: `npm ci`, lint, typecheck, prettier em `api` e `packages`, testes dos três pacotes (API com um Postgres de serviço) e build.

## Lições que valem a pena contar

- **O CI é Linux e mais lento que o Mac.** Testes que esperam animações passavam aqui e estouravam o tempo lá. Para reproduzir: rodar a suíte num contêiner `node:22` com o repositório clonado e `npm ci`.
- **`toBeNull()` dentro de `waitFor` é caro.** Cada tentativa que falha imprime a árvore inteira de componentes, cerca de 1,2 s por tentativa. Esperar algo sumir com `.not.toBeOnTheScreen()` derrubou um teste de 3,4 s para 0,17 s.
- **TDD de verdade:** cada tarefa dos planos escreve o teste, vê falhar (RED), implementa e vê passar (GREEN), e o relatório guarda as duas saídas.
- **Testes que reproduzem o bug:** por exemplo, o da troca de senha simula 401 → refresh → repetição e confere que a repetição leva o token novo.

## Revisão de código

- Cada tarefa tem uma revisão de spec e de qualidade por um agente que não escreveu o código.
- No fim, uma revisão do branch inteiro procura problemas entre tarefas. Ela achou, por exemplo, a planta mensal sem âncora que lembraria toda semana, e o bug da troca de senha que deslogava o próprio celular.
