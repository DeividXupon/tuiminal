import {
  type GitRemotePaletteAction,
  type GitTabPaletteId,
  gitTabPaletteActions,
  chooseBoxPaletteAction,
  orderRemotePaletteActions,
  remotePaletteAction,
} from "../remote-palette"

export type InboxPaletteId =
  | GitTabPaletteId
  | "list"
  | "preview"
  | "open"
  | "read"
  | "save"
  | "done"
  | "unsubscribe"
  | "refresh"
  | "choose-box"
  | "comment-react"
  | "comment-reply"
  | "conversation-overview"
  | "conversation-activity"

export type InboxPaletteState = {
  focus: "list" | "preview"
  /** Present only when a notification is selected. */
  selected: { unread: boolean; saved: boolean } | null
  navigation: boolean
  conversation?: boolean
  activityComment?: boolean
}

const SELECT = "Selecione uma notificação"

function listActions(state: InboxPaletteState) {
  const list = state.focus !== "list" && "Foque a lista"
  return [
    remotePaletteAction(
      {
        id: "preview",
        shortcut: "[L/Enter]",
        label: "Abrir prévia",
        description: "Foca a prévia da notificação.",
        tags: ["list"],
      },
      list,
      !state.selected && SELECT,
    ),
    remotePaletteAction(
      {
        id: "list",
        shortcut: "[H/←]",
        label: "Voltar à lista",
        description: "Devolve o foco para a lista.",
        tags: ["preview"],
      },
      state.focus !== "preview" && "Foque a prévia",
    ),
  ]
}

function notificationActions(state: InboxPaletteState) {
  const selection = !state.selected && SELECT
  return [
    remotePaletteAction(
      {
        id: "open",
        shortcut: "[O]",
        label: "Abrir no navegador",
        description: "Abre a conversa no navegador configurado.",
        tags: ["list"],
        key: { name: "o" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "save",
        shortcut: "[B]",
        label: state.selected?.saved ? "Remover dos salvos" : "Salvar notificação",
        description: "Guarda a notificação na seção Salvas deste computador.",
        tags: ["list"],
        key: { name: "b" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "read",
        shortcut: "[Shift+M]",
        label: "Marcar como lida",
        description: "Marca a notificação como lida no GitHub.",
        tags: ["github"],
        key: { name: "m", shift: true },
      },
      selection,
      state.selected && !state.selected.unread && "A notificação já está lida",
    ),
    remotePaletteAction(
      {
        id: "done",
        shortcut: "[D]",
        label: "Concluir notificação",
        description: "Remove a notificação do Inbox após confirmação.",
        tags: ["github"],
        key: { name: "d" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "unsubscribe",
        shortcut: "[U]",
        label: "Deixar de acompanhar",
        description: "Cancela a inscrição na conversa após confirmação.",
        tags: ["github"],
        key: { name: "u" },
      },
      selection,
    ),
  ]
}

function sharedActions() {
  return [
    chooseBoxPaletteAction(),
    remotePaletteAction({
      id: "refresh",
      shortcut: "[R]",
      label: "Atualizar",
      description: "Recarrega as notificações.",
      tags: ["app"],
      key: { name: "r" },
    }),
  ]
}

function conversationActions(state: InboxPaletteState) {
  if (!state.conversation) return []
  const preview = state.focus !== "preview" && "Foque a prévia"
  return [
    ...(["overview", "activity"] as const).map((tab) =>
      remotePaletteAction({
        id: `conversation-${tab}`,
        shortcut: "[Z←/V→]",
        label: tab === "overview" ? "VISÃO GERAL" : "ATIVIDADE",
        description: "Foca a prévia da notificação.",
        tags: ["preview"],
      }),
    ),
    remotePaletteAction(
      {
        id: "comment-react",
        shortcut: "[E]",
        label: "Reagir ao comentário",
        description: "Escolhe uma reação para o comentário selecionado.",
        tags: ["preview"],
        key: { name: "e" },
      },
      preview,
      !state.activityComment && "Selecione um comentário na atividade",
    ),
    remotePaletteAction(
      {
        id: "comment-reply",
        shortcut: "[Enter]",
        label: "Responder comentário",
        description: "Escreve uma resposta ao comentário selecionado.",
        tags: ["preview"],
      },
      preview,
      !state.activityComment && "Selecione um comentário na atividade",
    ),
  ]
}

export function inboxPaletteActions(
  state: InboxPaletteState,
): GitRemotePaletteAction<InboxPaletteId>[] {
  return orderRemotePaletteActions<InboxPaletteId>(
    [
      ...listActions(state),
      ...notificationActions(state),
      ...conversationActions(state),
      ...sharedActions(),
      ...gitTabPaletteActions("inbox", state.navigation),
    ],
    state.focus,
  )
}
