# Arquitetura — PlantCare

## Visão geral

```
┌──────────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│  app/  (Expo, celular)   │ ───────────────────────▶ │  api/  (Fastify, Node)   │
│  React Native + TS       │ ◀─────────────────────── │  Prisma + PostgreSQL     │
│  notificações locais     │   tokens JWT + refresh   │  fotos em disco          │
└────────────┬─────────────┘                          └────────────┬─────────────┘
             │            importam o mesmo pacote                  │
             └──────────────▶  packages/shared  ◀──────────────────┘
                     zod schemas + regras de agendamento
```

- **Monorepo com npm workspaces.** Um `npm install` na raiz instala tudo. Cada pacote tem seus próprios testes, lint e typecheck, e o CI roda os três.
- **`packages/shared` é o contrato.** Os schemas zod descrevem o que a API recebe e devolve; o app valida as respostas com os mesmos schemas. As regras de rega (quantos dias cada frequência pede, dias padrão, quando disparar cada lembrete) também moram aqui, então API e app nunca discordam sobre a regra.
- **O app é só para celular** (iOS e Android). A versão web foi removida de propósito.

## Fluxo de dados típico: adicionar plantas

1. O usuário toca no `+`, abre o catálogo (`GET /plants`, com busca e filtros) e seleciona várias espécies.
2. Logado: o app manda um `POST /me/plants` por espécie (só o id do catálogo, horário padrão 08:00 e fuso). Não logado: guarda a seleção como "salvamento pendente" e pede cadastro; depois do cadastro, salva tudo.
3. O app relê a lista (`GET /me/plants`) e **reagenda todas as notificações locais** a partir dela.

## Onde cada responsabilidade mora

| Responsabilidade | Onde | Por quê |
|---|---|---|
| Fatos da espécie (luz, dificuldade, frequência) | API, tabela `Plant` | Uma fonte da verdade; a IA vai poder corrigir uma espécie para todos |
| Escolhas do usuário (dias, horário, aviso antes) | API, tabela `UserPlant` | Sincroniza entre aparelhos |
| Notificações | No celular (expo-notifications) | Funciona offline, sem servidor de push (passo 4 do roadmap) |
| Tokens | expo-secure-store (Keychain/Keystore) | Nunca em AsyncStorage |
| Cache da lista de plantas | AsyncStorage | Abrir o app offline mostra a última lista |

## Decisões importantes (e o porquê)

- **Conta só na hora de salvar.** Dá para explorar o catálogo sem cadastro; o atrito fica no momento em que a pessoa já quer algo.
- **Fotos privadas.** As fotos das plantas e o avatar são servidos só ao dono, com token, e o tipo é detectado pelos bytes (não pela extensão).
- **Espécie decide, usuário escolhe quando.** A frequência e a luz vêm da espécie; o usuário só escolhe dias, horário e antecedência do lembrete. Assim uma correção na espécie vale para todo mundo.
- **Salvar na hora em vez de botão Salvar** na tela de detalhes, depois de um teste no celular mostrar que o botão no rodapé era fácil de esquecer.

## Roadmap

1. Idiomas e Perfil (feito)
2. Backend e integração (feito)
3. IA: identificar planta por foto ou nome, diagnóstico "minha planta está doente"
4. Notificações enviadas pelo servidor
