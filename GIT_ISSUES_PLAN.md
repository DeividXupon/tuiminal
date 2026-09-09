# Plano implementado — Git `[3] Issues`

Status: **implementado em 2026-09-07**.

Este documento registra o comportamento atual da área de Issues do Tuiminal. Ela
fica dentro da ferramenta Git, preserva Diffs e Pull Requests, e adapta a
organização e as ações do gh-dash às convenções do projeto. Testes usam somente
fixtures e um `gh` falso; nenhuma issue, credencial ou configuração pessoal real.

## Objetivo e referência

- `[1] Diffs` permanece local, offline e padrão; `[2] PR` permanece independente.
- `[3] Issues` monta processos e estado somente no primeiro acesso e preserva-os
  ao trocar de aba.
- Issues independe de checkout, exceto para criar/abrir uma branch.
- O transporte autenticado é GitHub CLI 2.40.0 ou mais recente. O Tuiminal não lê
  nem persiste tokens.

Referências públicas usadas:

- [Ações da issue selecionada](https://www.gh-dash.dev/getting-started/keybindings/selected-issue/)
- [Seções de Issues](https://www.gh-dash.dev/configuration/issue-section/)
- [Layout de Issues](https://www.gh-dash.dev/configuration/layout/issue)
- [Keybindings](https://www.gh-dash.dev/configuration/keybindings/)

Foram incorporados: seções e queries, lista multirrepositório densa, prévia,
abrir/copiar, comentar, atribuir/desatribuir, editar labels, criar/fazer checkout
da branch e fechar/reabrir. Não há ações em lote, comandos configuráveis
arbitrários ou exclusão de issues. O inbox geral foi implementado depois em
`[4] Inbox`, com contratos separados em `GIT_INBOX_PLAN.md`.

## Interface

O layout completo está em
[docs/design/git-issues-interface.md](docs/design/git-issues-interface.md).

- Faixa horizontal de seções e contagens, seguida da query ativa.
- Duas linhas por issue: estado, `owner/repo #número`, título, atualização,
  comentários, reações, autor, responsáveis e labels.
- Prévia `[Visão geral]`/`[Atividade]`, Markdown inerte e comentários paginados.
- Composição lado a lado, empilhada ou painel único conforme o terminal.
- `[P]` mostra/oculta; `[Shift+P]` alterna posição automática, direita e abaixo.
- Todos os controles de teclado relevantes possuem alvo de mouse.
- Chegar à última issue dispara a próxima página e mostra o loader na lista.
- O intervalo configurado renova todas as seções e a profundidade já carregada
  sem apagar os dados visíveis; o editor de query oferece autocomplete contextual
  do GitHub.

## Consultas e escopo

Toda busca recebe `is:issue` e `archived:false`; `is:pr` é rejeitado. Repositórios
salvos são filtros estruturados, separados da query.

Sem perfil explícito, o lançamento dentro de um repositório Git com `origin`
reconhecido começa naquele `owner/repo`; fora de Git começa em `TODOS`. Uma lista
salva vazia significa o escopo completo da conta autenticada: projetos do
usuário, organizações, colaborações externas diretas e pesquisas relativas como
`author:@me`, `assignee:@me`, `involves:@me` e `mentions:@me`. Queries amplas são
divididas com `user:`, `org:` e `repo:` para nunca virarem buscas GitHub globais
acidentais. Resultados são deduplicados por host e node ID.

Cada seção persiste título, query, colunas, ordem e limite. Na tela Git, `[,]`
expõe a opção GitHub: seu gerenciador único cria, edita, duplica, move e exclui
seletores de PR/Issues e salva o mesmo filtro de repositórios para os dois.
Perfis novos trazem somente o seletor `My Issues`, com `is:open author:@me`. O
conjunto legado de quatro seletores é migrado apenas quando permanece exatamente
igual ao padrão antigo; qualquer personalização é preservada.

## Ações e segurança

| Ação | Atalho | Transporte |
| --- | --- | --- |
| Abrir | `[O]` | `gh issue view … --web` |
| Copiar número/URL | `[Y]` / `[Shift+Y]` | OSC52 |
| Comentar | `[C]` | `gh issue comment … --body-file -` |
| Atribuir/desatribuir | `[A]` / `[Shift+A]` | `gh issue edit` |
| Editar labels | `[Shift+L]` | deltas `--add-label/--remove-label` |
| Branch e checkout | `[Shift+C]` | `gh issue develop … --checkout` |
| Fechar/reabrir | `[X]` / `[Shift+X]` | `gh issue close/reopen` |

Toda escrita segue `preparar → reautenticar → reler → executar uma vez → reler e
reconciliar`. A preparação fixa host, node ID, repositório, número, estado,
`updatedAt`, identidade e geração da autenticação. Mudanças invalidam a operação
antes do envio. Timeout/cancelamento após despacho é incerto e nunca gera retry.

Conteúdo autoral vai por stdin e argumentos usam `execFile`, sem shell. Labels e
responsáveis partem dos detalhes completos, não do resumo limitado da busca. O
checkout valida raiz real, remote, host/repositório, worktree limpa e ausência de
merge/rebase em andamento; não há clone automático.

## Persistência, limites e evidência

- `~/.config/tuiminal/git-issues.yaml`, atômico, modo `0600`, perfis pela raiz
  canônica do projeto.
- Página padrão 20; limite 1–100; concorrência remota máxima 3.
- LRU: 64 seções e 32 detalhes; detalhes carregam 50 comentários por página.
- O encerramento cancela leituras e limpa recursos de PR e Issues.
- `tests/git-issues.test.ts`, `tests/git-issue-config.test.ts` e
  `tests/git-issue-actions.test.ts` cobrem modelo, configuração e transporte.
- `tests/tui/git-issues.test.tsx` cobre lazy mount, estado, responsividade,
  teclado, mouse, foco/Escape, idiomas, paletas e layouts.
- `tests/tutorial.test.ts` e `tests/i18n.test.ts` cobrem tour e traduções.

Gate completo em 2026-09-07: typecheck, format check, lint, arquitetura e
manutenibilidade aprovados; **370 testes unitários e 65 testes TUI passaram**. As
6 integrações pesadas de drivers de banco permanecem no gate opt-in já documentado.

Qualquer alteração de consultas, ações, atalhos, confirmação, persistência ou
limites deve atualizar este documento, o design e os testes correspondentes.

Em 2026-09-08, os gerenciadores locais divergentes e os atalhos `[Ctrl+E]`, `[S]`
e `[+]` foram substituídos pelo modal contextual unificado de `[,]`. A aba
Repositórios passou a carregar todos os projetos acessíveis e a oferecer `TODOS`.
O carregamento inicial e o de detalhes usam o plasma ASCII compartilhado com
texto de estado e dissolução curta; paginação e refresh preservam o indicador
inline para não cobrir issues já utilizáveis.

Em 2026-09-09, o padrão inicial foi reduzido ao seletor inglês `My Issues`. A
migração reconhece somente o conjunto legado intacto, sem sobrescrever seletores
editados pelo usuário.
