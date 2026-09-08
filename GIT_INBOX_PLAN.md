# Plano implementado — Git `[4] Inbox`

Status: **implementado em 2026-09-08**.

O Inbox é a quarta área interna da ferramenta Git. Ele usa as notificações da
conta autenticada pelo GitHub CLI, é montado somente no primeiro acesso e não
altera o funcionamento offline de `[1] Diffs`. A interface detalhada está em
[docs/design/git-inbox-interface.md](docs/design/git-inbox-interface.md).

## Escopo entregue

- REST `notifications?all=true` no host definido pelo perfil Git do projeto.
- Seções locais Caixa de entrada, Revisão solicitada, Atribuídas a mim, Menções e
  Salvas, filtradas por `reason` e IDs persistidos.
- Lista densa de duas linhas, prévia responsiva, teclado e mouse.
- Paginação automática ao alcançar o último item, com loader dentro da lista.
- Atualização automática no `refreshSeconds` já configurado para Git; ela relê
  todas as páginas alcançadas na sessão sem apagar a lista durante a chamada.
- `[O]` abre o alvo exato; `[M]` marca como lida; `[B]` salva localmente; `[D]`
  conclui; `[U]` cancela a inscrição na conversa.
- Concluir e cancelar inscrição abrem confirmação e só despacham uma vez.

## Segurança e persistência

O transporte continua sendo `execFile` com argumentos, host e thread explícitos;
nenhum token é lido pelo Tuiminal. Títulos e demais textos remotos são sanitizados
antes de chegar ao renderer. O arquivo
`~/.config/tuiminal/git-inbox.json` contém somente IDs de threads salvas, é escrito
atomicamente e recebe modo `0600`.

As ações REST são:

| Ação | Endpoint |
| --- | --- |
| marcar lida | `PATCH /notifications/threads/{id}` |
| concluir | `DELETE /notifications/threads/{id}` |
| deixar de acompanhar | `DELETE /notifications/threads/{id}/subscription` |

Timeout ou cancelamento não é repetido automaticamente. Uma atualização em
segundo plano que falha mantém a lista anterior e informa o erro pelo centro de
notificações.

## Integração com PR e Issues

PR e Issues agora paginam automaticamente no fim da lista e atualizam todas as
seções configuradas no intervalo de cada perfil, reconstruindo a profundidade de
páginas já alcançada. Seus editores de query usam o mesmo autocomplete contextual:
qualificadores de PR/Issue e `repo:` para os repositórios do perfil, com
`[Ctrl+N/P]` e `[Ctrl+Y]`.

A opção GitHub das configurações `[,]`, visível somente na tela Git, concentra
seletores de PR, seletores de Issues e o escopo comum de repositórios. Em perfis
novos, o `origin` do repositório de lançamento é o padrão; fora de Git, `TODOS` é
selecionado. Alterar o host também invalida o cache do Inbox para sua próxima
ativação.

O carregamento inicial do Inbox usa o plasma ASCII compartilhado com mensagem de
estado e dissolução curta. A paginação e o refresh continuam inline para manter
as notificações anteriores visíveis e utilizáveis.

## Evidência

- `tests/git-inbox.test.ts`: filtros, merge, paginação, autocomplete, transporte,
  sanitização, alvos de escrita e persistência `0600`.
- `tests/tui/git-inbox.test.tsx`: lazy mount `[4]`, confirmação, loader e
  autocomplete por teclado.
- `tests/github-transport.test.ts` e `tests/git-issue-actions.test.ts`: refresh de
  todas as seções, profundidade paginada e reaproveitamento do cache.
- `tests/tutorial.test.ts`: alvo estável e traduções do Inbox no tour Git.
