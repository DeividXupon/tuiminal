# Plano evolutivo — Git `[1] Base` e `[2] PR`

Status: **planejado, não implementado**. Documento criado em 2026-09-04.
Direção aprovada pelo pedido: preservar o Git atual em Base e construir PRs com
interface muito próxima do gh-dash. Fases, contratos e medidas podem evoluir com
protótipos e testes; mudanças precisam ser registradas aqui.

Este plano não autoriza executar ações em PRs reais durante o desenvolvimento.
Nenhuma ferramenta, dependência ou configuração pessoal foi instalada/alterada
para produzir este documento.

## Índice

1. [Objetivo e limites](#1-objetivo-e-limites)
2. [Referência de interface](#2-referência-de-interface)
3. [Inventário atual e integração](#3-inventário-atual-e-integração)
4. [Escopo rastreável](#4-escopo-rastreável)
5. [Seções, filtros e contexto](#5-seções-filtros-e-contexto)
6. [GitHub, autenticação e dados](#6-github-autenticação-e-dados)
7. [Ações e segurança](#7-ações-e-segurança)
8. [CI e notificações](#8-ci-e-notificações)
9. [Arquitetura e persistência](#9-arquitetura-e-persistência)
10. [Desempenho e limites](#10-desempenho-e-limites)
11. [Fases e entregas](#11-fases-e-entregas)
12. [Testes e definição de pronto](#12-testes-e-definição-de-pronto)
13. [Riscos e decisões pendentes](#13-riscos-e-decisões-pendentes)
14. [Referências técnicas](#14-referências-técnicas)

## 1. Objetivo e limites

Criar um dashboard de Pull Requests **dentro da ferramenta Git**:

- `[1] Base`: comportamento atual de arquivos, stage/unstage, commits, grafo e diffs.
- `[2] PR`: seções configuráveis, PRs de vários repositórios, detalhes, diff e ações.
- `[#]` continua abrindo Git; `tuiminal git [diretório]` continua válido.
- Ao abrir Git pela primeira vez, selecionar Base; ao alternar outras ferramentas
  durante a mesma sessão, conservar a última subaba e o estado de ambas.
- PRs não dependem de haver um checkout local, exceto a ação de checkout.
- Base funciona sem internet, GitHub CLI ou conta GitHub.

Stack proposto: Bun + TypeScript + React + OpenTUI existentes; Git local para
operações locais; GitHub CLI (`gh`) como transporte autenticado e comandos; APIs
GraphQL/REST quando os comandos de alto nível não entregarem os campos necessários.
Não criar backend, serviço cloud, banco próprio nem requisito de instalar gh-dash.

Fora desta entrega: GitLab/Bitbucket, Issues, inbox geral de notificações GitHub,
criação de PRs, comentários inline novos por linha de diff, resolver threads,
edição de labels/revisores, operações em lote, execução arbitrária de comandos
configurados, bypass de proteção, clone automático e daemon após fechar o app.
Esses itens não foram pedidos; não ampliá-los silenciosamente. Ler labels,
revisores e threads existentes continua no escopo.

GitHub.com é o primeiro alvo. A identidade dos dados inclui host desde o início;
GitHub Enterprise exige teste de versão/capacidades antes de ser anunciado como
suportado. Não assumir que um remote Git arbitrário oferece APIs do GitHub.

## 2. Referência de interface

A especificação visual faz parte deste plano:
**[Referência do gh-dash, wireframes e interações](docs/design/git-pr-interface.md)**.
Ela contém imagens oficiais inspecionadas, anatomia documentada, diferenças
intencionais, layouts largo/médio/estreito, abas da prévia, modais e todos os atalhos.

Direção resumida:

1. Faixa local Base/PR abaixo do cabeçalho global.
2. Seções de PR em faixa horizontal, com contagens e overflow acessível.
3. Query da seção visível e editável acima da tabela.
4. Tabela densa, não cards, com coluna de título expansível.
5. Prévia à direita ou embaixo; painel único quando o espaço não comportar ambos.
6. Prévia com Visão geral, Checks, Atividade, Commits e Arquivos.
7. Diff focado dentro de PR, sem stage/unstage remoto.
8. Rodapé contextual curto e ajuda completa acessível por teclado/mouse.

Não sacrificar a lista para uma sidebar estreita de repositórios. A lista deve
continuar ocupando a altura disponível; não reservar histórico, margens ou áreas
de saída sem função. Dados fictícios dos wireframes não são fixtures de produção.

## 3. Inventário atual e integração

Inspeção local em 2026-09-04, antes de implementar:

| Arquivo atual | Situação | Trabalho previsto |
| --- | --- | --- |
| `src/features/git/GitWorkspace.tsx` | `GitViewer`, 1.144 linhas; lógica/estado/UI locais. | Extrair a tela atual para `GitBaseWorkspace.tsx`; manter wrapper pequeno para Base/PR. |
| `src/features/git/services/git.ts` | 293 linhas, comandos locais, raiz de lançamento em cache. | Preservar comportamento; introduzir resolução explícita de clones para checkout de PR. |
| `src/features/git/model/view.ts` | Modos de diff, grafo, log e commit. | Não misturar modo local com subaba Base/PR; criar modelo separado. |
| `src/features/git/rendering/*` | Parser, apresentação e renderização de diff/grafo. | Reaproveitar partes puras e de renderização após testar limites e arquivos especiais. |
| `src/features/git/index.ts` | Exporta somente `GitViewer`. | Exportar também escopo de teclado e disposer de recursos de PR. |
| `src/app/feature-registry.ts` | Git tem escopo vazio e nenhum disposer. | Registrar `gitKeyboardScope` e limpeza de requests/watchers/processos da ferramenta. |
| `src/app/App.tsx` | Compõe ferramentas por API pública. | Respeitar inputs/modais Git e contexto Base/PR no tutorial; evitar lógica de PR no App. |
| `src/shared/ui`, tema e i18n | Infraestrutura comum existente. | Reutilizar controles, `#4B75FF`, Unicode e os seis idiomas. |

A Base atual faz refresh periódico somente quando ativa. O wrapper precisa passar
`active=false` para Base quando PR está selecionado ou um modal global a bloqueia,
sem destruir seus estados. PR só inicia leitura/autenticação ao ser visitado.
Nenhuma consulta GitHub deve acontecer ao iniciar Runner/Banco/HTTP ou abrir Base.

O workspace está em migração e pode receber trabalho paralelo em HTTP; alterações
de PR não devem mexer em módulos HTTP, Runner ou Banco fora de contratos públicos
estritamente necessários. Confirmar o inventário no início de cada fase.

## 4. Escopo rastreável

Todos os itens abaixo fazem parte da entrega completa. Uma primeira fatia somente
de leitura não equivale a concluir este plano.

| ID | Requisito | Evidência de conclusão | Fase |
| --- | --- | --- | --- |
| R01 | Base/PR dentro de Git | `[1]`/`[2]`, mouse, preservação de estado e modo isolado funcionando. | 1 |
| R02 | Listar vários repositórios | Uma seção agrega PRs de ao menos três repos, com identidade sem colisões. | 3 |
| R03 | Seções personalizadas | Criar, editar, duplicar, ordenar, excluir; presets meus/revisar/atribuídos/CI falhando. | 3 |
| R04 | Filtrar repo, autor, branch e label | Busca temporária, validação, salvamento explícito e escopo visível. | 3 |
| R05 | Todos os campos da lista | Estado, repo, título, autor, responsáveis, base, comentários, revisão, CI, labels e linhas. | 3–4 |
| R06 | Prévia detalhada | Identidade estável, carregamento parcial e cinco abas navegáveis. | 4 |
| R07 | Revisões e code owners | Pedidos pendentes, revisões efetivas e indicação de solicitação como code owner. | 4 |
| R08 | Histórico de commits/cópia | Paginação, seleção, SHA completo copiado sem alterar o checkout. | 4 |
| R09 | Descrição completa | Markdown seguro, expansão/recolhimento e scroll preservado. | 4 |
| R10 | Visualizar diff | Diff de PR/arquivo/commit, modos úteis e sinalização de conteúdo indisponível. | 5 |
| R11 | Checkout local | Seleção de clone, pré-validação, confirmação e proteção do trabalho local. | 7 |
| R12 | Adicionar/remover responsáveis | Lista editável, confirmação, permissão e atualização de todas as seções afetadas. | 6 |
| R13 | Comentar | Editor, envio explícito, preservação do draft e tratamento de resultado incerto. | 6 |
| R14 | Aprovar com comentário configurável | Template editável, commit identificado e nenhuma aprovação automática. | 6 |
| R15 | Autorizar workflows | Execuções elegíveis de forks identificadas e aprovação explícita por execução. | 8 |
| R16 | Acompanhar CI/notificar | Watch explícito, estado correto, aviso de conclusão e encerramento limpo. | 8 |
| R17 | Atualizar PR com a base | Confirmação, proteção contra head antigo e conflitos apresentados. | 7 |
| R18 | Draft → pronto | Elegibilidade validada e transição refletida na lista/prévia. | 6 |
| R19 | Merge | Métodos permitidos, bloqueios, SHA esperado e distinção merge/fila/auto-merge. | 7 |
| R20 | Fechar/reabrir | Confirmação com identidade completa e estado final consultado. | 6 |
| R21 | Abrir/copiar identidade | Browser, número, URL; cópia confirmada e fallback seguro. | 4 |
| R22 | UX transversal | Mouse, foco, seis idiomas, quatro paletas, dois layouts, resize e estados de erro. | 1–9 |

## 5. Seções, filtros e contexto

### 5.1. Defaults propostos

| Seção | Filtro de referência |
| --- | --- |
| Meus PRs | `is:open author:@me` |
| Aguardando minha revisão | `is:open review-requested:@me` |
| Atribuídos a mim | `is:open assignee:@me` |
| CI falhando | `is:open status:failure` |
| Exemplo de seção de equipe | `is:open author:ana base:main label:bug` |

Os exemplos seguem a busca do GitHub; o adaptador deve validar os qualificadores
suportados e pode usar `gh search prs --checks failure` para o preset de CI.
Não executar uma busca por tecla digitada: `[Enter]` aplica, `[Ctrl+S]` abre o fluxo
de salvar seção. Filtros do usuário são dados, nunca comandos de shell.
Fonte: [busca de PRs](https://cli.github.com/manual/gh_search_prs).

### 5.2. Escopo independente por projeto

- Perfil identificado pela raiz Git resolvida do lançamento; fora de Git, pelo
  diretório canônico de lançamento. Não usar apenas nome da pasta.
- Perfil A e perfil B têm seções, repos, queries salvas e preferência de layout
  independentes, seguindo a convenção de sessões por projeto já usada no Runner.
- Primeiro uso sugere o remote GitHub do projeto; com múltiplos remotes ambíguos,
  pedir escolha. Não pesquisar todos os repositórios da conta sem escolha visível.
- O usuário pode acrescentar outros repos ao perfil e usar uma visão ampla da
  conta conscientemente. Não é necessário clonar repos para listá-los.
- Um template global pode servir de ponto de partida; salvar no perfil não altera
  outros projetos. Interface mostra sempre host, conta e escopo efetivo.
- Mapas de clones locais são por host/repositório e podem ter mais de uma pasta;
  não presumir que PRs de outros repos pertencem ao diretório atual.
- Seleção/posição/aba de prévia podem ser restauradas, mas reconfirmar acesso e
  atualizar dados. Nunca restaurar uma operação de escrita em execução.

### 5.3. Regras de consulta

Adicionar `is:pr` e exclusão de arquivados por default, salvo override explícito.
Guardar query digitada e query efetiva separadamente. Para combinar filtro livre
com restrição de repositórios, não concatenar `OR` sem respeitar precedência:
inicialmente consultar por repo com escopo estruturado, validar resultados,
deduplicar e ordenar; otimizar lotes após testes de equivalência.

Identidade estável: host + node ID do PR, acompanhada de owner/repo/número.
Número `#42` sozinho nunca identifica uma seleção, ação, cache ou notificação.
Página carregada, total estimado e busca parcial são contagens diferentes.
Preservar seleção por identidade ao atualizar; se ela sumir, avisar e escolher
vizinho somente para navegação, nunca para reapontar uma confirmação já aberta.

## 6. GitHub, autenticação e dados

### 6.1. Transporte e autenticação

`gh` já foi detectado localmente na versão 2.83.2, mas isso não define a versão
mínima do produto. A fase 2 cria testes de capacidade e documenta a versão mínima
real; não atualizar instalações do usuário automaticamente.

- Detectar binário, versão e flags necessárias sem bloquear Base.
- Reusar autenticação do GitHub CLI; consultar a identidade efetiva do viewer.
- Não chamar `gh auth token` para copiar segredo para o app e não registrar tokens.
- Sem login, mostrar instrução `gh auth login --hostname <host>` e verificar de novo.
  Um login interativo não deve ser disparado ocultamente por um subprocesso em pipe.
- Não trocar a conta global do `gh` sem uma ação explícita. Se a identidade mudar
  externamente, invalidar caches e confirmações; exigir nova revisão da ação.
- Host em allowlist escolhida pelo usuário; API nunca recebe um host vindo do
  texto de descrição, comentário ou link arbitrário do PR.
- Comandos em arrays de argumentos, stdin para corpos/queries e JSON validado.
  Desabilitar prompts/pager/editor nos comandos automatizados e impor timeout.

O CLI normalmente usa o cofre do SO, mas pode recorrer a arquivo em texto se o
cofre não funcionar. Não prometer proteção absoluta nem introduzir outro arquivo
de tokens. [Autenticação oficial](https://cli.github.com/manual/gh_auth_login).

### 6.2. Consultas e origem dos campos

| Grupo | Origem proposta | Cuidados |
| --- | --- | --- |
| Lista/pesquisa | GraphQL `search` e/ou `gh search prs --json` | Busca retorna resumo; enriquecer em lote, não abrir um processo por coluna/PR. |
| Identidade/estado | `PullRequest`: id, number, url, repository, title, state, isDraft | Não juntar repos/hosts por número. |
| Autor/responsáveis/labels | author, assignees, labels | Lista pode truncar com `+N`; prévia oferece paginação completa. |
| Branches/alterações | baseRefName, headRefName, baseRefOid, headRefOid, additions, deletions, changedFiles | Guardar os SHAs correspondentes ao snapshot/diff. |
| Comentários | comments + reviewThreads, carregados conforme necessário | Coluna compacta usa comentários gerais + threads; ajuda explica essa semântica. Atividade mostra comentários individuais. |
| Revisão | reviewDecision, reviews/latestReviews, reviewRequests | Não determinar elegibilidade apenas pela última string `APPROVED`. |
| Code owners | `reviewRequests.nodes.asCodeOwner` + requestedReviewer | Diferenciar usuário/equipe e ausência de dados de ausência de pendência. |
| Commits | conexão commits e dados de cada commit | Paginação; SHA completo usado para cópia e diff. |
| Atividade | timelineItems, comments e reviews | Normalizar eventos, paginação e ordem estável; evitar duplicar comentários de review. |
| CI | statusCheckRollup, check runs/statuses e Actions quando aplicável | Preservar provedor, tentativa, SHA e eventual contexto de merge/teste. |
| Elegibilidade | viewerCan*, mergeable, mergeStateStatus e dados de regras quando acessíveis | Há campos pendentes/desconhecidos; servidor continua autoridade final. |

O GraphQL disponibiliza `reviewRequests`, `reviewDecision` e `asCodeOwner`.
O indicador de code owner identifica uma solicitação; não calcula sozinho todas
as regras de proteção nem prova que um merge está autorizado.
[Referência de PR/revisão](https://docs.github.com/en/graphql/reference/pulls#reviewrequest).

### 6.3. Paginação e erro parcial

- Modelos normalizados, independentes do formato bruto e da UI.
- `pageInfo`/cursores por conexão: lista, commits, arquivos, reviews e atividade
  não compartilham o mesmo cursor.
- Erros GraphQL podem coexistir com HTTP 200 e dados parciais: preservar o que foi
  recebido, mas marcar campos/ações cuja validade não pôde ser confirmada.
- Busca do GitHub tem teto de resultados acessíveis por consulta; nunca afirmar
  que uma busca muito ampla carregou tudo. Oferecer refinar filtros e paginação.
- Não converter null, permissão negada, timeout ou conexão vazia em zero/sucesso.
- Índice de busca pode demorar a refletir mutações. Reconciliar o PR por consulta
  direta e marcar atualização; não repetir a mutação para corrigir a lista.

Referência: [API de busca](https://docs.github.com/en/rest/search/search).

## 7. Ações e segurança

### 7.1. Contrato comum

Fluxo obrigatório: **preparar → consultar elegibilidade → mostrar confirmação →
executar uma vez → reconciliar resultado**. A abertura de um modal não escreve.

Toda preparação carrega identidade do host/conta/repo/PR, ação, valores editados,
head SHA conhecido, dados de permissão e instante da leitura. Revalidar antes de
confirmar; mudanças relevantes exigem revisão do usuário. Bloquear clique duplo e
repetição de tecla; serializar escritas por PR e por clone no caso de checkout.

Se um timeout ocorrer depois de enviar, o resultado é **incerto**, não falha
segura para repetir. Consultar o estado remoto e oferecer verificação; comentários
e reviews não podem ser reenviados automaticamente. Desabilitar retry de POST por
default. Cancelar o cliente não desfaz uma mutação aceita pelo servidor.

### 7.2. Matriz de operações

| Operação | Mecanismo proposto | Validação/efeito |
| --- | --- | --- |
| Abrir navegador | `gh pr view --web` ou opener comum com URL validada | Ação explícita; somente URL HTTPS de PR/commit/check do host conhecido. |
| Copiar número/URL/SHA | Clipboard do renderer/OSC52 | Texto completo, toast; sucesso somente se envio suportado, fallback selecionável. |
| Adicionar/remover responsáveis | `gh pr edit --add-assignee/--remove-assignee` | Mostrar delta de pessoas; não substituir todos implicitamente. |
| Comentar | `gh pr comment --body-file -` ou REST de issue comments | Corpo por stdin, preview e confirmação; não usar shell interpolation. |
| Aprovar | REST create review com evento APPROVE e `commit_id`, via `gh api` | Vincular ao commit revisado e revalidar head; impedir autoaprovação quando não permitida. |
| Tornar pronto | `gh pr ready` | Apenas draft elegível; não disparar CI local. |
| Fechar/reabrir | `gh pr close` / `gh pr reopen` | Mostrar estado/alvo; não usar exclusão de branch como efeito colateral. |
| Atualizar com base | REST update-branch com `expected_head_sha`, via `gh api` | Proteger contra snapshot antigo; mostrar conflito/202 e acompanhar estado final. |
| Merge | `gh pr merge --match-head-commit` e método permitido | Sem `--admin` e sem `--delete-branch`; ler regras, fila e intenção de auto-merge. |
| Checkout | `gh pr checkout` no clone explicitamente escolhido | Conferir remote e trabalho local; nada de force/reset/stash automático. |
| Autorizar workflow | REST Actions approve run via `gh api` | Elegibilidade, origem fork, run ID e risco revisados antes de confirmar. |

Usar `--repo`/hostname quando o comando suportar; checkout deve ser vinculado pelo
cwd e remote validado. O adaptador deve conferir flags na versão mínima escolhida,
não assumir paridade entre todos os subcomandos. Cada comando recebe alvo explícito,
sem depender do PR associado à branch atual.

Fontes: [comandos PR](https://cli.github.com/manual/gh_pr),
[review com commit](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request),
[atualização da branch](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request-branch),
[merge](https://cli.github.com/manual/gh_pr_merge).

### 7.3. Merge e branch-base

- Oferecer merge commit, squash e rebase somente quando o repositório permitir.
- PR draft, head modificado, checks necessários incompletos, conflito, revisão
  pendente ou permissão insuficiente devem ser estados explícitos.
- Merge queue e auto-merge não são merge concluído. Explicar o efeito pretendido
  e pedir consentimento específico antes de enfileirar/agendar.
- Observar `mergedAt`/estado remoto antes de exibir sucesso de merge.
- Atualizar branch significa trazer a base para o head remoto; o default proposto
  é merge, sem force push e sem rebase silencioso. Rebase de atualização é futuro.
- Ao detectar head novo durante a confirmação, cancelar a preparação antiga.

### 7.4. Checkout

1. Resolver host/owner/repo e mapear clones, incluindo worktrees existentes.
2. Pedir pasta quando não houver mapa; mostrar escolha quando houver vários.
3. Validar Git root, remote esperado e pasta real, não só o nome de diretório.
4. Verificar staged, unstaged, untracked e operação Git em andamento.
5. Com trabalho local pendente, bloquear o checkout automático desta versão e
   explicar como resolver; nunca executar stash/reset/clean para continuar.
6. Mostrar branch atual, PR/head de destino e efeitos de fetch/checkout.
7. Executar somente após confirmação; não rodar scripts, installs ou testes do PR.
8. Atualizar Base se for seu clone; se for outro, informar a pasta utilizada e
   oferecer abertura explícita, sem trocar silenciosamente o projeto lançado.

Worktree novo e clone automático são evoluções separadas. O caminho local salvo
não autoriza executar código do PR. [Checkout oficial](https://cli.github.com/manual/gh_pr_checkout).

### 7.5. Conteúdo não confiável

- Sanitizar sequências de controle de terminal, OSC52/links e ANSI em títulos,
  Markdown, nomes e conteúdo remoto. Não permitir que um PR escreva no clipboard.
- Imagens remotas de Markdown não são baixadas automaticamente; links são texto
  até ação explícita e URLs são validadas. HTML não é executado.
- Nenhum template de seção, descrição, comentário ou nome de branch vira shell.
- Não armazenar tokens, cabeçalhos de autenticação, corpos privados ou saída
  completa de comandos em logs de diagnóstico.
- Notificação desktop tem modo discreto, sem título/repo privado na tela bloqueada.
- Campos sem informação de permissão não habilitam uma ação destrutiva por palpite.

## 8. CI e notificações

Não criar automação do Codex: esta é uma capacidade futura do próprio Tuiminal.
Um acompanhamento começa somente quando o usuário aciona `[w]` e vive enquanto
o processo Tuiminal estiver aberto, inclusive ao alternar para Base/Runner.

### 8.1. Estados e identidade

Chave: host + conta + PR + head SHA; execuções incluem provedor, run/check ID e
tentativa. Diferenciar `queued`, `in_progress`, `action_required`, sucesso, falha,
cancelado, skipped, neutral, timed_out e desconhecido. Normalizar sem apagar os
estados brutos; `Sem checks` nunca é sinônimo de `Todos passaram`.

`gh pr checks --json` e GraphQL servem à leitura. A implementação deve usar um
agendador compartilhado, não um processo `--watch` permanente por PR. O comando
`--watch` é referência de comportamento e pode servir ao protótipo controlado.
[Checks](https://cli.github.com/manual/gh_pr_checks).

### 8.2. Acompanhamento

- Default inicial: consultar a cada 15s, com jitter, backoff e teto de concorrência.
- Não notificar como "terminou agora" um PR que já estava terminal ao começar o watch.
- Notificar uma vez por transição observada do conjunto conhecido para terminal;
  incluir se há sucesso, falhas, cancelamentos ou itens ignorados, sem ocultá-los.
- Resolver corridas de descoberta de checks com uma segunda leitura estável; isso
  não prova que nenhum workflow futuro será criado, e a UI não deve prometer isso.
- Head novo: marcar uma nova rodada observada; nunca atribuir resultado antigo ao
  código novo. Reexecução no mesmo SHA tem identidade de tentativa distinta.
- Mudança de conta ou perda de acesso pausa o watch; fechar o app encerra watchers.
- Reabrir o app pode oferecer retomar a lista de interesse, mas não iniciar
  processos ocultos nem dizer que monitorou durante o período fechado.
- Notificação interna garantida quando o app está vivo; notificação desktop/terminal
  é best effort conforme suporte e preferência. Falha do notificador não altera CI.

### 8.3. Autorizações de workflows

O escopo obrigatório é autorizar execuções de forks que o GitHub deixa aguardando
aprovação. Enumerar runs elegíveis, mostrar autor/origem e exigir confirmação
por execução selecionada; não usar "aprovar tudo" indiscriminadamente.

Aprovação de deployment protegido é outra API e outra permissão. Nesta entrega,
identificar essa espera e abrir o destino correto no navegador; implementação de
aprovação de deployments fica como extensão explícita, não deve ser anunciada
como suportada pelo botão de workflows. CI de provedores externos é exibido pelos
checks/statuses; autorização específica de cada provedor não está incluída.
[REST de workflow runs](https://docs.github.com/en/rest/actions/workflow-runs).

## 9. Arquitetura e persistência

### 9.1. Organização proposta

Árvore indicativa de responsabilidades; criar arquivos conforme a fase exigir,
não scaffolding vazio. Nenhum componente novo deve ultrapassar o limite de
manutenção apenas por acumular todas as funcionalidades de PR.

```text
src/features/git/
  index.ts                       API pública para App
  keyboard.ts                    posse de teclado Base/PR, modais e inputs
  GitWorkspace.tsx               composição leve [1] Base / [2] PR
  GitBaseWorkspace.tsx           tela local existente, preservada
  PullRequestsWorkspace.tsx      composição de seções/lista/prévia
  model/
    workspace.ts                 estado da subaba local
    pr/
      types.ts                   identidades, resumos e detalhes normalizados
      navigation.ts              seleção, foco, preview, offsets
      query.ts                   filtros/escopo, validação e ordenação
      config.ts                  schema e defaults puros
      checks.ts                  agregação/transições de CI
      actions.ts                 intenção, elegibilidade e estado das operações
  services/
    git.ts                       operações locais existentes
    github/
      transport.ts               subprocesso gh, JSON, timeout, cancelamento
      auth.ts                    identidade e capacidades
      search.ts                  busca e paginação
      details.ts                 consultas por necessidade da prévia
      mutations.ts               operações explícitas, sem handlers de UI
      checks.ts                  leitura de CI e execuções
    pr-session.ts                coordenação, cache e respostas obsoletas
    pr-watch.ts                  scheduler de acompanhamentos
    pr-checkout.ts               mapa/validação do clone e checkout
  storage/pr/
    config.ts                    YAML do usuário e perfis
    session.ts                   preferências/sessão sem conteúdo remoto
  rendering/
    diff.tsx                     partes reutilizáveis do diff atual
    pr-table.ts                  colunas, texto e estados
    pr-markdown.tsx              apresentação segura e limitada
  ui/pr/
    SectionStrip.tsx             faixa de seções
    QueryBar.tsx                 query e escopo efetivo
    PullRequestList.tsx          tabela/linhas
    PreviewPane.tsx              identidade, tabs e viewport
    OverviewTab.tsx / ChecksTab.tsx / ActivityTab.tsx
    CommitsTab.tsx / FilesTab.tsx / PullRequestDiff.tsx
    SectionEditor.tsx / RepositoryPicker.tsx / ActionMenu.tsx
    CommentDialog.tsx / ReviewDialog.tsx / AssigneesDialog.tsx
    MergeDialog.tsx / CheckoutDialog.tsx / WorkflowApprovalDialog.tsx
```

Modelos ficam sob `features/git/model/pr`, mantendo as regras existentes que
proíbem IO, React e serviços em `model`. Não contornar o gate criando `pr/model`
fora do padrão reconhecido. Novas regras que forem necessárias ganham testes.

App acessa somente `features/git/index.ts`. O Git não importa serviços de Runner
ou HTTP para reaproveitar processos/URLs. Se faltar uma capacidade verdadeiramente
comum, extrair contrato mínimo para core/shared com testes antes de reutilizá-la.
Disposer do Git encerra somente recursos iniciados por essa ferramenta.

### 9.2. Contratos principais

- `PullRequestIdentity`: host, nodeId, owner, repo, number e URL validada.
- `AuthContext`: host, viewerId/login e geração da identidade, nunca token.
- `SectionState`: id, query efetiva, cursor(es), seleção, cache/erro e geração.
- `PreviewState`: PR, aba, offsets por aba e situação de cada conexão.
- `PreparedAction`: alvo imutável, ação, payload, expectedHeadSha e geração de auth.
- `MutationResult`: confirmado / rejeitado / resultado incerto, com próxima verificação.
- `WatchState`: identidade, SHA, execuções/tentativas observadas e último aviso.

Transportes retornam resultado tipado; UI nunca interpreta stderr bruto como regra
de produto. Repositórios e providers podem ter dados incompletos sem derrubar a tela.

### 9.3. Configuração proposta

Arquivos futuros em `$XDG_CONFIG_HOME/tuiminal/`, com fallback para
`~/.config/tuiminal/`: `git-pr.yaml` e `git-pr-session.json`. Não criar esses
arquivos na tarefa de planejamento. Versão de schema obrigatória; gravação atômica
e permissões restritas. Ler erro de YAML sem apagar ou regravar o arquivo original.

Exemplo ilustrativo do schema candidato, não compatibilidade automática com gh-dash:

```yaml
version: 1
defaults:
  host: github.com
  pageSize: 20
  refreshSeconds: 300
  preview:
    open: true
    position: auto
    widthRatio: 0.45
    heightRatio: 0.50
  approveComment: ""
  notifications:
    desktop: false
    discreet: true
profiles:
  /caminho/canonico/projeto:
    repositories: [equipe/api, equipe/web, equipe/infra]
    sections:
      - id: mine
        title: Meus PRs
        filters: is:open author:@me
      - id: review
        title: Aguardando minha revisão
        filters: is:open review-requested:@me
repoPaths:
  github.com/equipe/api: [/caminho/canonico/projeto]
```

Planejar validação de nomes, IDs duplicados, proporções, limites, hosts, repos,
colunas e caminhos. Caminhos são normalizados; `~` só é expandido no campo de
caminho escolhido pelo usuário, nunca como shell. Presets adicionais são criados
pela UI/defaults, não omitidos da entrega por não estarem neste exemplo curto.

Persistir configuração de seções, mapas e preferências. Sessão contém apenas
identificadores, seção/preview/offset e interesse de watch para eventual retomada.
Cache de dados privados, descrição, diff, comentários e drafts fica em memória
nesta versão; preferências não contêm cópias desses conteúdos.

## 10. Desempenho e limites

Valores abaixo são hipóteses de engenharia para medir e ajustar, não resultados:

| Recurso | Orçamento inicial |
| --- | --- |
| Página de seção | 20 PRs; cursor e carregamento incremental. |
| Concorrência de leitura | Máximo 3 requests/processos gh por host; fila com prioridade para interação. |
| Escritas | Uma por PR/clone; nunca retries cegos. |
| Mudança de seleção | Debounce de detalhes ~150ms; manter navegação imediata. |
| Refresh de lista ativa | 5min configuráveis; leitura ao retornar se cache expirou. |
| Watch explícito | 15s inicialmente; backoff e jitter. Máximo inicial de 10 acompanhamentos. |
| Timeout de leitura | 30s, com cancelamento e reaproveitamento do último snapshot. |
| Diff/Markdown | Limites explícitos por documento e LRU global; iniciar com 2MiB de diff e 256KiB de descrição. |
| Memória de cache | Teto global inicial de 32MiB para dados de PR, com descarte LRU. |
| Tempo de resposta local | Meta p95 <50ms para mover seleção em lista já carregada; medir sem incluir rede. |

Não duplicar estado bruto/normalizado/renderizado indefinidamente. Manter somente
linhas visíveis mais overscan, e documentos de diff com renderização limitada.
Descrições maiores podem carregar a versão completa explicitamente dentro de um
teto seguro maior; se exceder, informar limite e oferecer browser, sem cortar em silêncio.

No refresh, reaproveitar objetos quando conteúdo não mudou; seleção não pode
re-renderizar todas as seções e todos os diffs. Separar cancelamento de resposta
obsoleta: mesmo se transporte não cancelar a tempo, geração/identidade impede
aplicar dados de outro PR, perfil, host ou conta.

Respeitar Retry-After, rate-limit primário/secundário e reset quando disponíveis.
Usar requests condicionais/cache do transporte em leituras REST apropriadas;
não tratar GraphQL como endpoint com ETag garantido. Carregar seções inativas sob
demanda; `[Shift+R]` atualiza explicitamente o conjunto respeitando a fila.
[Boas práticas da API](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

## 11. Fases e entregas

Cada fase entrega código verificável, documentação atualizada e testes. As caixas
ficam desmarcadas até a implementação correspondente passar pelos critérios.

### Fase 0 — contratos, referência e fixtures

- [ ] Revisar wireframes e validar navegação/responsividade em protótipo nativo.
- [ ] Registrar default Base, H/L de foco, seções `<`/`>`, modais e estados de erro.
- [ ] Fixar versão mínima/capacidades de `gh`, APIs e suporte de host.
- [ ] Criar fixtures fictícias: PRs abertos/draft/merged/closed, forks e permissão negada.
- [ ] Criar contratos normalizados, máquina de ações e testes de consulta/identidade.

Saída: nenhum acesso a conta/repo real é necessário para testar os contratos.

### Fase 1 — shell Base/PR e isolamento

- [ ] Extrair Base preservando comportamento, referências e shortcuts existentes.
- [ ] Criar wrapper e `[1]`/`[2]` com mouse, lazy mount e estado independente.
- [ ] Integrar `gitKeyboardScope`, modais, shutdown e contexto do tutorial.
- [ ] Testar Git sem repo, modo isolado e transições entre ferramentas.
- [ ] Preservar a Base offline; nenhum processo gh antes de visitar PR.

Saída: R01 completo; PR pode apresentar dados fictícios nesta fase, rotulados como demo.

### Fase 2 — adaptador GitHub e persistência

- [ ] Binário/capacidades, auth/host/viewer, erros tipados e transporte cancelável.
- [ ] JSON validado, stdin, timeouts, limites, logs sem segredo e args sem shell.
- [ ] Schema versionado, perfis por projeto, mapa de clones e gravação atômica.
- [ ] API fake e executável gh fake para testar todo o transporte sem credenciais.
- [ ] Troca de identidade invalida dados e ações preparadas.

Saída: leituras paginadas demonstradas contra fixture; login ausente tem saída clara.

### Fase 3 — dashboard e seções

- [ ] Faixa de seções, queries, escopo, tabela e rodapé contextual.
- [ ] Presets completos e gerenciamento por UI, incluindo colunas e ordem.
- [ ] Agregação multirrepositório, paginação, cache e pesquisa parcial sinalizada.
- [ ] Filtrar/atualizar sem perder seleção nem reapontar ação.
- [ ] Contagens e campos faltantes corretos; testes de Unicode e três layouts.

Saída: R02–R04; resumo de R05 disponível sem um request por célula.

### Fase 4 — prévia completa e navegação de leitura

- [ ] Visão geral, Checks, Atividade, Commits e Arquivos com paginação própria.
- [ ] Descrição segura expansível; revisores, equipes e code owners solicitados.
- [ ] Identidade/SHAs persistem durante refresh e mudanças rápidas de seleção.
- [ ] Copiar número/URL/SHA, browser e feedback acessível.
- [ ] Prévia direita/baixo/painel único e restauração do foco/scroll.

Saída: R05–R09 e R21; nenhum controle promete carregar toda uma conexão parcial.

### Fase 5 — diffs de PR, arquivo e commit

- [ ] Adaptar renderer/parser sem dependência de stage ou snapshot local.
- [ ] Navegação por arquivo/hunk e comparação vinculada a SHAs.
- [ ] Arquivos especiais, renomes, binários, patches ausentes e limites tratados.
- [ ] Modos unificado/split/intraline, resize, copy/scroll e retorno contextual.
- [ ] Comparar desempenho e limitar renderização de diffs grandes.

Saída: R10; Base continua com seus diffs e ações locais intactos.

### Fase 6 — escrita de metadados e revisão

- [ ] Menu de ações com elegibilidade e motivo das indisponíveis.
- [ ] Comentar, aprovar/template e responsáveis com formulários seguros.
- [ ] Draft → pronto, fechar/reabrir com confirmação e reconciliação.
- [ ] Prevenir duplicação, revalidar identidade/head e tratar resultado incerto.
- [ ] Manter drafts em memória e respeitar a pilha de Esc.

Saída: R12–R14, R18 e R20. Testes de escrita exclusivamente em fixtures.

### Fase 7 — checkout, atualizar branch e merge

- [ ] Mapa/seleção/validação do clone; política para worktree suja e operação Git ativa.
- [ ] Checkout confirmado; refresh da Base correto para o clone lançado.
- [ ] Atualização da branch com SHA esperado e estado assíncrono/conflito.
- [ ] Merge permitido por método, sem bypass, com fila/auto-merge explícitos.
- [ ] Resultado confirmado por nova consulta; nenhuma exclusão automática de branch.

Saída: R11, R17 e R19; teste local apenas em repositórios temporários.

### Fase 8 — acompanhamento e autorização de workflows

- [ ] Scheduler limitado por host, watches por identidade/SHA/tentativa e backoff.
- [ ] CI do GitHub e externos, nenhum check versus erro versus pendência.
- [ ] Notificação interna, desktop opt-in e modo discreto; parar/retomar explícitos.
- [ ] Distinguir workflow de fork de deployment protegido.
- [ ] Aprovação de run selecionado com risco/origem e permissões visíveis.
- [ ] Encerrar recursos no shutdown e não notificar repetidamente estado antigo.

Saída: R15–R16, sem daemon e sem modificar settings de segurança dos repositórios.

### Fase 9 — acabamento, regressão e entrega

- [ ] Completar R22: mouse, foco, traduções, paletas, layouts e ajuda.
- [ ] Tutorial Git/PR com dados fictícios e alvos estáveis.
- [ ] Verificação visual contra referência e gravação dos percursos principais.
- [ ] Benchmarks locais de navegação/cache/diff e relatório de limites reais.
- [ ] Atualizar README, AGENTS, arquitetura e guia de uso sem alegações antecipadas.
- [ ] Conferir matriz R01–R22, testes, build/check e link global do CLI intacto.

Saída: funcionalidade completa somente quando todos os requisitos têm evidência.

## 12. Testes e definição de pronto

### 12.1. Unitários e transporte

- Queries com repo/autor/base/head/label e texto entre aspas; precedência de OR,
  escopo de vários repos, nomes homônimos em hosts diferentes e paginação.
- Schema válido/inválido, migração versionada, perfil por raiz e gravação falhando.
- Auth ausente, identidade trocada, JSON inválido, GraphQL parcial, 401/403/404,
  409/422, rate limit, timeout, processo interrompido e resultado remoto incerto.
- Campos nullable, commits/threads paginados, owners por equipe e review dismissed.
- Normalização CI com externos, pending/cancelled/skipped, zero checks, rerun,
  atualização de head, descoberta tardia e deduplicação de notificações.
- Tentativas de injeção em args, Markdown, OSC52, URL, título, path e branch.
- Escritas não disparadas por leitura; nenhuma repetição automática após timeout.
- Checkout com repo errado, sujo, worktree, múltiplos clones e operação em andamento.

### 12.2. Integração de TUI

- Abrir Base → PR → Base e voltar por mouse/teclado sem reset de seleção/diff.
- Digitar `q`, `#`, `1`, `2`, `+` e atalhos de ação em campos sem efeitos globais.
- Esc em input → modal → prévia → lista, um nível por evento.
- Rolar até a última linha; nenhum footer cobre lista, diff ou formulário.
- Seção A → B rapidamente com resposta A atrasada não altera B.
- Atualizar lista com modal aberto não troca o PR que será aprovado/fechado.
- Preview abaixo/à direita, mudança de aba, resize e retorno ao scroll anterior.
- Mouse em linhas, seções, tabs, check, commit, arquivo, ajuda e confirmações.
- Recursos gh/watch são destruídos só pelo proprietário; Base não perde seus refs.
- Matriz de dimensões e idiomas definida no documento de interface.

### 12.3. Integração remota controlada

Suíte padrão sem GitHub real. Testes remotos devem ser opt-in, com host/repo sandbox
explicitamente autorizado e fixture rastreada. Credenciais nunca no repositório.
Somente leitura por default; merge, review, comentário e workflow precisam de suíte
de escrita habilitada separadamente. Limpeza só dos recursos criados pela suíte.

### 12.4. Gate de cada entrega

```bash
bun run check
git diff --check
```

Adicionar casos aos scripts existentes sem enfraquecer asserts ou baseline.
Não aumentar o limite do GitBaseWorkspace apenas por renomear o controlador;
transportar a exceção existente e reduzir conforme extrair responsabilidades.
Novos módulos seguem os limites de linhas/complexidade do projeto.

Mudanças de teclado/foco/mount também exigem instância real isolada de Tuiminal,
config temporária, repo descartável e encerramento somente da sessão do teste.
Relatório final separa testes locais, remotos opt-in, visuais e o que não foi medido.

## 13. Riscos e decisões pendentes

| Risco/decisão | Default proposto e momento de validação |
| --- | --- |
| Fidelidade visual versus foco consistente | Estrutura gh-dash; H/L foco, `<`/`>` seções. Validar no protótipo fase 0. |
| `gh` instalado não tem flag/campo recente | Feature detection e versão mínima testada, fase 2; Base não é bloqueada. |
| GraphQL/busca ampla e limites | Paginação e enriquecimento em lote; medir custo com múltiplas seções, fase 3. |
| Review/merge baseado em head antigo | Identidade imutável e SHA esperado; escrita com estado incerto não repete. |
| Code owners e regras incompletas | Mostrar solicitações oficiais e indisponibilidade; não inferir conformidade total. |
| Notificação fora do app/terminal | Desktop opt-in, fallback interno; sem garantia após fechar. |
| Imagens/fontes especiais do gh-dash | Ícones Unicode/ASCII de fallback; não exigir Nerd Font. |
| Comentários: soma heterogênea | Coluna de conversas explica comentários gerais + threads; detalhes não omitem respostas. |
| Privacidade de cache/sessões | Conteúdo remoto em memória; conta/host isolam tudo. |
| UI de configuração muito extensa | Editor progressivo por seção; não criar controles globais em todo painel. |
| Módulo Git já grande | Composição pequena e serviços/modelos testáveis; não criar um hook gigante substituto. |
| Compatibilidade Enterprise/Windows | Validar por capacidade e plataforma antes de anunciar; não bloquear Git local. |

Pendências não impedem documentar o escopo, mas precisam ser resolvidas na fase
indicada. Mudança que retire R01–R22 exige decisão explícita, não omissão silenciosa.

## 14. Referências técnicas

Referências de interface e imagens estão no [anexo de design](docs/design/git-pr-interface.md).
As páginas abaixo fundamentam integrações, não são uma promessa de que o app já
as implementa. Conferir suporte na versão mínima escolhida antes de codificar.

- [GitHub CLI: PR](https://cli.github.com/manual/gh_pr)
- [Busca de PRs](https://cli.github.com/manual/gh_search_prs)
- [Detalhes em JSON](https://cli.github.com/manual/gh_pr_view)
- [REST/GraphQL via gh api](https://cli.github.com/manual/gh_api)
- [Autenticação](https://cli.github.com/manual/gh_auth_login)
- [GraphQL: PRs e ReviewRequest](https://docs.github.com/en/graphql/reference/pulls)
- [Revisões e commit_id](https://docs.github.com/en/rest/pulls/reviews)
- [Atualização da branch](https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request-branch)
- [Merge e proteção de head](https://cli.github.com/manual/gh_pr_merge)
- [Checkout](https://cli.github.com/manual/gh_pr_checkout)
- [Checks](https://cli.github.com/manual/gh_pr_checks)
- [Actions: runs e aprovações](https://docs.github.com/en/rest/actions/workflow-runs)
- [Busca e limites](https://docs.github.com/en/rest/search/search)
- [Boas práticas REST](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

## Registro do planejamento

- 2026-09-04: primeira especificação, com R01–R22, fases 0–9 e anexo visual.
  Trabalho desta tarefa restrito a documentação; nenhuma fase de produto concluída.
