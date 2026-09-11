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
Um perfil novo começa somente com `My Issues`; o preset permanece em inglês em
todos os idiomas, sem impedir que o usuário crie e nomeie outros seletores.

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
- Prévia: `[Z←]`/`[V→]` alterna abas; `[J/K]` rola; `[Ctrl+D/U]` pagina; `[E]`
  expande/recolhe a descrição.
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
  ou autenticação e recarrega Issues ao final.
