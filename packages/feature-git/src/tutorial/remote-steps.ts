const PR_STEPS = [
  [
    "tab",
    "GitHub e escopo remoto",
    "[2] abre PRs da conta e dos repositórios configurados. O projeto local é independente. Fora do tutorial, as abas remotas precisam do gh autenticado; aqui todos os dados são fictícios.",
  ],
  [
    "sections",
    "Filas de Pull Requests",
    "[A←] e [F→] alternam as seções. Cada fila tem seus filtros; [,] abre as configurações de seções, conta e repositórios.",
  ],
  [
    "search",
    "Buscar Pull Requests",
    "[/] abre a query da seção. Combine is:open, repo: e review-requested: com autocomplete; [Enter] aplica a busca dentro do escopo escolhido.",
  ],
  [
    "list",
    "Selecionar um Pull Request",
    "[J/K] seleciona um PR e carrega sua prévia. A lista resume revisão, CI e mudanças; chegar ao fim carrega mais resultados. [R] atualiza lista e detalhes.",
  ],
  [
    "overview",
    "Ler a visão geral do PR",
    "[L/Enter] foca a prévia; [H/Esc] volta à lista. [Z←] e [V→] trocam suas abas. Visão geral reúne descrição, branches e revisores; [E] expande o texto e [O] abre no navegador.",
  ],
  [
    "checks",
    "Acompanhar checks",
    "Checks mostra sucesso, falha e execução pendente. Ações de acompanhamento e autorização ficam em [?]; autorizar um workflow exige confirmação explícita.",
  ],
  [
    "activity",
    "Conversar no Pull Request",
    "Atividade reúne comentários, revisões e eventos. [J/K] seleciona uma entrada; em comentários, [E] abre reações e [Enter] prepara uma resposta. [Ctrl+S] confirma o envio no formulário.",
  ],
  [
    "commits",
    "Inspecionar commits do PR",
    "Commits mostra hash, autor e mensagem. [J/K] seleciona, [Y] copia o SHA completo e [D] abre o diff do commit selecionado.",
  ],
  [
    "files",
    "Revisar arquivos do PR",
    "Arquivos lista caminhos e linhas alteradas. [D] abre o diff selecionado; [V] muda o layout e [Esc] retorna à prévia. Esta etapa mostra um diff fictício.",
  ],
  [
    "create",
    "Preparar um novo PR",
    "[Ctrl+N] abre repositório, branches remotas, título, descrição e draft. [Ctrl+S] confirma a criação; a branch precisa existir no GitHub, pois este formulário não faz push.",
  ],
  [
    "review",
    "Revisar e confirmar ações",
    "[?] reúne comentários, aprovação, labels, checkout e merge, com motivos para ações indisponíveis. O formulário identifica o PR e exige [Ctrl+S]. Se o resultado for incerto, confira o GitHub antes de repetir.",
  ],
] as const

const ISSUE_STEPS = [
  [
    "tab",
    "Entrar nas Issues",
    "[3] abre Issues com filtros e seleção próprios. A conta e os repositórios definem o escopo remoto; mudar o projeto em Diffs não troca esse escopo.",
  ],
  [
    "sections",
    "Filtrar filas de Issues",
    "[A←] e [F→] percorrem My Issues, All, Open e Closed. [/] edita a query com autocomplete; [,] permite configurar seções e repositórios.",
  ],
  [
    "list",
    "Selecionar uma Issue",
    "[J/K] percorre título, estado, autor, responsáveis e labels. A prévia acompanha a seleção; o fim da lista carrega mais itens e [R] atualiza lista e detalhes.",
  ],
  [
    "overview",
    "Ler os detalhes da Issue",
    "[L/Enter] entra na prévia e [H/Esc] retorna. Visão geral mostra descrição e metadados; [E] expande o texto, [O] abre no navegador e [Shift+E] reage à Issue.",
  ],
  [
    "activity",
    "Responder aos comentários",
    "[Z←] e [V→] alternam Visão geral e Atividade. [J/K] seleciona comentários, [E] abre reações e [Enter] prepara uma resposta vinculada ao comentário.",
  ],
  [
    "create",
    "Preparar uma nova Issue",
    "[Ctrl+N] abre o formulário mesmo com a lista vazia. Escolha repositório, título e descrição; [Ctrl+S] confirma a criação. O rascunho permanece em memória.",
  ],
  [
    "actions",
    "Fazer a triagem da Issue",
    "[?] mostra ações e permissões. [A] atribui, [Shift+L] altera labels, [X] fecha e [Shift+X] reabre. Cada alteração remota abre seu formulário para confirmar com [Ctrl+S].",
  ],
] as const

const INBOX_STEPS = [
  [
    "tab",
    "Entrar na caixa do GitHub",
    "[4] reúne notificações da conta no host configurado. Inbox usa suas próprias filas; os filtros de busca de PR e Issues não limitam essas notificações.",
  ],
  [
    "sections",
    "Organizar as notificações",
    "[A←] e [F→] alternam Inbox, Review, Assigned, Mentioned e Saved. [J/K] seleciona uma conversa e o fim da lista carrega mais notificações.",
  ],
  [
    "list",
    "Distinguir lidas e não lidas",
    "● indica não lida, ○ lida e ★ salva. [Shift+M] marca como lida e mantém a linha na lista. [R] atualiza as notificações e a conversa selecionada.",
  ],
  [
    "activity",
    "Ler a conversa na Inbox",
    "[L/Enter] abre a prévia; [H/Esc] volta. [Z←] e [V→] alternam descrição e atividade de PRs e Issues. Nos comentários, [E] reage e [Enter] prepara uma resposta; [O] abre o assunto no navegador.",
  ],
  [
    "save",
    "Guardar para depois",
    "[B] alterna o salvamento local. A estrela e a seção Saved ajudam a retomar a conversa; salvar não altera a assinatura no GitHub.",
  ],
  [
    "done",
    "Concluir uma notificação",
    "[D] abre esta confirmação com a conversa selecionada. [Ctrl+S] remove a notificação da caixa de entrada do GitHub; [Esc] cancela. Não fecha a Issue nem o PR.",
  ],
  [
    "unsubscribe",
    "Parar de acompanhar",
    "[U] prepara o cancelamento da assinatura da conversa. [Ctrl+S] confirma que o GitHub deve parar de enviar suas atualizações; [Esc] cancela. Neste tutorial nenhuma ação é enviada.",
  ],
] as const

export const GIT_REMOTE_TUTORIAL_STEPS = [
  ...PR_STEPS.map(([view, title, description]) => ({
    targetId: `tutorial-git-pr-${view}`,
    group: "ABA [2] · PULL REQUESTS",
    tab: "pr" as const,
    view,
    title,
    description,
    kind: "block" as const,
    stateful: true as const,
  })),
  ...ISSUE_STEPS.map(([view, title, description]) => ({
    targetId: `tutorial-git-issues-${view}`,
    group: "ABA [3] · ISSUES",
    tab: "issues" as const,
    view,
    title,
    description,
    kind: "block" as const,
    stateful: true as const,
  })),
  ...INBOX_STEPS.map(([view, title, description]) => ({
    targetId: `tutorial-git-inbox-${view}`,
    group: "ABA [4] · INBOX",
    tab: "inbox" as const,
    view,
    title,
    description,
    kind: "block" as const,
    stateful: true as const,
  })),
] as const

export type GitRemoteTutorialStep = (typeof GIT_REMOTE_TUTORIAL_STEPS)[number]
