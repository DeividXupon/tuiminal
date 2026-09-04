export const GIT_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-git-mode-tabs",
    group: "GIT · NAVEGAÇÃO",
    title: "Base local e Pull Requests",
    description:
      "A Base preserva o Git local e funciona offline. PR monta a integração GitHub somente quando você abre [2].",
    hint: "[1] Base · [2] PR · os dois workspaces preservam o próprio estado",
    kind: "control",
  },
  {
    targetId: "tutorial-git-sections",
    group: "PR · ORGANIZAÇÃO",
    title: "Seções e filtros",
    description:
      "Agrupe PRs de vários repositórios por autor, revisão, responsável, CI, branch ou label e salve a ordem por projeto.",
    hint: "[</>] muda seção · [/] filtra · [S] configura · [+] adiciona repositório",
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
    hint: "[[/]] troca aba · [H/L] move foco · [P] muda a posição da prévia",
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
    hint: "[J/K] rola · [[/]] muda hunk · [V] muda modo · [Esc] volta",
    kind: "block",
  },
] as const
