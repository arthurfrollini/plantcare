# Apresentação — PlantCare

## Roteiro de demo (5 minutos)

1. **Abrir o app** em Minhas plantas: a próxima rega no topo, a lista ordenada pela próxima rega.
2. **`+` → Catálogo:** buscar "sao jorge" sem acento (acha "Espada São Jorge"), abrir os filtros, selecionar três espécies, "Adicionar 3 plantas".
3. **Sem conta:** o app pede cadastro só agora e, depois, adiciona as três.
4. **Tela da planta:** degradê, os três quadros (dificuldade, luz, rega), o lápis dos dias com o contador "2 de 3", horário da rega, lembrete com o ⓘ explicando.
5. **Mostrar uma notificação** chegando com "Em 15 min você precisa regar: …".
6. **Perfil:** avatar, nome, trocar idioma ao vivo, alterar senha, excluir conta com "EXCLUIR".
7. **Código:** um plano em `docs/superpowers/plans/`, o `schedule.ts` compartilhado e um teste que reproduz um bug.

## Perguntas prováveis

**Por que notificações locais e não push do servidor?**
Funcionam offline e não precisam de infraestrutura de push. O custo: o celular precisa sincronizar para saber de mudanças. Push pelo servidor é o passo 4.

**Por que um pacote compartilhado?**
A mesma regra de rega valida na API e agenda no app. Antes, uma regra duplicada poderia aceitar dias na API que o app agendaria de outro jeito.

**Como vocês evitam deslogar o usuário à toa?**
Refresh único por vez, epoch de sessão, e só deslogar quando o servidor recusa o refresh (400/401), não em erro de rede.

**Como é a segurança das fotos?**
Privadas, servidas só ao dono, tipo detectado pelos bytes, chave validada contra path traversal, `nosniff`.

**O que acontece quando a IA corrigir uma espécie?**
Os fatos vêm sempre da espécie; se os dias guardados não batem mais, a API marca a planta para revisão e o app pede novos dias.

**O que você faria diferente?**
Ter definido a regra de agendamento antes da tela (ela mudou duas vezes) e testar no celular mais cedo.

**Qual o próximo passo?**
IA: identificar a planta por foto ou nome, com prévia antes de entrar no catálogo, e diagnóstico de planta doente com regras para não recomendar nada nocivo.
