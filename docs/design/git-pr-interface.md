# Git Diffs e PR — especificação mantida

Status: interface implementada, com regressões locais; referência visual
consultada em 2026-09-04. Este documento concentra a especificação e os contratos
duráveis do workspace, sem manter um plano concluído em paralelo.
O shell Diffs/PR, dashboard responsivo, cinco abas, diff remoto, ações, CI,
configuração e tutorial estão implementados. As diferenças deliberadas em relação
ao gh-dash continuam documentadas aqui para evitar uma cópia acrítica de atalhos.

## 1. Referência visual e grau de fidelidade

A referência é a **interface de PRs do gh-dash**, não o layout do seu site.
Queremos reconhecer o mesmo produto de interação: seções horizontais, busca por
query, lista densa, seleção destacada, prévia contextual e rodapé curto.
Não vamos embutir outro aplicativo em PTY nem reproduzir a marca do gh-dash.

As duas imagens abaixo foram abertas e inspecionadas no site oficial. São
referências remotas, não capturas do Tuiminal nem mockups produzidos nesta tarefa.
O site anunciava v4.25.2; a captura Tokyo Night mostra v4.16.2. Portanto, imagens
orientam composição; atalhos e capacidades são conferidos na documentação atual.

### 1.1. Lista e prévia oficiais

![gh-dash: seções horizontais, lista à esquerda e prévia à direita](https://www.gh-dash.dev/_astro/tokyo.C3tzrPg-_Z1SRz4H.webp)

Observações da imagem, com exemplos de dados omitidos intencionalmente:

- Faixa superior com nome e contagem de cada seção; seção ativa realçada.
- Busca imediatamente acima da tabela, mostrando os filtros em uso.
- Linhas com identidade do PR, título e sinais compactos de revisão/CI/alterações.
- Seleção realçada por toda a largura, sem transformar cada PR em um card.
- Divisão vertical simples; a prévia tem identidade, título, estado e branches.
- Abas `Overview`, `Checks` e `Activity` organizam os detalhes.
- Descrição resumida com expansão; informações adicionais seguem no mesmo painel.
- Rodapé informa contexto, atualização, posição da seleção e ajuda.

Fonte: [galeria oficial](https://www.gh-dash.dev/).

### 1.2. Ajuda oficial

![gh-dash: ajuda organizada em colunas de atalhos](https://www.gh-dash.dev/_astro/help.BFU_n1Fw_1cNf5p.webp)

A captura mostra uma ajuda densa em colunas e também comandos personalizados.
Não copiar suas associações como defaults: ela inclui, por exemplo, um comando
de merge com bypass administrativo. O Tuiminal **não terá bypass automático**.

## 2. Anatomia documentada do gh-dash

| Região | Comportamento documentado | Fonte |
| --- | --- | --- |
| Seções | Cada seção tem título e filtros; pode substituir limite e layout. | [PR Sections](https://www.gh-dash.dev/configuration/pr-section/) |
| Busca | Edita a query da seção; Enter aplica; alteração temporária não muda o arquivo de configuração. | [Global](https://www.gh-dash.dev/getting-started/keybindings/global/) |
| Tabela | Colunas configuráveis por largura, crescimento, alinhamento e visibilidade; título aproveita a largura restante. | [Layout](https://www.gh-dash.dev/configuration/layout/pr/) e [opções](https://www.gh-dash.dev/configuration/layout/options/) |
| Prévia | Pode abrir à direita, embaixo ou automaticamente; pode ser ocultada. | [Defaults](https://www.gh-dash.dev/configuration/defaults/) |
| Navegação | J/K ou setas percorrem PRs; H/L ou setas laterais mudam seções; Home/End alcançam extremos. | [Navigation](https://www.gh-dash.dev/getting-started/keybindings/navigation/) |
| Prévia por teclado | P alterna posição, p alterna visibilidade, Ctrl+D/U paginam, colchetes mudam abas internas. | [Preview Pane](https://www.gh-dash.dev/getting-started/keybindings/preview/) |
| Ações | Atribuição, comentário e aprovação têm edição contextual; outras operações agem sobre o PR selecionado. | [Selected PR](https://www.gh-dash.dev/getting-started/keybindings/selected-pr/) |
| Ajuda extensível | Há comandos internos para navegação, prévia, cópia, ações e acompanhamento de checks. | [Keybindings](https://www.gh-dash.dev/configuration/keybindings/) |

Os defaults documentados incluem página de 20 PRs, prévia à direita com 45% da
largura e posicionamento automático. A página de defaults diverge sobre a altura
inferior: exemplo/tabela indicam 0,60, mas a prosa indica 40%. Não tratar essa
inconsistência como medida confirmada; os critérios do Tuiminal estão abaixo.

## 3. Adaptação ao Tuiminal

| Preservar do gh-dash | Adaptar conscientemente |
| --- | --- |
| Seções em uma faixa horizontal | Colocá-las dentro de Git → `[2] PR`; não criar sidebar permanente de repositórios. |
| Tabela principal com seleção por linha | Disponibilizar densidade de uma ou duas linhas e colunas responsivas. |
| Prévia à direita/embaixo | Acrescentar modo de painel único quando duas áreas não tiverem espaço útil. |
| Overview, Checks e Activity | Usar Visão geral, Checks e Atividade; acrescentar Commits e Arquivos para o escopo solicitado. |
| Busca por filtros GitHub | Acrescentar edição e salvamento de seções pela interface. |
| Atalhos de ações familiares | Manter H/L para foco entre painéis, conforme convenção do Tuiminal; seções usam `A←`/`F→`. |
| Sinais compactos de revisão/CI | Sempre fornecer texto/legenda e estado desconhecido, além de cor. |
| Ajuda contextual | Painel organizado por navegação, leitura e escrita, com clique nas ações. |

Identidade Tuiminal: `ShortcutText`/`InlineButton` para teclas em `#4B75FF`, logo
existente e quatro paletas. Títulos, Markdown, diffs e nomes de branches são dados:
colchetes nesses conteúdos não recebem pintura de atalho. Suporte aos seis idiomas.

## 4. Wireframes propostos

Esquemas conceituais, com dados fictícios. Não são reproduções pixel a pixel das
imagens oficiais. Medidas finais precisam ser verificadas no renderizador nativo.

### 4.1. Terminal largo — estrutura principal

```text
◆ TUIMINAL    [Alt+1] Banco  [Alt+2] Git  [Alt+3] Runner  [Alt+4] HTTP  [Alt+5] Terminal   [,] Config
GIT  [1] Diffs  [2] PR  [3] Issues                 github.com · @usuario
 [A←]  My PRs 12  │  Review requested 4  [F→] [N]
[/] is:open review-requested:@me             Escopo: todos os projetos da conta
───────────────────────────────────────────┬──────────────────────────────────
   Repo       PR / Título          Rev CI ± │ equipe/api #142
▶  api        #142 Corrigir cache   ?   ×   │ Corrigir cache
   web        #87 Ajustar navegação ✓   ✓   │ ABERTO · main ← fix/cache
   infra      #31 Atualizar imagem  ?   ◷   │ @ana · 2h · +32 / -11
                                           │ Geral Checks Atividade Commits …
                                           │──────────────────────────────────
                                           │ Descrição em Markdown…
                                           │ [e] Expandir descrição
                                           │
                                           │ Revisores: @rui pendente
                                           │ Code owners: @equipe/api pendente
                                           │ Checks: 1 falhou · 2 passaram
───────────────────────────────────────────┴──────────────────────────────────
[j/k] Navegar [Enter] Prévia [o] Browser [d] Diff [?] Ações     1/4 · há 30s
```

A área sem linhas corresponde a uma lista curta, não a um rodapé ou bloco com
altura reservada. Com mais PRs, as linhas ocupam toda a altura útil até o rodapé.
Busca, título e tabs não devem reservar várias linhas vazias.

Os diffs locais, de comparação e de PR compartilham o viewport de código. No
painel focado, `[Shift+H/L]` ou `[Shift+←/→]` rolam lateralmente; os controles
clicáveis ficam em uma linha reservada no canto inferior direito. Gutters e
fundos não se deslocam. Em duas colunas, ambos os painéis permanecem visíveis e
seus códigos rolam juntos. A posição é preservada na navegação vertical e volta
à esquerda ao sair do diff ou trocar o arquivo/modo de visualização.

### 4.2. Terminal médio — prévia embaixo

```text
GIT [1] Diffs [2] PR [3] Issues             github.com · @usuario
[A←] My PRs 12 │ Review requested 4 [F→] [N]
[/] is:open review-requested:@me
   Repo      PR / Título                         Rev CI
▶  api       #142 Corrigir cache                  ?   ×
   web       #87 Ajustar navegação                ✓   ✓
───────────────────────────────────────────────────────────────
equipe/api #142 · ABERTO · main ← fix/cache
Geral │ Checks │ Atividade │ Commits │ Arquivos
Descrição…                     Revisores e code owners…
───────────────────────────────────────────────────────────────
[Enter] Prévia [p] Ocultar [Shift+P] Posição [?] Ações
```

### 4.3. Terminal estreito/baixo — um painel por vez

```text
GIT [1] Diffs [2] PR [3] Issues
[A←] Review requested · 4 [F→] [N]
[/] review-requested:@me
▶ #142 Corrigir cache
  equipe/api · @ana · CI falhou
  #87 Ajustar navegação
  equipe/web · @rui · aprovado
[Enter] Abrir [?] Ações
```

Abrir a prévia substitui apenas o conteúdo da lista; `[Esc]`/`[h/←]` retorna à
mesma linha e offset. A faixa Diffs/PR/Issues permanece acessível. Em larguras extremas,
ocultar o texto da query fora do foco, mantendo `[/] Busca` e o estado de filtro.

### 4.4. Prévia — conteúdo das abas

| Aba | Conteúdo e interação |
| --- | --- |
| Visão geral | Título completo, URL, descrição recolhida/expandida, autor, responsáveis, branches, labels, resumo de alterações, revisões e code owners solicitados. |
| Checks | Nome, provedor, execução/tentativa, estado, duração e URL; acompanhar, parar acompanhamento e revisar autorizações elegíveis. |
| Atividade | Comentários, revisões, solicitações e eventos ordenados; paginação explícita, seleção de comentário e ações de reação/resposta. |
| Commits | SHA curto, mensagem, autor e data; selecionar commit, copiar SHA completo e consultar seu diff. |
| Arquivos | Caminho, adições/remoções e tipo de mudança; selecionar arquivo e entrar no diff. |

Somente a identidade do PR fica fixa; o conteúdo rola no espaço restante. Abas
que não couberem usam overflow horizontal com controles, nunca letras cortadas.
`[`/`]` circulam pelas abas. Não usar números: `[1]`/`[2]`/`[3]` pertencem a
Diffs/PR/Issues.

### 4.5. Diff

Modo focado dentro de PR: pequena lista de arquivos e documento de diff. Oferecer
unificado, lado a lado quando couber, e intraline reaproveitando componentes
internos do Git após separar suas dependências locais.

A comparação por caractere é calculada sob demanda e reutilizada por documento,
sem trabalho intralinha antecipado nas outras visualizações. O parser diferencia
cabeçalhos de arquivo do conteúdo dentro do hunk; linhas começando com `++` ou
`--` não somem nem reduzem indevidamente a altura do viewport. A mesma regra se
aplica aos alvos do stage parcial local, sem expor stage no diff remoto.

- Cabeçalho com repositório, número e SHAs base/head efetivamente exibidos.
- Navegação de arquivo e hunk; números de linha e contexto.
- Arquivo renomeado, binário, removido, gerado ou truncado tem representação própria.
- `[Esc]` volta à prévia e depois à lista, sem saltar para Diffs nem sair do app.
- Não misturar ações de stage de Diffs com o diff remoto de PR.
- Diff incompleto oferece abrir o arquivo/PR no navegador; nunca fingir completude.

### 4.6. Formulários e confirmações

```text
┌ Aprovar PR ───────────────────────────────────────┐
│ github.com · equipe/api #142 · usuário: @revisor  │
│ Corrigir cache · commit 9ab13cd                   │
│ Comentário                                       │
│ Revisado e aprovado.                             │
│                                                  │
│ [Ctrl+S] Aprovar  [Esc] Desfocar/Voltar             │
└──────────────────────────────────────────────────┘
```

- Mesmo padrão para comentário, responsáveis, merge, fechar/reabrir e pronto.
- Reagir mostra cinco botões numerados (👍 ❤️ 🎉 😄 👀) com contagem e marca da
  reação do usuário; um comentário com reação usa o rótulo `[E] Nova reação`.
  Responder mostra o comentário-alvo e cria um comentário plano com link para o
  original e menção ao autor. A leitura oculta esse marcador, agrupa a resposta
  sob o comentário-pai e recarrega os detalhes após uma escrita concluída.
- Campo de comentário de aprovação recebe texto configurável, mas nunca envia só
  por abrir o modal ou carregar um template.
- Merge mostra método, head SHA, bloqueios, CI, fila e efeito remoto; não oferece
  bypass administrativo nem exclusão automática da branch.
- Atualizar branch explica o merge da base no head e a possibilidade de conflito.
- Aprovar workflow mostra a origem do código, ator e execução que será liberada.
- Esc primeiro desfoca o input; outro Esc fecha a camada. Draft não é perdido
  silenciosamente: preservá-lo em memória ou perguntar antes de descartar.
- A confirmação mantém sua identidade de PR mesmo se a lista atualizar ao fundo.

### 4.7. Editor de seções

Na tela Git, `[,]` abre as configurações contextuais; a opção GitHub abre um
gerenciador único com abas para seletores de PR, seletores de Issues e
repositórios. O formulário oferece nome, filtros, ordenação, limite e colunas,
além de salvar, renomear, duplicar, reordenar e excluir configuração.
Excluir uma seção nunca fecha PRs nem remove repositórios locais/remotos.
Somente salvar promove a query temporária da busca a uma configuração persistente.
Projetos locais e repositórios remotos são publicados independentemente no
gerenciador, com estado de erro/carregamento próprio. Fechar ou recarregar cancela
a consulta remota anterior; resultados atrasados não alteram a tela atual.
Nos seletores locais, ativações repetidas enquanto a seleção está pendente não
despacham novas operações. Fechar por `[Esc]`, botão ou clique fora retira a
instância: seu resultado não pode fechar um seletor aberto depois. Cliques nos
controles internos continuam funcionando. Fechar a UI não cancela nem desfaz
uma operação Git já iniciada.
Perfis novos começam com `My PRs`, `Review requested`, `All`, `Open` e `Closed`.
Os três filtros de estado cobrem todos os PRs não arquivados, os abertos e os
fechados dentro do escopo atual. Os títulos dos presets permanecem em inglês em
todos os idiomas da interface.

A query preserva espaços e escapes dentro de aspas; referências literais a
qualificadores não alteram seu escopo. Se faltarem aspas de fechamento, a busca
exibe uma orientação traduzida e não envia a consulta incompleta. O rascunho
continua disponível para edição no mesmo modal, sem perder o foco. A validação
vale tanto para `[Enter]` quanto para `[Ctrl+S]`.

## 5. Contrato responsivo

Medidas em células de terminal, não pixels. Estes valores são **pontos de partida
do Tuiminal**, não medições da imagem nem promessas de desempenho já verificadas.

| Condição útil | Composição |
| --- | --- |
| Cabe lista ≥80 colunas, separador e prévia ≥48 | Prévia à direita, inicialmente cerca de 45%, limitada pelos mínimos. |
| Split lateral não cabe, mas altura permite lista ≥6 linhas e prévia ≥8 | Prévia inferior, inicialmente metade da altura disponível. |
| Nenhum split satisfaz os mínimos | Painel único; lista ou prévia, com retorno contextual. |
| Prévia fechada | Tabela ocupa toda a largura e altura úteis. |
| Menos de 40×10 | Estado mínimo legível; sem ações perigosas parcialmente visíveis. |

O cálculo desconta o chrome global real, bordas do modo framed, query e rodapé;
não usar somente `terminal.width < N`. Recalcular também depois de mudar idioma.
Se o usuário escolher direita/baixo, respeitar a preferência quando couber; caso
contrário mostrar o modo viável e restaurar a preferência ao ampliar.

Prioridade de colunas: identidade/título → estado e CI/revisão → repositório →
autor → alterações → atualização/comentários → responsáveis/base/labels. Em lista
multirrepositório o repositório nunca desaparece: passa à segunda linha. Todos os
campos continuam disponíveis na prévia, mesmo quando ocultos na tabela.

## 6. Teclado, foco e mouse

Esta é a proposta do Tuiminal. Letras maiúsculas de ações distintas aparecem como
`Shift+letra`, evitando a ambiguidade entre comentar e fazer checkout.

As telas compartilhadas de instalação/atualização e autenticação do GitHub CLI
mostram um passo a passo ao lado de um mini terminal. `[C]` copia o comando fixo,
`[Enter]` foca o terminal e `[R]` verifica novamente; o mouse alcança os mesmos
controles. Nenhuma tecla executa o comando sugerido: o usuário precisa colá-lo ou
digitá-lo no shell. O Tuiminal apenas detecta a versão ou o login concluído e
recarrega a área remota. Entrada do usuário e respostas de protocolo do emulador
chegam ao PTY; `[Enter]` reabre um shell encerrado sem reutilizar callbacks antigos.

| Contexto | Tecla | Ação |
| --- | --- | --- |
| Git sem editor/modal | `[1]` / `[2]` / `[3]` | Diffs / PR / Issues. Preservar estado ao alternar. |
| PR sem editor/modal | `[A←]` / `[F→]` | Seção anterior / seguinte. |
| Lista | `[j/↓]` / `[k/↑]` | PR seguinte / anterior. |
| Lista | `[g/Home]` / `[Shift+G/End]` | Primeiro / último PR carregado; indicar paginação. |
| Lista | `[l/→]` / `[Enter]` | Abrir e focar prévia. |
| Prévia | `[h/←]` | Voltar à lista. No diff, sair primeiro do diff focado. |
| Prévia | `[j/↓]` / `[k/↑]` | Rolar conteúdo ou navegar commits/arquivos/checks. |
| Painéis | `[Tab]` / `[Shift+Tab]` | Percorrer regiões focáveis; inputs mantêm navegação própria. |
| Prévia fora de editor | `[Ctrl+D]` / `[Ctrl+U]` | Paginar conteúdo. Não enviar formulários. |
| PR fora de editor | `[p]` / `[Shift+P]` | Alternar prévia / posição da prévia. |
| Prévia | `[Z←]` / `[V→]` | Aba interna anterior / seguinte. |
| Visão geral | `[e]` | Expandir/recolher descrição completa. |
| PR | `[/]` | Editar busca; `[Enter]` aplica, `[Esc]` desfoca. |
| PR | `[r]` | Atualizar a seção ativa, preservando seleção por identidade. |
| PR | `[o]` | Abrir PR no navegador. |
| Lista/visão geral | `[y]` / `[Shift+Y]` | Copiar número / URL. |
| Commits | `[y]` | Copiar SHA completo do commit selecionado; rodapé muda o rótulo. |
| PR/arquivo/commit | `[d]` | Abrir o diff correspondente ao contexto. |
| PR | `[Shift+C]` | Preparar checkout local. |
| Menu `[?]` | `[a]` / `[Shift+A]` | Adicionar / remover responsáveis sem conflitar com a navegação de seções. |
| PR | `[c]` / `[v]` | Comentar / aprovar com comentário editável. |
| PR | `[Shift+E]` | Reagir ao PR com uma das cinco opções `[1]`–`[5]`. |
| Atividade | `[j/↓]` / `[k/↑]` | Selecionar comentário anterior / seguinte. |
| Comentário selecionado | `[e]` / `[Enter]` | Reagir / responder ao comentário. |
| PR | `[w]` | Alternar acompanhamento de CI. |
| Checks | `[Ctrl+A]` | Revisar workflows elegíveis para autorização. |
| PR | `[u]` / `[Shift+W]` | Atualizar com base / tornar pronto para revisão. |
| PR | `[m]` / `[x]` / `[Shift+X]` | Preparar merge / fechar / reabrir. |
| Git | `[,]` → GitHub | Gerenciar seletores de PR/Issues e o escopo compartilhado de repositórios. |
| PR | `[?]` | Ajuda e lista completa de ações com disponibilidade/motivo. |
| Formulário | `[Ctrl+S]` | Confirmar somente a operação mostrada. |
| Camada local | `[Esc]` | Desfocar, fechar camada e devolver foco; nunca atravessar camadas. |

Diferença deliberada: gh-dash usa H/L para seções; aqui usamos H/L para foco e
`A←`/`F→` para seções, coerente com o Tuiminal. Esta especificação permanece
limitada a PR; `[3] Issues` é descrito em `git-issues-interface.md`. Ações só
operam no PR ativo, não em seleção em lote.

Mouse: clicar seção/aba/linha/ação; roda no painel apontado; clicar comentário ou
responsável não dispara mutações. Expor todas as operações pelo menu `[?]`/Ações.
Atalho indisponível não executa nada e informa a razão. No input, `[1]`, `[2]`, `[3]`,
`[q]`, letras, pontuação, `[Ctrl+A]` e `[Alt+1]`–`[Alt+5]` permanecem sob o
controle do editor, não da navegação global.

### 6.1. Requisito do GitHub CLI

Quando `gh` não existe ou é anterior a 2.40.0, o dashboard troca seu corpo por
uma composição responsiva: explicação e tutorial à esquerda, mini terminal à
direita; em terminais estreitos os blocos são empilhados. O comando oficial
detectado fica visível para cópia com `[C]`; `[Enter]` ou clique foca um shell PTY
vazio no qual o próprio usuário cola e executa o comando. O Tuiminal nunca injeta
nem executa a instalação. `[Esc]` libera o foco do terminal e a detecção periódica
recarrega a tela quando encontra uma versão compatível. A falta de login mostra o
mesmo passo a passo para `gh auth login --hostname <host> --web`, sem ler ou
persistir token nem entrada do PTY. Ao desmontar, encerra somente o shell criado
por esse painel; a saída atrasada desse processo não pode desconectar um shell novo.

As chamadas automáticas fora desse PTY têm ciclo de vida separado: cancelamento
prévio não cria processo, e timeout/cancelamento aguardam o fechamento do auxiliar
exato. Falha no pipe de entrada não derruba a TUI; uma saída aparentemente bem-sucedida
com entrada incompleta deixa a escrita incerta, sem repetição. O acompanhamento
de CI cancela sua leitura ao parar/desmontar e ignora respostas e timers de uma
instância anterior, mesmo que a mesma identidade/SHA já esteja sendo acompanhada
novamente. Falha da notificação não reinicia um watch concluído.

A paginação dos detalhes libera seu indicador ao trocar de PR. Repetições no
mesmo lote de eventos disparam uma consulta; uma atualização explícita substitui
a página pendente e o debounce inicial. Respostas, falhas e callbacks de outra
seleção não podem substituir o detalhe atual. O cache considera também a data
de atualização, para reler comentários sem exigir um novo commit, e ignora
respostas de consultas já canceladas ou encerradas.

As execuções da aba Checks têm a mesma regra de propriedade: troca de seleção ou
head oculta imediatamente runs/erros anteriores, e uma resposta atrasada não pode
oferecer autorizações pertencentes a outro PR. O texto das linhas da lista é
reutilizado durante a navegação; idioma, largura, colunas ou novos dados invalidam
essa formatação, sem congelar cores ou callbacks de mouse.

## 7. Estados que precisam de tela própria

| Estado | Representação e saída |
| --- | --- |
| `gh` ausente/incompatível | Instrução de instalação/atualização e nova verificação; Diffs continua utilizável. |
| Sem login/SSO pendente | Host identificado, instrução oficial de autenticação, botão verificar; sem pedir token em texto. |
| Sem repo local | PR usa a conta autenticada sem configuração inicial; Diffs permite escolher um repositório local. |
| Sem resultados | Query/escopo visíveis, editar filtros e atualizar; não confundir com erro. |
| Carregando | Preservar linhas anteriores, marcar atualização; skeleton só na primeira carga. |
| Erro parcial | Identificar seção/repo/página que falhou; resultado incompleto nunca aparece como completo. |
| Offline/rate limit | Dados em memória com idade, motivo e instante possível da próxima tentativa. |
| Permissão insuficiente | Leitura disponível quando possível; ação desabilitada com explicação. |
| PR removido/inacessível | Não retargetear para a linha seguinte; fechar o detalhe de forma explícita. |
| Head atualizado durante revisão | Marcar conteúdo antigo; recarregar e reconfirmar ações vinculadas ao commit. |
| Sem checks | `Sem checks`, não sucesso verde. Falha de consulta é `Desconhecido`. |
| Ação em curso | Bloquear repetição, mostrar alvo e andamento; navegar não inicia nova operação. |
| Resultado remoto incerto | Pedir verificação antes de repetir; não assumir sucesso nem reenviar comentário. |
| Notificação indisponível | Toast dentro do app e aviso da limitação do terminal/SO. |

## 8. Critérios visuais de aceite

- [x] Reconhecer a composição do gh-dash sem criar uma sidebar extra permanente.
- [x] Lista e prévia usam toda a área útil; nada sobrepõe rodapé, última linha ou input.
- [x] Testar 40×12, 60×18, 80×24, 120×30, 160×45 e 220×60, nos dois layouts.
- [x] Repetir extremos com PT-BR, inglês, espanhol, japonês, chinês e coreano.
- [x] Rodapé contextual cabe sem imprimir todas as ações ao mesmo tempo.
- [x] Diferenciar foco, seleção, draft, falha, pendência e indisponibilidade sem depender só de cor.
- [x] Navegação rápida não troca a identidade da prévia por uma resposta atrasada.
- [x] Redimensionar preserva PR, aba interna, posição de leitura e texto em edição.
- [x] Confirmar percursos de teclado e mouse no renderer nativo de testes.
- [x] Comparar os frames de caracteres com a referência e registrar diferenças intencionais.

Evidência: `tests/tui/git-pr.test.tsx` cobre o caminho exato de mouse (abas Git,
seção, linha, aba da prévia e ações), layouts lateral/empilhado/painel único e uma
matriz de 44 combinações entre tamanhos, seis idiomas, quatro paletas e dois modos
de chrome. Os frames são inspecionados como texto renderizado, por isso a validação
é determinística e não depende de pixels ou de uma fonte específica.

Diferenças intencionais confirmadas: Diffs/PR/Issues/Inbox pertencem ao Git do Tuiminal; H/L move
o foco e `[A←]`/`[F→]` troca seções; há Commits e Arquivos além das três abas principais;
o Tuiminal fornece gerenciador visual de seções, modo de painel único e não expõe
bypass administrativo nem exclusão automática de branch.

`[1] [C] Git · Diffs` usa exclusivamente um repositório disponível na máquina. O cabeçalho
mostra `projeto / branch` e `[Ctrl+P] Alterar projeto/branch`; o mesmo controle é
a primeira aba do modal Git aberto pelas configurações `[,]`. A troca do alvo
local não muda o escopo remoto, que pode incluir repositórios sem clone local.

`[C]` alterna essa mesma aba para `Git · Comparar`. Antes de haver resultado, três
cartões ficam centralizados para selecionar projeto, branch base e branch comparada.
Quando as escolhas estão completas, telas largas mostram
`[projeto] [branch base] → [branch comparada]` na mesma linha e telas estreitas
empilham os três. `[B]` e `[T]` abrem seletores com branches locais e refs remotas
já conhecidas. O resultado usa `base...comparada`, preserva a branch atual e ignora
alterações não commitadas. Uma árvore agrupada em pastas seleciona um único arquivo
por vez para o diff; `[Tab]`, `[H/L]` e `[←/→]` alternam o foco entre árvore e diff.
A barra de atalhos fica fora e acima do conteúdo rolável, e a visão intralinha
permanece contida no painel.
`[C]` ou `[Esc]` retorna aos Diffs. Todos os cartões, arquivos, pastas e seletores
aceitam mouse.

Em Diffs, `[Tab]` percorre árvore local, diff e terminal Git compacto; `[H/L]` e
`[←/→]` ligam árvore/diff, e `[T]` abre o terceiro foco diretamente. O terminal
fica abaixo da prévia, mantém `git` como prefixo não editável, registra os comandos
produzidos pelas ações, preserva stdout/stderr linha por linha em até 2.000 entradas
e envia argumentos manuais ao executável Git sem montar uma linha de shell.
O campo sugere comandos, opções, branches locais/remotas já conhecidas, tags,
remotes e arquivos alterados. `[Ctrl+N/P]` navega, `[Ctrl+Y]` aplica e `[Esc]`
fecha o popup antes de devolver o foco ao diff; a leitura das refs é local e não
faz `fetch`. `[↑/↓]` e o mouse rolam a saída. `[O]` abre o Log e `[V]` identifica a
visualização ativa. A árvore não acrescenta marcadores geométricos aos arquivos: usa apenas os
dois caracteres nativos do Git, com cores semânticas por coluna e diferencia pastas
por cor.
O atalho de configuração `[Ctrl+P]` respeita o dono atual do teclado: no terminal,
continua sendo a sugestão anterior, e não atravessa modais nem o stage parcial.
Eventos já consumidos, repetições e combinações com modificadores extras não
abrem a configuração local.
Cadeias sem ramificação exibem uma pasta por linha, todas no mesmo recuo, mas são
um único bloco de foco e navegação. Stage/unstage muda o snapshot visual
imediatamente e reconcilia apenas `git status`, sem aguardar o histórico; `[A]`
numa pasta adiciona apenas seus descendentes. `[Space]` alterna stage para o arquivo
selecionado ou para todos os descendentes da pasta como um único grupo. `[D]` abre
uma confirmação com o alvo exato antes de restaurar arquivos rastreados e remover
arquivos novos, também em cadeia quando uma pasta está selecionada.

`[Enter]` em um arquivo da árvore abre e foca seu diff. Com um diff textual rastreado
em foco, `[S]` entra no stage parcial e fixa a visualização unificada. Dois painéis
lado a lado mostram o estado desejado fora/dentro do stage, inclusive hunks que já
estavam no index e podem ser retirados. `[S]` alterna entre hunk e linha sem apagar
transferências pendentes nem retirar o syntax highlight do código. `[H/L]`/`[←/→]`
troca o painel, `[J/K]`/`[↑/↓]` navega e
`[Space]` transfere ou devolve o alvo. O foco fica contido nesses dois painéis:
direções nos limites permanecem no painel mais próximo, `[Tab]` alterna somente entre
eles e o atalho do terminal não escapa. O terminal Git fica oculto e seu espaço é
entregue ao código. A rolagem acompanha o renderable selecionado, não o índice, para
que hunks de alturas diferentes e o último alvo permaneçam acima das ações.
`[Enter]` e `[Esc]` aplicam o estado e saem.
Uma linha azul na lateral esquerda percorre todo o hunk ativo. A aplicação relê os patches staged e unstaged do caminho
literal e rejeita uma seleção obsoleta antes de alterar o index com `git apply --cached`;
mudanças novas, removidas, binárias ou sem hunks não oferecem esse modo.

O primeiro módulo do tutorial de Git é uma réplica inteiramente simulada de `[1] Git · Diffs`.
Ele apresenta a função de cada região visível — aba local, repositório/branch,
arquivos, mini árvore de commits, diff, ações contextuais, terminal e atalhos — e
inclui etapas próprias para stage de arquivo/pasta com `[Space]`, navegação e foco,
troca do projeto/branch com `[Ctrl+P]`, layouts com `[V]`, árvore Git aberta por `[G]`,
Log detalhado por `[O]`, stage parcial por `[S]` e descarte seguro com `[D]`. Uma etapa que explica uma mudança
visual também aplica essa mudança ao demo: `[Ctrl+P]` abre o modal unificado na aba
Diffs com as linhas de projeto e branch, `[G]` substitui o diff pelo grafo completo,
`[O]` mostra o Log enriquecido em blocos expandidos, `[V]` apresenta o código em duas colunas e `[S]` mostra os painéis “FORA DO STAGE” e
“NO STAGE”, ocultando o terminal como no produto. O alvo destacado passa do botão para
o resultado visível enquanto a etapa está ativa. PR, Issues, Inbox, varredura de
projetos, Git real e acesso remoto continuam fora desta fase.

O segundo módulo entra no modo `[C] Git · Comparar` da mesma aba `[1]`. Ele mostra
os três seletores, abre a configuração local compartilhada, apresenta separadamente
os pickers simulados de base e branch comparada com refs locais e remotas já
conhecidas, e explica a direção `base...comparada`. Com as refs aplicadas, o demo
renderiza o cabeçalho `base → comparada`, estatísticas, árvore agrupada de arquivos,
o diff do arquivo selecionado, a troca para duas colunas por `[V]`, a navegação por
`[Tab/H/L/←/→]` e o retorno a Diffs por `[C]` ou `[Esc]`. Os alvos que só existem
nesses estados são declarados como stateful para permanecerem na sequência antes
da troca visual. Nenhuma etapa lista refs reais, executa Git, faz checkout, busca na
rede ou inclui alterações do working tree.

Em layout com moldura, somente o painel realmente focado recebe a borda de acento.
A árvore de arquivos, o Log e a Árvore Git aceitam `[J/K]` e `[↑/↓]` quando seu
painel possui o foco; o histórico local não usa `[N/P]`. Durante a troca de arquivo,
o diff já visível permanece montado até o próximo estar pronto e o cabeçalho
`projeto / branch` não recebe os frames dessa carga, evitando flicker e reflow.
O cabeçalho também não participa da compressão vertical do layout: sua linha
continua reservada quando um diff maior chega durante a repetição das setas.
As regressões conferem o texto efetivamente pintado, além da posição/altura,
em compact e framed; somente verificar que o componente continua montado não
detecta o conteúdo da prévia encobrindo essa linha.
O primeiro snapshot utilizável não espera pelo grafo. O histórico chega em segundo
plano e polls posteriores só repetem `git log --all --numstat` quando a assinatura
das refs muda.

O Log usa o mesmo grafo de topologia colorido da árvore, prolongando suas lanes por
todo o bloco no estilo do `git log`. O cabeçalho mostra hash e referências de
branch/tag; as linhas seguintes mostram pais de merge, autor com e-mail, data
relativa, quantidade de arquivos, estatísticas `+/-`, assunto e corpo limitado da
mensagem. A janela considera a altura real de cada bloco para nunca esconder a
seleção sob o rodapé, e o texto vindo do commit é sanitizado antes da renderização.

Desde 2026-09-08, a última linha solicita a próxima página com loader no
scrollbox, `[R]` e o intervalo configurado renovam todas as seções e a mesma
profundidade já carregada, e o editor de query oferece autocomplete por
`[Ctrl+N/P]` e `[Ctrl+Y]`. O Inbox irmão é
especificado em `git-inbox-interface.md`.

Carregamentos que substituem um painel inteiro usam a superfície plasma ASCII
compartilhada com a mensagem de estado em primeiro plano e saída por dissolução
curta. Esse tratamento não se aplica ao loader incremental da lista nem ao
refresh automático, pois o conteúdo anterior continua utilizável nesses casos.
Caches de contexto local e seções remotas são LRU limitados a 64 entradas; caches
de detalhes de PR e Issue são limitados a 32 e pertencem à sessão que os descarta.

Qualquer alteração posterior de atalhos, densidade, posição ou confirmação deve
atualizar este documento e seus testes, sem alegar que é comportamento do gh-dash.

Desde 2026-09-10, checkout de PR e Issue compartilha uma guarda pelo clone
canônico. Falha/timeout de status ou metadata Git, index/gitdir inválido,
operação em andamento e qualquer alteração ocorrida durante a confirmação
bloqueiam o despacho. O clone é inspecionado novamente depois da única chamada ao
`gh`; pós-condição ilegível e limite de saída depois do despacho são estados
incertos, nunca um convite a repetir automaticamente.

## Contratos de dados, persistência e ações

Diffs continua offline e é independente do contexto remoto. Ler PRs não exige
checkout; somente a ação explícita de checkout pode mudar o clone selecionado.
Modelos, serviços e estado de [Issues](./git-issues-interface.md) e
[Inbox](./git-inbox-interface.md) permanecem separados.

- O perfil de PR usa `$XDG_CONFIG_HOME/tuiminal/git-pr.yaml`, com fallback para
  `~/.config/tuiminal/git-pr.yaml`, escrita atômica e modo `0600`. Preferências,
  seletores e caminhos locais persistem; corpos remotos, drafts e caches não.
  Configuração inválida deve produzir erro sem substituir o arquivo por defaults.
- Sem perfil explícito, um `origin` GitHub reconhecido seleciona esse repositório;
  fora dele, a busca usa o escopo autenticado da conta. Uma lista de repositórios
  explicitamente vazia também significa conta, nunca uma busca GitHub global.
- Uma ação prepara a identidade exata (host, conta, repositório, node ID, número,
  head SHA e geração de autenticação), reautentica, relê elegibilidade, confirma,
  executa uma vez e reconcilia. Timeout, cancelamento, stdin incompleto ou limite
  de saída após despacho não provam falha: o resultado fica incerto, sem retry.
- Chamadas automatizadas passam argumentos e stdin ao `gh`, sem interpolação em
  shell, leitura de tokens ou troca global de conta. O PTY guiado do usuário tem
  ciclo de vida separado desse transporte.
- Merge usa `--match-head-commit`, sem `--admin` nem `--delete-branch`, e respeita
  os métodos permitidos. Fila/auto-merge não equivalem a merge concluído; a
  confirmação final depende do estado remoto. Update branch usa
  `expected_head_sha`; a revisão de aprovação fixa `commit_id`.
- Checkout nunca faz clone, stash, reset ou clean automático, nem executa código
  do PR. Além da guarda canônica descrita acima, exige remote compatível e árvore
  limpa, incluindo staged, unstaged e untracked.
- Aprovar uma execução de workflow só é oferecido para um run elegível da seleção
  atual. Proteção de deployment encaminha ao navegador, sem alegar aprovação.
  Watches pertencem à identidade e tentativa observadas; parar um watch cancela
  sua leitura e invalida callbacks atrasados, inclusive notificações e timers.

## Verificação mantida

O gate é `bun run check`. As regressões de configuração, runtime, ações e
transporte estão em `tests/git-pr-config.test.ts`, `tests/git-pr-runtime.test.ts`,
`tests/git-pr-actions.test.ts` e `tests/github-transport.test.ts`. Discussões,
descarte de recursos e watches têm suítes próprias; `tests/tui/` cobre a interface
real, incluindo terminal guiado, foco, renderização e tutoriais simulados.
Leituras/escritas remotas usam fixtures ou `gh` falso, nunca a conta do usuário.

Para investigar custo de listagem/renderização, o cenário reproduzível permanece
em `bun scripts/benchmark-git-pr.ts`. Meça novamente no checkout em análise; números
de uma execução antiga não são garantia de latência para a versão atual.
