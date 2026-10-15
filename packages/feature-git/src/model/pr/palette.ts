import type { ActionPaletteKey } from "@xupon/tuiminal-core/ui/action-palette"
import {
  type RemoteDashboardPaletteId,
  type RemoteDashboardPaletteState,
  remoteDashboardPaletteActions,
} from "../remote-dashboard-palette"
import {
  type GitRemotePaletteAction,
  type GitTabPaletteId,
  gitTabPaletteActions,
  orderRemotePaletteActions,
  remotePaletteAction,
} from "../remote-palette"
import type { PullRequestActionAvailability, PullRequestActionKind } from "./actions"
import type { PullRequestPreviewTab } from "./types"

export type PullRequestMutation = {
  kind: PullRequestActionKind
  label: string
  shortcut: string
  key: ActionPaletteKey
}

/** Pull request writes, in menu order. Keys match `pullRequestActionKindForShortcut`. */
export const PULL_REQUEST_MUTATIONS: readonly PullRequestMutation[] = [
  { kind: "comment", label: "Comentar", shortcut: "[C]", key: { name: "c" } },
  { kind: "reaction", label: "Reagir", shortcut: "[Shift+E]", key: { name: "e", shift: true } },
  { kind: "approve", label: "Aprovar com comentário", shortcut: "[V]", key: { name: "v" } },
  { kind: "assign", label: "Adicionar responsável", shortcut: "[A]", key: { name: "a" } },
  {
    kind: "unassign",
    label: "Remover responsável",
    shortcut: "[Shift+A]",
    key: { name: "a", shift: true },
  },
  {
    kind: "ready",
    label: "Marcar draft como pronto",
    shortcut: "[Shift+W]",
    key: { name: "w", shift: true },
  },
  { kind: "close", label: "Fechar", shortcut: "[X]", key: { name: "x" } },
  { kind: "reopen", label: "Reabrir", shortcut: "[Shift+X]", key: { name: "x", shift: true } },
  {
    kind: "checkout",
    label: "Checkout local",
    shortcut: "[Shift+C]",
    key: { name: "c", shift: true },
  },
  { kind: "update-branch", label: "Atualizar com a base", shortcut: "[U]", key: { name: "u" } },
  { kind: "merge", label: "Merge", shortcut: "[Shift+M]", key: { name: "m", shift: true } },
  {
    kind: "approve-workflow",
    label: "Autorizar workflow",
    shortcut: "[Ctrl+A]",
    key: { name: "a", ctrl: true },
  },
]

export type PullRequestPaletteId =
  | RemoteDashboardPaletteId
  | GitTabPaletteId
  | "open-diff"
  | "toggle-watch"
  | "copy-sha"
  | `mutation:${PullRequestActionKind}`

export type PullRequestPaletteState = Omit<RemoteDashboardPaletteState, "overviewTab" | "copy"> & {
  previewTab: PullRequestPreviewTab
  detailsReady: boolean
  watching: boolean
  /** The commits tab has a selected commit. */
  selectedCommit: boolean
  /** Availability per write; empty until details and authentication load. */
  availability: ReadonlyMap<PullRequestActionKind, PullRequestActionAvailability>
  navigation: boolean
}

export function pullRequestMutationKind(id: string): PullRequestActionKind | null {
  return id.startsWith("mutation:") ? (id.slice(9) as PullRequestActionKind) : null
}

function mutationActions(state: PullRequestPaletteState) {
  return PULL_REQUEST_MUTATIONS.map((mutation) => {
    const availability = state.availability.get(mutation.kind)
    return remotePaletteAction(
      {
        id: `mutation:${mutation.kind}` as const,
        shortcut: mutation.shortcut,
        label: mutation.label,
        description: "Prepara a operação no GitHub para revisão e confirmação.",
        tags: ["github"],
        key: mutation.key,
      },
      !state.hasSelection && "Selecione um pull request",
      !availability && "Carregando detalhes do pull request",
      availability && !availability.enabled && (availability.reason ?? "Ação indisponível."),
    )
  })
}

function itemActions(state: PullRequestPaletteState) {
  const selection = !state.hasSelection && "Selecione um pull request"
  return [
    remotePaletteAction(
      {
        id: "open-diff",
        shortcut: "[D]",
        label: "Abrir diff",
        description: "Mostra o diff do PR, commit ou arquivo da prévia.",
        tags: ["list"],
        key: { name: "d" },
      },
      selection,
      !state.detailsReady && "Carregando detalhes do pull request",
    ),
    remotePaletteAction(
      {
        id: "toggle-watch",
        shortcut: "[W]",
        label: state.watching ? "Parar de acompanhar CI" : "Acompanhar CI",
        description: "Notifica quando os checks do PR terminarem.",
        tags: ["list"],
        key: { name: "w" },
      },
      selection,
    ),
    remotePaletteAction(
      {
        id: "copy-sha",
        shortcut: "[Y]",
        label: "Copiar SHA do commit",
        description: "Copia o SHA completo do commit selecionado.",
        tags: ["preview"],
      },
      state.focus !== "preview" && "Foque a prévia",
      !state.selectedCommit && "Selecione um commit na aba de commits",
    ),
  ]
}

export function pullRequestPaletteActions(
  state: PullRequestPaletteState,
): GitRemotePaletteAction<PullRequestPaletteId>[] {
  const common = remoteDashboardPaletteActions({
    ...state,
    overviewTab: state.previewTab === "overview",
    copy: {
      selectItem: "Selecione um pull request",
      create: "Criar pull request",
      createDescription: "Abre o formulário de novo pull request.",
    },
  })
  return orderRemotePaletteActions<PullRequestPaletteId>(
    [
      ...common,
      ...itemActions(state),
      ...mutationActions(state),
      ...gitTabPaletteActions("pr", state.navigation),
    ],
    state.focus,
  )
}
