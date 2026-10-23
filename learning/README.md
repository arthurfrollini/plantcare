# Learning — PlantCare

Material de estudo do PlantCare: como o sistema funciona, por que ele é assim e o que vale saber de cor para apresentar o projeto.

## Por onde começar

1. [Arquitetura](Arquitetura.md): o mapa do sistema. Leia primeiro.
2. [ERD](ERD.md): as tabelas e como se ligam.
3. [Autenticação e sessão](Autenticacao-e-Sessao.md): login, tokens, refresh, troca de senha, exclusão de conta.
4. [Lembretes e agendamento](Lembretes-e-Agendamento.md): a parte mais "algorítmica" do app.
5. [App (Expo)](App-Expo.md): navegação, telas, componentes compartilhados, i18n.
6. [API (Fastify + Prisma)](API-Fastify-Prisma.md): rotas, validação, fotos, migrações.
7. [Testes, CI e qualidade](Testes-CI-e-Qualidade.md): como o projeto se protege de regressões.
8. [Processo de desenvolvimento](Processo-de-Desenvolvimento.md): spec, plano, subagentes, revisões.
9. [Apresentação](Apresentacao.md): roteiro de demo e perguntas prováveis com respostas.

## Em uma frase

Um app de celular que lembra você de regar suas plantas: o catálogo diz do que cada espécie precisa, você escolhe os dias e o horário, e o app agenda as notificações no próprio celular.

## Números para ter na ponta da língua

- Monorepo com 3 pacotes: `app` (Expo), `api` (Fastify) e `packages/shared` (regras e tipos usados pelos dois).
- Testes: app 254, API 155, shared 101 (outubro de 2026).
- 5 PRs mergeados, cada um com design, plano, revisão por tarefa e revisão final.
