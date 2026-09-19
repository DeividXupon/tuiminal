export const GIT_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-git-diffs-tab",
    group: "ABA [1] · DIFFS",
    title: "Workspace Git local",
    description:
      "A aba [1] reúne as alterações do repositório local. Ela funciona sem GitHub e é a tela apresentada nesta primeira parte do tutorial.",
    kind: "control",
  },
  {
    targetId: "tutorial-git-repository",
    group: "DIFFS · REPOSITÓRIO",
    title: "Projeto e branch ativos",
    description:
      "Este cabeçalho identifica o repositório e a branch usados pelo workspace e resume arquivos alterados, stage e distância do remoto.",
    kind: "block",
  },
  {
    targetId: "tutorial-git-local-configuration",
    group: "DIFFS · PROJETO LOCAL",
    title: "Trocar projeto ou branch",
    description:
      "[Ctrl+P] abre as configurações do Git diretamente no item Diffs. Nele você escolhe qualquer repositório Git local e uma branch já existente sem alterar o escopo de PR, Issues ou Inbox.",
    hint: "[Enter] abre o item focado",
    kind: "action",
  },
  {
    targetId: "tutorial-git-files",
    group: "DIFFS · ARQUIVOS",
    title: "Árvore de alterações",
    description:
      "Este painel organiza pastas e arquivos modificados. As duas colunas de status distinguem o que já está no stage do que continua no working tree.",
    kind: "block",
  },
  {
    targetId: "tutorial-git-stage-toggle",
    group: "DIFFS · STAGE",
    title: "Adicionar ou remover do stage",
    description:
      "Na árvore de arquivos, [Space] alterna o stage do arquivo selecionado. Em uma pasta, a mesma ação adiciona ou remove todos os arquivos descendentes em conjunto.",
    kind: "action",
  },
  {
    targetId: "tutorial-git-mini-graph",
    group: "DIFFS · HISTÓRICO",
    title: "Mini árvore de commits",
    description:
      "Este bloco mantém uma visão compacta dos commits e branches recentes sem ocupar a área principal de código.",
    kind: "block",
  },
  {
    targetId: "tutorial-git-open-graph",
    group: "DIFFS · ÁRVORE ABERTA",
    title: "Árvore Git em tela cheia",
    description:
      "[G] expande a árvore na área principal para mostrar o histórico completo e como os commits e branches se conectam.",
    hint: "[J/K] navega · [Enter] abre o commit · [G] volta ao diff",
    kind: "action",
  },
  {
    targetId: "tutorial-git-open-log",
    group: "DIFFS · LOG",
    title: "Histórico detalhado de commits",
    description:
      "[O] abre blocos de histórico atravessados pelo grafo. Cada commit mostra hash, branches e tags, pais de merge, autor e e-mail, data relativa, estatísticas de arquivos e linhas, assunto e corpo da mensagem.",
    hint: "[J/K] navega · [Enter] abre o commit · [D] volta ao diff · [G] abre a árvore",
    kind: "action",
  },
  {
    targetId: "tutorial-git-diff",
    group: "DIFFS · CÓDIGO",
    title: "Visualização do diff",
    description:
      "O maior painel mostra somente o arquivo selecionado, com linhas antigas e novas, hunks, adições, remoções e syntax highlight.",
    kind: "block",
  },
  {
    targetId: "tutorial-git-diff-layout",
    group: "DIFFS · VISUALIZAÇÃO",
    title: "Três layouts para o diff",
    description:
      "[V] alterna entre unificado, lado a lado e intralinha. Essa escolha muda somente a apresentação do código e não altera o conteúdo no stage.",
    kind: "action",
  },
  {
    targetId: "tutorial-git-actions",
    group: "DIFFS · AÇÕES",
    title: "Ações do contexto atual",
    description:
      "Esta faixa reúne as ações disponíveis para o arquivo ou visualização em foco e muda conforme o contexto da tela.",
    kind: "action",
  },
  {
    targetId: "tutorial-git-partial-stage",
    group: "DIFFS · STAGE PARCIAL",
    title: "Selecionar hunks ou linhas",
    description:
      "Com um diff de texto rastreado em foco, [S] separa o que está fora do stage do que entrará nele, inclusive mudanças que já estavam no stage.",
    hint: "[S] alterna hunk/linha · [Space] transfere · [H/L] troca painel · [J/K] navega · [Enter/Esc] aplica e sai",
    kind: "action",
  },
  {
    targetId: "tutorial-git-discard",
    group: "DIFFS · SEGURANÇA",
    title: "Descartar alterações",
    description:
      "[D] abre uma confirmação para o arquivo ou pasta selecionado. Ao confirmar, alterações rastreadas são restauradas e arquivos novos dentro do alvo são removidos.",
    kind: "action",
  },
  {
    targetId: "tutorial-git-terminal",
    group: "DIFFS · TERMINAL",
    title: "Terminal de comandos Git",
    description:
      "Este painel registra os comandos Git disparados pela interface, preserva a saída original e também aceita argumentos Git digitados manualmente.",
    kind: "block",
  },
  {
    targetId: "tutorial-git-navigation",
    group: "DIFFS · NAVEGAÇÃO",
    title: "Mover o foco pelo workspace",
    description:
      "[Enter] abre e foca o diff do arquivo selecionado. [Tab] percorre árvore, diff e terminal; [H/L/←/→] move para o painel vizinho e [Shift+H/L/←/→] rola linhas largas lateralmente.",
    kind: "control",
  },
  {
    targetId: "tutorial-git-shortcuts",
    group: "DIFFS · AJUDA",
    title: "Atalhos disponíveis",
    description:
      "A última linha resume os atalhos válidos no estado atual, para que você não precise memorizar toda a navegação.",
    kind: "control",
  },
  {
    targetId: "tutorial-git-compare-tab",
    group: "ABA [1] · COMPARAR",
    title: "Comparar branches sem checkout",
    description:
      "[C] troca a área local de Diffs para Comparar dentro da mesma aba [1]. A comparação não muda a branch ativa nem toca nas alterações do working tree.",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-selectors",
    group: "COMPARAR · SELETORES",
    title: "Projeto, base e comparação",
    description:
      "Os três cartões definem o repositório local, a branch base e a branch comparada. O resultado aparece automaticamente quando as duas refs são diferentes.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-project",
    group: "COMPARAR · PROJETO",
    title: "Trocar projeto ou branch",
    description:
      "[Ctrl+P] abre a configuração local compartilhada com Diffs. Trocar o projeto redefine as refs disponíveis para a comparação sem alterar o escopo remoto de PR, Issues ou Inbox.",
    hint: "[Enter] abre o item focado",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-base",
    group: "COMPARAR · BASE",
    title: "Escolher a branch base",
    description:
      "[B] abre as refs locais e remotas que o repositório já conhece. A base representa o ponto de partida usado para calcular as mudanças.",
    hint: "[/] filtra · [J/K] navega · [Enter] seleciona · [Esc] volta",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-compared",
    group: "COMPARAR · BRANCH COMPARADA",
    title: "Escolher a branch comparada",
    description:
      "[T] escolhe a ref cujas mudanças você quer revisar. O seletor inclui branches locais e remotas já conhecidas, mas nunca busca novas refs pela rede.",
    hint: "[/] filtra · [J/K] navega · [Enter] seleciona · [Esc] volta",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-range",
    group: "COMPARAR · INTERVALO",
    title: "Entender base...comparada",
    description:
      "A seta representa o intervalo base...comparada, equivalente à visão de um Pull Request: mostra o que a branch comparada introduziu desde o ancestral comum com a base.",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-summary",
    group: "COMPARAR · RESULTADO",
    title: "Resumo da comparação",
    description:
      "O cabeçalho confirma a direção base → comparada e resume arquivos, adições e remoções. Somente commits das refs entram neste resultado; mudanças locais ficam de fora.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-files",
    group: "COMPARAR · ARQUIVOS",
    title: "Árvore de arquivos comparados",
    description:
      "A árvore agrupa por pasta todos os arquivos alterados no intervalo. Selecione um arquivo para renderizar apenas o diff dele no painel vizinho.",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-diff",
    group: "COMPARAR · CÓDIGO",
    title: "Visualização do diff",
    description:
      "O painel de código mostra o arquivo selecionado com hunks, linhas antigas e novas, adições, remoções e syntax highlight, sem misturar alterações não commitadas.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-layout",
    group: "COMPARAR · VISUALIZAÇÃO",
    title: "Três layouts para o diff",
    description:
      "[V] alterna a comparação entre unificado, duas colunas e intralinha. Nesta demonstração, o próprio resultado muda para duas colunas.",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-navigation",
    group: "COMPARAR · NAVEGAÇÃO",
    title: "Mover o foco pelo resultado",
    description:
      "[Tab], [H/L] ou [←/→] alternam entre a árvore e o diff. Com o painel em foco, [J/K] ou [↑/↓] rolam verticalmente; [Shift+H/L] ou [Shift+←/→] percorrem linhas largas até o fim.",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-git-compare-return",
    group: "COMPARAR · VOLTAR",
    title: "Voltar aos Diffs",
    description:
      "[C] ou [Esc] encerra a comparação e devolve a aba [1] ao workspace Diffs. Nenhuma branch é trocada e nenhum arquivo é modificado.",
    kind: "action",
    stateful: true,
  },
] as const
