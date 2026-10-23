# Processo de desenvolvimento — PlantCare

Todo trabalho maior seguiu o mesmo caminho, com Claude Code e o conjunto de skills "superpowers".

## 1. Conversa e design

Uma conversa curta para entender o que se quer e por quê, terminando num documento em `docs/superpowers/specs/`: objetivos, o que fica de fora, o que seria um fracasso mesmo funcionando ("anti-goals"), e as decisões tomadas por mim marcadas como tal.

## 2. Plano

Um plano em `docs/superpowers/plans/`, dividido em tarefas pequenas. Cada tarefa diz os arquivos, as interfaces exatas que as próximas vão usar, os testes com os valores da spec, e os comandos de verificação. O plano também lista os 5 casos de uso mais prováveis de quebrar ("Review Focus"), cada um com teste.

## 3. Execução com subagentes

- Um agente novo implementa cada tarefa, com TDD, e comita.
- Outro agente revisa (bate com a spec? está bem feito?). Problemas importantes voltam para o implementador, até 5 rodadas.
- No fim, uma revisão do branch inteiro com o modelo mais forte, uma rodada de correções e uma última checagem.
- Um registro (ledger) guarda cada decisão tomada no caminho, com o custo se ela estiver errada.

## 4. Merge

PR com descrição do que mudou e do que ainda falta testar no celular, CI verde no Linux, merge.

## Por que vale contar isso

- Mostra método: nada foi construído sem uma descrição aprovada antes.
- Os planos e specs ficam no repositório, então qualquer decisão pode ser rastreada até o motivo.
- O teste no celular entre as tarefas mudou o produto: a tela de detalhes ganhou o lápis para editar dias e perdeu o botão Salvar depois de um teste real de uso.
