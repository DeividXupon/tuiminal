export const TERMINAL_ACTION_TAG_LABELS = {
  feature: "FEATURE",
  agent: "AGENTE",
  terminal: "TERMINAL",
  sidebar: "SIDEBAR",
  navigation: "NAVEGAÇÃO",
  app: "APP",
} as const

export type TerminalActionTag = keyof typeof TERMINAL_ACTION_TAG_LABELS

export type TerminalAction = {
  key: string
  label: string
  description: string
  tags: readonly TerminalActionTag[]
}

export const TERMINAL_ACTIONS = [
  {
    key: "a",
    label: "[A] Novo Codex",
    description: "Inicia o Codex integrado ao app-server local.",
    tags: ["agent"],
  },
  {
    key: "s",
    label: "[S] Mensagens enviadas",
    description: "Mostra o histórico público da conversa Codex.",
    tags: ["feature", "agent"],
  },
  {
    key: "d",
    label: "[D] Live Diff",
    description: "Abre ou foca as alterações do agente.",
    tags: ["feature", "agent"],
  },
  {
    key: "m",
    label: "[M] Escolher box",
    description: "Navega visualmente entre os boxes abertos.",
    tags: ["feature"],
  },
  {
    key: "n",
    label: "[N] Novo terminal",
    description: "Abre um shell em uma nova seção.",
    tags: ["terminal"],
  },
  {
    key: "v",
    label: "[V] Dividir lado",
    description: "Divide a seção atual para a direita.",
    tags: ["terminal"],
  },
  {
    key: "h",
    label: "[H] Dividir abaixo",
    description: "Divide a seção atual para baixo.",
    tags: ["terminal"],
  },
  {
    key: "e",
    label: "[E] Renomear terminal",
    description: "Define um nome persistente para o terminal.",
    tags: ["terminal"],
  },
  {
    key: "x",
    label: "[X] Fechar terminal",
    description: "Fecha o terminal atual.",
    tags: ["terminal"],
  },
  {
    key: "b",
    label: "[B] Fixar / soltar barra",
    description: "Mantém ou libera a barra lateral global.",
    tags: ["sidebar"],
  },
  {
    key: "l",
    label: "[L] Focar barra lateral",
    description: "Move o foco para a navegação lateral.",
    tags: ["sidebar"],
  },
  {
    key: "alt+1",
    label: "[Alt+1] Banco",
    description: "Abre a ferramenta de banco de dados.",
    tags: ["navigation"],
  },
  {
    key: "alt+2",
    label: "[Alt+2] Git",
    description: "Abre a ferramenta Git.",
    tags: ["navigation"],
  },
  {
    key: "alt+3",
    label: "[Alt+3] Runner",
    description: "Abre o executor de tarefas.",
    tags: ["navigation"],
  },
  {
    key: "alt+4",
    label: "[Alt+4] HTTP",
    description: "Abre o cliente HTTP.",
    tags: ["navigation"],
  },
  {
    key: "alt+5",
    label: "[Alt+5] Free Terminal",
    description: "Volta para o workspace de terminais.",
    tags: ["navigation"],
  },
  {
    key: ",",
    label: "[,] Configurações",
    description: "Abre as configurações do Tuiminal.",
    tags: ["app"],
  },
  {
    key: "q",
    label: "[Q] Sair do Tuiminal",
    description: "Encerra o Tuiminal com segurança.",
    tags: ["app"],
  },
  {
    key: "escape",
    label: "[Esc] Cancelar",
    description: "Fecha a Master Key e volta ao terminal.",
    tags: ["app"],
  },
] as const satisfies readonly TerminalAction[]
