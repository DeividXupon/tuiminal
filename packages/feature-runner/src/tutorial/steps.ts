export const RUNNER_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-runner-workspace",
    group: "1 · COMANDOS",
    title: "Bem-vindo ao Runner",
    description:
      "Execute comandos e acompanhe processos por projeto. Este tour usa dados simulados: não executa comandos nem altera arquivos. [Enter] avança, [←] volta e [Esc] sai.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-projects",
    group: "1 · COMANDOS",
    title: "Projetos em abas",
    description:
      "[N] abre o seletor de projetos ou pastas. [1–4] troca de aba e [X] fecha a atual. Trocar ou fechar abas mantém os processos vivos; sair do Tuiminal os encerra.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-commands",
    group: "1 · COMANDOS",
    title: "Comandos do projeto",
    description:
      "A lista reúne comandos detectados e salvos. [↑/↓] seleciona, [D] atualiza a descoberta. O nome fica acima do comando; o indicador mostra o estado da execução.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-running",
    group: "1 · COMANDOS",
    title: "Iniciar um comando",
    description:
      "[Enter], [Space] ou um clique inicia o comando selecionado. Aqui dev:api está rodando: o log mostra a saída e o cabeçalho separa execução de saúde do serviço.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-stopped",
    group: "1 · COMANDOS",
    title: "Parar e executar novamente",
    description:
      "Ative o mesmo comando para pará-lo. Durante o encerramento, novas ativações não fazem nada. Depois, o indicador fica interrompido e você pode iniciar uma nova execução.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-manual",
    group: "1 · COMANDOS",
    title: "Comando manual e salvamento",
    description:
      "[/] foca o campo de comando. [Enter] executa; [Ctrl+S] abre o salvamento para reutilizar depois. Salvar uma definição não a executa. PTY interativo é uma opção explícita do comando salvo.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-processes",
    group: "2 · PROCESSOS E LOGS",
    title: "Processos ativos",
    description:
      "[P] alterna comandos e processos. Selecione uma execução para acompanhar seu log. O estado, o código de saída e as cores distinguem sucesso, falha, encerramento e interrupção.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-logs",
    group: "2 · PROCESSOS E LOGS",
    title: "Ler e guardar logs",
    description:
      "[L/→] foca o log; [H/←] retorna à lista. [J/K] rola, [V] troca o stream e [T] alterna horários. [Y] copia, [Ctrl+X] exporta e [C] limpa o log selecionado.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-filter",
    group: "2 · PROCESSOS E LOGS",
    title: "Filtrar a saída",
    description:
      "No log, [F] abre o filtro; em Multi, use [Shift+F]. Digite um termo e [Enter] aplica. Aqui apenas linhas com GET aparecem. [Esc] fecha o campo e devolve o foco ao log.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-ports",
    group: "2 · PROCESSOS E LOGS",
    title: "Portas do processo",
    description:
      "Quando há portas detectadas, selecione uma para abrir a URL com [O] ou copiá-la com [U]. No workspace integrado, [H] envia a URL ao HTTP. Este endereço é apenas ilustrativo.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-history",
    group: "2 · PROCESSOS E LOGS",
    title: "Consultar execuções anteriores",
    description:
      "[S] expande o histórico quando há altura disponível. Selecionar uma execução anterior mostra seu resultado e log, sem executá-la novamente. [S] recolhe o painel.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-multi",
    group: "2 · PROCESSOS E LOGS",
    title: "Vários logs lado a lado",
    description:
      "[Shift+M] alterna Single e Multi. Cada painel acompanha uma execução. [←/→] seleciona processos; [A←/F→] desloca a janela de painéis. O tamanho do terminal determina quantos cabem.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-focus",
    group: "2 · PROCESSOS E LOGS",
    title: "Escolher o painel de trabalho",
    description:
      "[M] abre a seleção de boxes. Setas ou [H/J/K/L] movem a seleção; [Enter] ou clique confirma o foco. [Esc] ou [M] cancela. Escolher um painel não inicia nem para comandos.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-palette",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Todas as ações do Runner",
    description:
      "[?] abre a paleta pesquisável com ações e atalhos. Ações indisponíveis explicam o motivo. [Esc] sai da busca primeiro e depois fecha a paleta. Abrir ou pesquisar não executa comandos.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-environment",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Perfis para novas execuções",
    description:
      "[E] alterna os perfis disponíveis para o comando selecionado. O perfil vale para novas execuções; processos em andamento não mudam. Defina env e envFile em profiles no YAML.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-yaml",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Editar o YAML do Runner",
    description:
      "[Ctrl+Y] abre comandos, flows e profiles. O arquivo fica na configuração global do Tuiminal, separado por projeto. [Ctrl+S] valida e salva o texto; [Esc] sai sem salvar. Recomendações não inserem nem executam comandos.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-validation",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Validar antes de salvar",
    description:
      "YAML inválido, referências ausentes e ciclos impedem o salvamento. Aqui o flow aponta para missing: corrija o ID antes de salvar. Conflitos com edições externas também são preservados, nunca sobrescritos.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-flows",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Coordenar comandos com flows",
    description:
      "Flows organizam etapas: comandos da mesma etapa rodam em paralelo. completed aguarda sucesso; started aguarda início e saúde, quando configurada. Dependências compartilhadas rodam uma vez por plano.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-flow-running",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Acompanhar e controlar um flow",
    description:
      "Na lista de configuração, [Ctrl+R] executa o flow, [Ctrl+K] para e [Ctrl+T] reinicia após encerrar suas execuções. Falhas bloqueiam dependentes pendentes. Parar cancela etapas, probes e reinícios desse flow.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-trust",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Revisar o início automático",
    description:
      "Autostart exige autostart: true e aprovação da configuração material. Revise comandos, pastas, perfis, nomes de variáveis, arquivos de ambiente, PTY e políticas. Alterações relevantes exigem nova aprovação; editar suspende o autostart.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-runner-finale",
    group: "3 · CONFIGURAÇÃO E FLOWS",
    title: "Voltar ao seu projeto",
    description:
      "Você viu comandos, processos, logs e flows sem executar nada. Ao concluir, suas abas e execuções reais continuam como estavam. Reabra este tutorial nas configurações do Runner quando precisar.",
    kind: "block",
    stateful: true,
  },
] as const
