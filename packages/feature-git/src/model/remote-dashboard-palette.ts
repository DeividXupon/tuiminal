import {
  chooseBoxPaletteAction,
  type GitRemotePaletteAction,
  remotePaletteAction,
} from "./remote-palette"

export type RemoteDashboardPaletteId =
  | "open-preview"
  | "back-to-list"
  | "toggle-description"
  | "comment-react"
  | "comment-reply"
  | "open-browser"
  | "copy-number"
  | "copy-url"
  | "edit-query"
  | "refresh"
  | "create"
  | "choose-box"

export type RemoteDashboardPaletteState = {
  focus: "list" | "preview"
  hasSelection: boolean
  canCreate: boolean
  overviewTab: boolean
  /** The activity tab has a selected comment that can receive a reaction or reply. */
  activityComment: boolean
  /** Untranslated noun-specific texts. */
  copy: {
    selectItem: string
    create: string
    createDescription: string
  }
}

/**
 * Workspace commands shared by the PR and Issue keyboard models. Pure navigation keys
 * (`[J/K]`, `[A←]`/`[F→]`, `[Z←]`/`[V→]`) keep working but are not listed in the palette.
 */
export type RemoteDashboardCommand =
  | { type: "focus"; target: "list" | "preview" }
  | {
      type:
        | "toggle-description"
        | "open-browser"
        | "copy-number"
        | "copy-url"
        | "edit-query"
        | "refresh"
    }

const COMMANDS: Partial<Record<RemoteDashboardPaletteId, RemoteDashboardCommand>> = {
  "open-preview": { type: "focus", target: "preview" },
  "back-to-list": { type: "focus", target: "list" },
  "toggle-description": { type: "toggle-description" },
  "open-browser": { type: "open-browser" },
  "copy-number": { type: "copy-number" },
  "copy-url": { type: "copy-url" },
  "edit-query": { type: "edit-query" },
  refresh: { type: "refresh" },
}

/** The keyboard command for a palette row; `create` and comment rows stay workspace-owned. */
export function remoteDashboardCommand(id: string): RemoteDashboardCommand | null {
  return COMMANDS[id as RemoteDashboardPaletteId] ?? null
}

function listActions(state: RemoteDashboardPaletteState) {
  const list = state.focus !== "list" && "Foque a lista"
  const selection = !state.hasSelection && state.copy.selectItem
  return [
    remotePaletteAction(
      {
        id: "open-preview",
        shortcut: "[L/Enter]",
        label: "Abrir prévia",
        description: "Foca a prévia do item selecionado.",
        tags: ["list"],
      },
      list,
      selection,
    ),
    remotePaletteAction(
      {
        id: "open-browser",
        shortcut: "[O]",
        label: "Abrir no navegador",
        description: "Abre o item selecionado no navegador configurado.",
        tags: ["list"],
        key: { name: "o" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "copy-number",
        shortcut: "[Y]",
        label: "Copiar número",
        description: "Copia o número do item selecionado.",
        tags: ["list"],
        key: { name: "y" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "copy-url",
        shortcut: "[Shift+Y]",
        label: "Copiar URL",
        description: "Copia o endereço do item selecionado.",
        tags: ["list"],
        key: { name: "y", shift: true },
      },
      selection,
    ),
  ]
}

function previewActions(state: RemoteDashboardPaletteState) {
  const preview = state.focus !== "preview" && "Foque a prévia"
  const selection = !state.hasSelection && state.copy.selectItem
  return [
    remotePaletteAction(
      {
        id: "back-to-list",
        shortcut: "[H/←]",
        label: "Voltar à lista",
        description: "Devolve o foco para a lista.",
        tags: ["preview"],
      },
      preview,
    ),
    remotePaletteAction(
      {
        id: "toggle-description",
        shortcut: "[E]",
        label: "Expandir descrição",
        description: "Mostra ou recolhe a descrição completa.",
        tags: ["preview"],
        key: { name: "e" },
      },
      preview,
      !state.overviewTab && "Disponível na aba de visão geral",
      selection,
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

function sharedActions(state: RemoteDashboardPaletteState) {
  return [
    chooseBoxPaletteAction(),
    remotePaletteAction({
      id: "edit-query",
      shortcut: "[/]",
      label: "Editar busca",
      description: "Altera a consulta da seção atual.",
      tags: ["view"],
    }),
    remotePaletteAction({
      id: "refresh",
      shortcut: "[R]",
      label: "Atualizar",
      description: "Recarrega a seção preservando a seleção.",
      tags: ["app"],
      key: { name: "r" },
    }),
    remotePaletteAction(
      {
        id: "create",
        shortcut: "[Ctrl+N]",
        label: state.copy.create,
        description: state.copy.createDescription,
        tags: ["app"],
        key: { name: "n", ctrl: true },
      },
      !state.canCreate && "Criação indisponível neste escopo",
    ),
  ]
}

export function remoteDashboardPaletteActions(
  state: RemoteDashboardPaletteState,
): GitRemotePaletteAction<RemoteDashboardPaletteId>[] {
  return [...listActions(state), ...previewActions(state), ...sharedActions(state)]
}
