export const TERMINAL_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-terminal-workspace",
    group: "1 · O BÁSICO",
    title: "Bem-vindo ao Term Agents",
    description:
      "Isto aqui é um terminal de verdade: shell, lazygit, servidor de dev, o que der na telha. O Tuiminal só organiza a bagunça. Tudo neste tour é de mentirinha, então explore sem medo.",
    hint: "[Enter] avança · [←] volta · [Esc] sai do tour",
    kind: "block",
  },
  {
    targetId: "tutorial-terminal-pane",
    group: "1 · O BÁSICO",
    title: "O terminal em si",
    description:
      "Cada painel é um PTY completo, de borda a borda, sem moldura atrapalhando. Pode trocar de ferramenta à vontade: os processos continuam rodando enquanto você não está olhando.",
    kind: "block",
  },
  {
    targetId: "tutorial-terminal-metadata",
    group: "1 · O BÁSICO",
    title: "Onde eu estou mesmo?",
    description:
      "Esta faixa mostra a pasta, a branch e se o repositório está Limpo ou Alterado. Ela acompanha cada cd e não rouba espaço da saída do terminal.",
    hint: "Passe o mouse em cada etiqueta para ver a explicação.",
    kind: "control",
  },
  {
    targetId: "tutorial-terminal-sessions",
    group: "1 · O BÁSICO",
    title: "Suas sessões",
    description:
      "Cada seção numerada mostra nome, estado e um contexto útil, como a pasta ou o comando, além de native ou tmux. O nome segue o programa: abriu o lazygit no zsh, virou lazygit.",
    hint: "Clique em uma sessão para ir direto até ela.",
    kind: "block",
  },
  {
    targetId: "tutorial-terminal-new",
    group: "1 · O BÁSICO",
    title: "Novo terminal",
    description:
      "Abre um shell novinho em uma seção própria, dentro da pasta Tuiminais. Cabem até 12 terminais por workspace, o que já é bastante aba para esquecer aberta.",
    hint: "Atalho: Master Key + [N]",
    kind: "action",
  },
  {
    targetId: "terminal-dialog",
    group: "1 · O BÁSICO",
    title: "Rodar um comando",
    description:
      "O botão Comando roda qualquer linha no shell do sistema, do jeitinho que você escreveu. Quando o processo termina, a saída fica guardada para conferir depois, como o bun test da lista.",
    hint: "[Enter] roda · [Esc] cancela",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-folders",
    group: "1 · O BÁSICO",
    title: "Pastas tmux e Outros",
    description:
      "Além de Tuiminais, a pasta tmux reúne painéis de servidores tmux que já existiam e Outros mostra terminais de outros apps. Clique numa pasta para recolher; o estado fica salvo por projeto.",
    kind: "control",
  },
  {
    targetId: "tutorial-terminal-master-key",
    group: "2 · A MASTER KEY",
    title: "A chave mestra",
    description:
      "Como o terminal captura quase todas as teclas, os atalhos do Tuiminal ficam atrás da Master Key. Apertou duas vezes? Ela vai para o shell, sem drama.",
    hint: "Padrão: [Ctrl+B] · troque em [,] → Terminal",
    kind: "action",
  },
  {
    targetId: "terminal-actions",
    group: "2 · A MASTER KEY",
    title: "Menu de ações",
    description:
      "Depois da Master Key aparece este menu com todas as ações, cada uma com uma descrição curta e etiquetas como TERMINAL, AGENTE ou NAVEGAÇÃO. Esqueceu um atalho? É só olhar aqui.",
    hint: "[/] filtra · [↑/↓] navega · [Enter] executa · [Esc] fecha",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-sidebar",
    group: "2 · A MASTER KEY",
    title: "Pulo rápido com [1]–[9]",
    description:
      "Com o menu aberto, os nove primeiros itens visíveis da lateral ganham números. Digite o número e pronto: você já está na sessão, sem navegar por nada.",
    hint: "[Shift+L] foca a lateral · [↑/↓] e [Enter] também funcionam",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "terminal-command-input",
    group: "2 · A MASTER KEY",
    title: "Renomear e fechar",
    description:
      "[E] dá um nome manual ao terminal, que deixa de seguir o programa até o fim da sessão. [X] fecha a sessão selecionada sem cerimônia.",
    hint: "[Enter] salva · [Esc] cancela",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "terminal-focus-selection-prompt",
    group: "2 · A MASTER KEY",
    title: "Escolher onde focar",
    description:
      "[M] entra no modo de seleção: a caixa atual fica azul e as outras escurecem. Use as setas ou [H/J/K/L] para escolher e [Enter] para focar. Vale para lateral, terminais, histórico e Live Diff.",
    hint: "[Esc] volta para onde você estava",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-split",
    group: "3 · DIVIDINDO A TELA",
    title: "Dois painéis lado a lado",
    description:
      "Uma seção comporta até dois terminais, lado a lado ou empilhados, com um único separador. Aqui o servidor de dev roda à esquerda e o lazygit à direita. Fechou um? O outro ocupa o espaço.",
    kind: "block",
  },
  {
    targetId: "terminal-split-dialog",
    group: "3 · DIVIDINDO A TELA",
    title: "Dividir à direita ou abaixo",
    description:
      "[C] divide à direita e [Shift+H] abaixo. Você escolhe entre um shell novo e um agente que já está rodando, que muda de lugar sem reiniciar nem perder nada.",
    hint: "[↑/↓] escolhe · [Enter] confirma · [Esc] cancela",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-agents",
    group: "4 · AGENTES",
    title: "A turma dos agentes",
    description:
      "Codex, Claude Code e OpenCode ganham uma lista só deles, separada entre Local e Remoto. Cada um mostra o estado (trabalhando, esperando você, concluído) e o título da tarefa.",
    hint: "Se um agente fora da tela termina ou trava, chega uma notificação.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-agent-pane",
    group: "4 · AGENTES",
    title: "O agente trabalhando",
    description:
      "O agente roda na TUI oficial dele, então você digita e aprova tudo ali mesmo. O Tuiminal só observa os eventos públicos, sem ler raciocínio privado nem enviar nada por você.",
    hint: "A etiqueta Local ou Remoto mostra onde o agente está rodando.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "terminal-dialog-agent-provider",
    group: "4 · AGENTES",
    title: "Chamar um agente",
    description:
      "[A] abre a escolha do provedor: Codex, Claude Code ou OpenCode. Escolheu? O próximo passo é dizer em qual projeto ele vai trabalhar.",
    hint: "Atalho: Master Key + [A]",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-project-picker",
    group: "4 · AGENTES",
    title: "Em qual projeto?",
    description:
      "A lista junta projetos recentes, repositórios Git encontrados por perto e a pasta inicial. A busca roda em segundo plano e só lê nomes de pastas, nunca o conteúdo.",
    hint: "[↑/↓] escolhe · [Enter] inicia · [P] procura pasta · [E] ambiente",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-folder-search",
    group: "4 · AGENTES",
    title: "Procurar uma pasta",
    description:
      "Não achou na lista? [P] abre a busca: digite a partir de ~/, as sugestões aparecem enquanto você escreve e [Tab] completa o caminho. Nem precisa ser um repositório Git.",
    hint: "[Tab] completa · [Enter] usa a pasta · [Esc] volta",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "terminal-dialog-project-environments",
    group: "4 · AGENTES",
    title: "Local ou num servidor",
    description:
      "[E] escolhe onde o agente vai rodar: na sua máquina ou num servidor, usando um alias SSH do seu ~/.ssh/config. A escolha vale só para esse lançamento.",
    hint: "Os detalhes da conexão continuam no seu OpenSSH.",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "terminal-agent-panel",
    group: "4 · AGENTES",
    title: "Retomar conversas",
    description:
      "No menu da Master Key, as abas Global, Codex, Claude e OpenCode organizam conversas locais e remotas pela última interação, com projeto, branch e última resposta. [Enter] retoma exatamente de onde parou.",
    hint: "[←/→ H/L] alterna Ações/Agentes · [Z←] [→V] troca provedor",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-history",
    group: "5 · DE OLHO NO AGENTE",
    title: "Mensagens enviadas",
    description:
      "[S] abre, abaixo do agente, uma tabela com tudo que você pediu: há quanto tempo, quanto durou, se tinha imagem, áudio ou skill e qual modelo respondeu.",
    hint: "[J/K] navega · [Enter] abre · [X] fecha",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-history-detail",
    group: "5 · DE OLHO NO AGENTE",
    title: "O que rolou naquele turno",
    description:
      "Ao abrir uma mensagem, o painel cresce e mostra [M] o pedido completo, [R] a resposta, [A] a atividade e [D] os arquivos e o diff daquele turno.",
    hint: "[Esc] volta para a tabela",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-live-diff",
    group: "5 · DE OLHO NO AGENTE",
    title: "Diff ao vivo",
    description:
      "[D] abre o Live Diff ao lado do agente: o que mudou no repositório, em tempo real e só para leitura. Ele observa, não acusa: nem tudo que aparece ali foi o agente que fez.",
    hint: "Atalho: Master Key + [D] · [X] fecha",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-live-diff-files",
    group: "5 · DE OLHO NO AGENTE",
    title: "Arquivos alterados",
    description:
      "Cada linha traz o tipo da mudança (New, Edit, Delete…), o caminho, há quanto tempo mudou e as linhas somadas e removidas. O mais recente fica no topo e pisca em azul quando muda.",
    hint: "[J/K] escolhe o arquivo · [Enter] foca o código",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-live-diff-code",
    group: "5 · DE OLHO NO AGENTE",
    title: "O código mudando",
    description:
      "O patch do arquivo aparece aqui, e as linhas que acabaram de surgir ficam em azul. Com Show auto ligado, o painel segue sozinho o arquivo mais novo; escolher outro pausa esse modo.",
    hint: "[J/K] rola · [H/L] meia tela · [Esc] volta a seguir o mais novo",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-live-diff-info",
    group: "5 · DE OLHO NO AGENTE",
    title: "Totais e projetos",
    description:
      "O rodapé soma arquivos, adições e remoções e lista os projetos observados. [H/L] destaca um projeto e [N] mostra ou esconde os arquivos dele, sem parar a observação.",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "live-diff-project-picker",
    group: "5 · DE OLHO NO AGENTE",
    title: "Observar outro projeto",
    description:
      "[A] adiciona um projeto vizinho ao mesmo Live Diff, como o painel admin que o agente também anda mexendo. Dá para ficar de olho em até quatro projetos ao mesmo tempo.",
    hint: "Digite para filtrar · [Enter] adiciona · [Esc] fecha",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-companions",
    group: "5 · DE OLHO NO AGENTE",
    title: "Tudo junto e misturado",
    description:
      "Histórico e Live Diff convivem: o diff fica à direita e o histórico divide só a coluna do terminal. Cada sessão guarda os próprios painéis, então trocar de agente não bagunça nada.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-pinned",
    group: "6 · AVANÇADO",
    title: "Lateral fixada",
    description:
      "[B] fixa a lateral à esquerda do app: ela continua visível no Git, no HTTP e em qualquer ferramenta. Clicou num agente? Você volta direto para ele.",
    hint: "Dentro do tmux, a lateral vira um painel em cada janela.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-tmux",
    group: "6 · AVANÇADO",
    title: "tmux sem medo",
    description:
      "Com tmux 3.2+ instalado, os terminais sobrevivem quando você fecha o app e voltam na próxima vez. Painéis tmux de fora aparecem como espelhos, sem matar nem reiniciar a origem.",
    hint: "Sem tmux, o terminal nativo assume e tudo continua funcionando.",
    kind: "control",
  },
  {
    targetId: "tutorial-terminal-remote-agent",
    group: "6 · AVANÇADO",
    title: "Agente num servidor",
    description:
      "Agentes remotos rodam no servidor via SSH, mas a TUI fica aqui com você. A etiqueta Remoto e o grupo com o nome do alias mostram onde cada um está, e o Live Diff lê direto do servidor.",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-sync-tag",
    group: "6 · AVANÇADO",
    title: "Trazer o projeto para casa",
    description:
      "Esta etiqueta diz se a cópia local está em dia com o servidor. Master Key + [R] compara tudo e, na primeira vez, pergunta onde salvar, como ~/projetos/lojinha-sync.",
    kind: "control",
    stateful: true,
  },
  {
    targetId: "terminal-project-sync-preview",
    group: "6 · AVANÇADO",
    title: "Revisar antes de copiar",
    description:
      "Antes de copiar qualquer coisa, você vê o que é novo, alterado, removido ou está em conflito. Conflito quer dizer que a cópia local também mudou e será substituída, por isso o aviso.",
    hint: "[←/→] páginas · [Enter] sincroniza · [Esc] cancela",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "terminal-project-sync-progress",
    group: "6 · AVANÇADO",
    title: "Sincronizando",
    description:
      "Só arquivos novos ou alterados passam pelo SSH, com verificação e backup de cada troca. Se algo der errado, ou se você cancelar, tudo volta a ser como era.",
    hint: "[Esc] cancela com segurança",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "terminal-project-sync-automatic-control",
    group: "6 · AVANÇADO",
    title: "Sincronização automática",
    description:
      "[A] liga a sincronização automática: a cada turno concluído pelo agente, a cópia local se atualiza sozinha. Só os erros fazem barulho.",
    hint: "A preferência fica salva por projeto remoto.",
    kind: "action",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-remote-setup",
    group: "6 · AVANÇADO",
    title: "Preparar um servidor",
    description:
      "Em [,] → Conexão remota, Configurar servidor abre um shell SSH com este guia embaixo. Ele confere o GitHub e o Codex e mostra os comandos, mas quem digita é você.",
    hint: "[Enter] confere de novo · [Esc] volta ao terminal",
    kind: "block",
    stateful: true,
  },
  {
    targetId: "tutorial-terminal-finale",
    group: "6 · AVANÇADO",
    title: "Agora é com você",
    description:
      "Resumindo: Master Key para tudo, [Alt+1–5] troca de ferramenta e [,] abre as configurações. Na dúvida, aperte a Master Key e leia o menu. Bom terminal!",
    hint: "Este tour fica em [,] → Tutorial sempre que precisar.",
    kind: "block",
    stateful: true,
  },
] as const
