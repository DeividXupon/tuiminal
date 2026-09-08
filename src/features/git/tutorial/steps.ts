export const GIT_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-git-mode-tabs",
    group: "GIT · NAVEGAÇÃO",
    title: "Diffs locais, Pull Requests, Issues e Inbox",
    description:
      "Diffs usa um projeto e branch locais e funciona offline. PR, Issues e Inbox montam a integração GitHub somente quando você abre [2], [3] ou [4].",
    hint: "[1] Diffs · [C] compara branches · [2] PR · [3] Issues · [4] Inbox · [Ctrl+P] troca projeto/branch local",
    kind: "control",
  },
  {
    targetId: "tutorial-git-inbox",
    group: "INBOX · NOTIFICAÇÕES",
    title: "Sua caixa de entrada do GitHub",
    description:
      "Revisões solicitadas, atribuições e menções chegam numa fila paginada que atualiza em segundo plano.",
    hint: "[J/K] navega · [M] marca lida · [B] salva · [D] conclui · ações remotas não rodam no tour",
    kind: "action",
  },
  {
    targetId: "tutorial-git-issues",
    group: "ISSUES · FILA E AÇÕES",
    title: "Issues no estilo gh-dash",
    description:
      "Seções e queries organizam issues de toda a conta em uma lista densa com descrição, atividade, responsáveis, labels e reações na prévia.",
    hint: "[C] comenta · [A] atribui · [Shift+L] edita labels · [Shift+C] cria a branch · [X] fecha",
    kind: "action",
  },
  {
    targetId: "tutorial-git-sections",
    group: "PR · ORGANIZAÇÃO",
    title: "Seções e filtros",
    description:
      "Agrupe PRs de vários repositórios por autor, revisão, responsável, CI, branch ou label e salve a ordem por projeto.",
    hint: "[</>] muda seção · [/] filtra · seletores e repositórios ficam em [,] Config",
    kind: "control",
  },
  {
    targetId: "tutorial-git-pr-list",
    group: "PR · LISTA",
    title: "Fila multirrepositório",
    description:
      "Cada linha mostra identidade, estado, revisão, CI e alterações. A seleção continua apontando para o mesmo PR após atualizar.",
    hint: "[J/K] ou [↑/↓] navega · [R] atualiza · [N] carrega mais",
    kind: "block",
  },
  {
    targetId: "tutorial-git-preview-tabs",
    group: "PR · PRÉVIA",
    title: "Cinco abas de contexto",
    description:
      "Visão geral, Checks, Atividade, Commits e Arquivos carregam detalhes paginados sem alterar o checkout local.",
    hint: "[[]/[]] troca aba · [H/L] move foco · [P] muda a posição da prévia",
    kind: "control",
  },
  {
    targetId: "tutorial-git-actions",
    group: "PR · AÇÕES SEGURAS",
    title: "Leitura, revisão e escrita",
    description:
      "Copie ou abra o PR diretamente. Ações remotas exibem alvo, commit e elegibilidade antes da confirmação explícita.",
    hint: "[D] diff · [?] ações · [W] acompanhar CI · nenhuma escrita ocorre no tour",
    kind: "action",
  },
  {
    targetId: "tutorial-git-diff",
    group: "PR · DIFF E CI",
    title: "Diff remoto e acompanhamento",
    description:
      "O diff usa os SHAs do PR, alterna modo unificado, lado a lado e intralinha, e distingue checks, workflows e deployments.",
    hint: "[J/K] rola · [[]/[]] muda hunk · [V] muda modo · [Esc] volta",
    kind: "block",
  },
] as const
