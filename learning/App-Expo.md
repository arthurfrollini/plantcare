# App (Expo) — PlantCare

Expo SDK 57, React Native 0.86, React 19, TypeScript estrito, React Navigation 7. Roda no Expo Go durante o desenvolvimento.

## Navegação

```
Stack (raiz)
├── Welcome → UserIdentification → Confirmation   (primeira abertura)
├── PlantSelect  = abas
│   ├── Minhas plantas   (abre aqui)
│   ├── +                (botão; abre o Catálogo)
│   └── Perfil
├── Catalog        (abas no topo: Catálogo | Adicionar com IA)
├── PlantDetail    (detalhes e agendamento de uma planta)
├── Auth           (entrar / criar conta)
└── Confirmation
```

- A tela de boas-vindas pula o "Como podemos te chamar?" para quem já está logado ou já digitou o nome.
- Depois de criar a conta com plantas pendentes, a pilha é **resetada** para `[abas, Confirmation]`: voltar não cai no catálogo com a seleção antiga.

## Peças compartilhadas

- **`BottomSheet`:** a folha que sobe de baixo, com fundo escurecido (desfocado no iOS). Usada pelos filtros, dias de rega, horário, foto, lembrete, senha e exclusão de conta. No iOS sobe junto com o teclado.
- **`HeroHeader`:** faixa verde em degradê com o círculo da foto cortado ao meio. Usada pela tela da planta e pelo Perfil.
- **`Toast`:** o "Salvo ✓" que aparece e some.
- **`pickPhoto`:** pede permissão, abre câmera ou galeria e confere o tipo. No iPhone pede a versão "compatível", para fotos HEIC chegarem como JPEG.

## Estado e dados

- **`AuthProvider`:** status (`loading | signedIn | signedOut`), usuário e ações (entrar, sair, trocar nome, avatar, senha, excluir conta). Sincroniza os lembretes ao entrar, ao abrir e ao voltar do background.
- **Hooks por tela:** `useCatalog` (busca com debounce de 300 ms, descarta respostas antigas), `useMyPlants` (cache offline), `usePlantDetail` (fila de salvamentos: a última mudança de cada campo sempre vence e uma resposta antiga nunca sobrescreve uma nova).

## i18n

- i18next com `en` e `pt-BR`. O tipo das chaves vem do arquivo em inglês, então uma chave que não existe é erro de compilação, e as duas línguas precisam ter as mesmas chaves.
- O idioma do aparelho vale depois do login; o Perfil permite trocar.

## Performance

- Imagens com expo-image (cache em disco e memória, chave de cache com a versão da foto).
- Tree shaking em produção: medido em outubro de 2026, o bundle iOS cai de 6.580 KB para 5.272 KB (−20%) com `EXPO_UNSTABLE_TREE_SHAKING=1` e `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1`. Só vale para builds de produção, não para o Expo Go em desenvolvimento.
