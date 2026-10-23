# Autenticação e sessão — PlantCare

## Tokens

- **Access token:** JWT HS256, vale 15 minutos. Vai no header `Authorization: Bearer`.
- **Refresh token:** string aleatória que vale 30 dias. O banco guarda só o hash (sha-256), nunca o token.
- **Rotação:** cada `POST /auth/refresh` apaga o refresh usado e devolve um par novo, numa transação. Um token roubado e usado depois do dono fica inválido.
- **No celular:** os dois ficam no expo-secure-store (Keychain no iOS, Keystore no Android).

## O cliente HTTP (`app/src/api/client.ts`)

- axios com timeout de 15 s (60 s para upload de foto).
- Ao receber 401, faz **um único refresh por vez** (single-flight): se três requisições recebem 401 juntas, só uma chama `/auth/refresh` e as outras esperam o resultado. Sem isso, as três tentariam usar o mesmo refresh token e duas falhariam, deslogando a pessoa.
- **Epoch de sessão:** cada logout incrementa um contador. Uma resposta que chega depois do logout é descartada, em vez de "relogar" o usuário.
- Só desloga quando o refresh responde 400 ou 401. Erro de rede, 429 ou 5xx mantêm a sessão (o celular pode só estar sem sinal).
- Rotas `/auth/*` não disparam refresh.

## Cadastro e login

- Senha: 8 a 128 caracteres e no máximo 72 bytes em UTF-8 (limite do bcrypt, que ignora o resto). A regra está no `packages/shared` e vale para API e app.
- bcrypt custo 12. O login compara contra um hash "falso" quando o e-mail não existe, para o tempo de resposta não revelar se a conta existe.
- Rate limit de 10 tentativas por minuto em cadastro, login, refresh e troca de senha.
- Google: o app verifica o ID token com o Google; um e-mail verificado se liga a uma conta existente só se ela ainda não tiver Google (e aí a senha dela é removida). O botão ainda está escondido no app, porque precisa de um development build.

## Troca de senha (`POST /me/password`)

- Corpo: senha atual, nova e o refresh token **deste** aparelho.
- 403 `wrong_password` (não 401, para o app não tentar refresh), 409 `no_password` para conta só Google.
- Numa transação: grava o hash novo e apaga todos os refresh tokens do usuário **menos o deste aparelho**. Os outros celulares saem; este continua.
- Bug encontrado na revisão final: se o access token expirava enquanto a pessoa digitava, o app renovava a sessão e reenviava o pedido com o refresh token antigo, e o servidor acabava apagando o novo. Correção: o cliente preenche o refresh token na hora de enviar, inclusive na repetição.

## Exclusão de conta (`DELETE /me`)

- A tela pede para digitar `EXCLUIR` (ou `DELETE` em inglês).
- A API junta as chaves das fotos e do avatar, apaga o usuário (cascata) e só então remove os arquivos.
- O app só limpa o celular depois que o servidor confirmou: tokens, cache da lista, lembretes agendados, nome local e cache de imagens. Depois volta para a tela de boas-vindas.
