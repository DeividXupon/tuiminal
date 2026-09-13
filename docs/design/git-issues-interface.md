# Interface Git Issues

Especificação do workspace `[3] Issues`, implementado a partir do gh-dash e
ajustado às regras de foco, segurança e responsividade do Tuiminal.

## Anatomia

```text
┌ [1] [C] GIT · DIFFS  [2] PR  [3] ISSUES  [4] INBOX ─────────────────────┐
│ ISSUES                                      github.com · @viewer          │
│ [A←] My Issues 12 [F→]                                                  │
│ [/] is:open author:@me       TODOS OS PROJETOS · 20/42 · ATUALIZADO     │
├───────────────────────────────┬───────────────────────────────────────────┤
│ ▶ ◆ owner/api #318 Título 6 ♥4│ owner/api #318 · Título                  │
│     @autor · → @ana · bug      │ [VISÃO GERAL] [ATIVIDADE]               │
│   ◆ owner/web #204 Outro 3 ♥8 │ [O] Abrir [Y] nº [Shift+Y] URL [?] Ações│
│     @rui · → @viewer · a11y    │ descrição, metadados ou comentários     │
└───────────────────────────────┴───────────────────────────────────────────┘
 [J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [Z←] [V→] Aba  [P] Prévia  [?] Ações
```

As seções ficam horizontais; não existe sidebar permanente de repositórios. A
query permanece visível. Duas linhas mantêm densidade sem esconder autoria,
responsáveis e labels.
Um perfil novo começa com `My Issues`, `All`, `Open` e `Closed`. Os três filtros
de estado cobrem todas as issues não arquivadas, as abertas e as fechadas dentro
do escopo atual. Os presets permanecem em inglês em todos os idiomas, sem impedir
que o usuário crie e nomeie outros seletores.

A busca compartilha com PRs a leitura de frases entre aspas: texto literal não
é tratado como filtro de conta/repositório. Aspas abertas geram uma orientação
traduzida antes do envio; o texto permanece editável e focado no mesmo modal,
tanto ao aplicar com `[Enter]` quanto ao salvar com `[Ctrl+S]`.

A lista reutiliza a formatação das linhas enquanto seus dados, largura, colunas
e idioma não mudarem. Mover a seleção ou trocar a paleta não refaz a conversão de
datas e o truncamento de todas as linhas; cores e cliques continuam atualizados.

## Composições responsivas

- Larga (`≥118 × 22`): lista à esquerda e prévia à direita.
- Média (`≥76 × 20`): lista acima e prévia abaixo.
- Estreita: um painel; `[L/→/Enter]` abre a prévia e `[H/←/Esc]` volta.
- Posição forçada só vale quando o conteúdo mínimo cabe; senão usa painel único.
- `[P]` oculta a prévia e devolve foco à lista; `[Shift+P]` alterna a preferência
  persistida por projeto.

## Foco, camadas e estados

- Lista: `[J/K]`, setas, `[G/Home]` e `[Shift+G/End]`.
- Seções: `[A←]`/`[F→]`; `[/]` edita a query ativa. Criação, edição, ordem e
  repositórios ficam no modal Git aberto por `[,]` nas configurações do Git.
- Prévia: `[Z←]`/`[V→]` alterna abas; na Visão geral `[J/K]` rola e `[E]`
  expande/recolhe a descrição. Na Atividade, `[J/K]` seleciona comentários,
  `[E]` reage e `[Enter]` responde ao selecionado.
- `[Shift+E]` reage à issue. O seletor de reação usa `[1]`–`[5]` para
  👍 ❤️ 🎉 😄 👀, mostra contagens e identifica a reação já adicionada. Se o
  comentário já possui alguma reação, o controle contextual diz `[E] Nova reação`.
- `[?]` mostra disponibilidade e motivo de todas as ações.
- Inputs detêm letras, números e atalhos globais. `[Esc]` primeiro desfoca, depois
  fecha o modal e nunca atravessa duas camadas no mesmo evento.
- Estado aberto/fechado tem símbolo e texto; cor é apenas reforço.
- Markdown remoto é sanitizado e vira texto terminal; HTML não é executado e
  imagens não são baixadas.
- Carregando, vazio, autenticação ausente, `gh` incompatível, erro parcial,
  permissão insuficiente e resultado incerto são estados distintos.
- Seleção é preservada por host + node ID; uma issue removida da seção não é
  silenciosamente substituída por outra identidade.

## Diferenças deliberadas do gh-dash

- `[H/L]` é foco; seções usam `[A←]`/`[F→]`.
- Labels usa `[Shift+L]`, sem conflitar com `[L]` para abrir a prévia.
- Escritas exigem `[Ctrl+S]` e revalidação; não há comandos arbitrários ou lote.
- Reações relêem e validam o node/URL exato antes e depois de uma única mutação.
  Respostas são comentários planos com link validado e menção ao autor, porque a
  API de Issue Comments não oferece respostas encadeadas. A Atividade interpreta
  esse vínculo, oculta o marcador técnico e mostra cada resposta recuada logo sob
  o comentário-pai; uma escrita concluída recarrega os detalhes selecionados.
- Checkout não clona e opera somente em clone local elegível, sob a mesma guarda
  canônica e fail-closed de PR; erro de inspeção ou mudança após confirmação
  impede o despacho.
- Diffs, PR e Issues são áreas separadas e com estado independente.
- A última linha inicia a próxima página com loader; o refresh automático cobre
  todas as seções e a profundidade já carregada sem limpar a lista, e a query tem
  autocomplete do GitHub.
- O carregamento inicial e o de detalhes ocupam o painel com plasma ASCII e texto
  legível, dissolvendo rapidamente quando os dados chegam. Paginação e refresh
  permanecem inline.
- `gh` ausente, antigo ou sem login substitui o conteúdo por explicação e um mini
  terminal responsivo. `[C]` copia o comando e `[Enter]`/mouse foca o shell; o
  usuário cola e executa. O Tuiminal nunca injeta o comando, apenas valida versão
  ou autenticação e recarrega Issues ao final. O PTY recebe também respostas de
  protocolo do emulador e `[Enter]` reabre um shell encerrado.
- A paginação dos detalhes libera o indicador ao trocar de issue e não duplica
  consultas em acionamentos do mesmo lote. Atualizar explicitamente substitui
  páginas e debounce anteriores; respostas e callbacks de uma seleção antiga
  não podem substituir a atual nem retornar ao cache após cancelamento.

## Persistência, escopo e segurança das ações

- O perfil usa `$XDG_CONFIG_HOME/tuiminal/git-issues.yaml`, com fallback para
  `~/.config/tuiminal/git-issues.yaml`, escrita atômica, modo `0600` e chave por
  raiz canônica do projeto. Não substitua configuração inválida silenciosamente.
- Sem perfil explícito, a seleção de repositório/conta segue a mesma regra de
  [PRs](./git-pr-interface.md). Toda busca exige `is:issue` e `archived:false`;
  `is:pr` é rejeitado. Uma lista salva vazia significa escopo da conta.
- Escritas incluem comentário, atribuição/remoção de responsáveis, deltas de
  labels, `gh issue develop --checkout`, fechar e reabrir. Prepare host, node ID,
  repositório, número, estado, `updatedAt` e geração de autenticação; reautentique,
  releia, execute uma vez e reconcilie o alvo. Depois do despacho, um resultado
  incerto não autoriza repetir a mutação.
- Labels e responsáveis usam os detalhes completos, nunca apenas o resumo da
  busca. Argumentos e stdin são explícitos; checkout mantém a guarda compartilhada
  de clone/remote/árvore limpa e nunca cria um clone automaticamente.
- Caches de seções são LRU limitados a 64 entradas e detalhes a 32, pertencentes
  à sessão. Cancelamento ou descarte impedem uma resposta tardia de repovoá-los.

## Verificação mantida

`bun run check` inclui `tests/git-issues.test.ts`, `tests/git-issue-config.test.ts`,
`tests/git-issue-actions.test.ts`, `tests/git-reactions.test.ts` e a cobertura real
em `tests/tui/git-issues.test.tsx`. Leituras e mutações usam fixtures/`gh` falso;
não executam ações na conta do usuário. O tutorial de Git cobre somente Diffs e
Compare, não este workspace remoto.
