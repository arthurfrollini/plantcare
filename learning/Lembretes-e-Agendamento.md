# Lembretes e agendamento — PlantCare

As regras ficam em `packages/shared/src/schedule.ts`, usadas pela API (validação) e pelo app (notificações e "próxima rega").

## Frequências

| Frequência | Dias que o usuário escolhe | Como repete |
|---|---|---|
| Todo dia | nenhum | diário |
| N vezes por semana (1–7) | exatamente N | semanal, um gatilho por dia |
| A cada 2 semanas | 1 | a cada 14 dias a partir da âncora |
| Uma vez por mês | 1 | a cada 28 dias a partir da âncora (mensal = 4 semanas, sempre no mesmo dia da semana) |

Dias padrão: 1x segunda; 2x terça e quinta; 3x segunda, quinta e domingo; quinzenal e mensal, segunda.

## Do agendamento ao gatilho

1. **Dias efetivos:** os dias guardados, se a quantidade bater com a frequência; senão, os dias padrão.
2. **Horário do lembrete = horário da rega − antecedência** (5 a 30 min). Se passar da meia-noite, o lembrete cai no dia anterior (regar segunda 00:00 com 15 min de aviso → domingo 23:45).
3. **Tipos de gatilho do expo-notifications:**
   - diário (`DAILY`);
   - semanal (`WEEKLY`), que usa a convenção da Apple, 1 = domingo, enquanto os dados usam ISO, 1 = segunda. A conversão (`iso % 7 + 1`) acontece só aqui;
   - data (`DATE`) para quinzenal e mensal, porque gatilho semanal não sabe pular semanas. O app agenda as 3 próximas e completa a cada sincronização.
4. **Âncora** (`scheduleStartsOn`): a API calcula a próxima ocorrência do dia escolhido, no fuso da planta, sempre que os dias ou o horário mudam. Sem âncora, a conta usa uma segunda-feira fixa de referência (2024-01-01), para o ritmo não mudar a cada sincronização.

## Limites e cuidados

- O iOS guarda no máximo 64 notificações pendentes; o app agenda até 60 e avisa uma vez por sessão quando faltou espaço.
- A sincronização é **serializada** (uma fila de promessas): duas sincronizações ao mesmo tempo duplicariam notificações.
- Sincronizações em segundo plano (abrir o app, voltar do background) **nunca pedem permissão**; só ações do usuário (salvar) pedem.
- Texto do push: "Em 15 min você precisa regar: Monstera." O nome da espécie fica depois dos dois pontos para não errar o gênero ("sua cacto").

## Quando a espécie muda

Se a IA (passo 3) corrigir uma espécie de 2x para 3x por semana, os 2 dias guardados não servem mais. A API devolve `wateringDays: []` e `scheduleNeedsReview: true`; enquanto isso valem os dias padrão, e a tela de detalhes mostra "A rega dessa planta mudou. Toque no lápis para escolher 3 dias."
