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
import type { IssueActionAvailability, IssueActionKind } from "./actions"
import type { IssuePreviewTab } from "./types"

export type IssueMutation = {
  kind: IssueActionKind
  label: string
  shortcut: string
  key: ActionPaletteKey
}

/** Issue writes, in menu order. Keys match the Issue keyboard model. */
export const ISSUE_MUTATIONS: readonly IssueMutation[] = [
  { kind: "comment", label: "Comentar", shortcut: "[C]", key: { name: "c" } },
  { kind: "reaction", label: "Reagir", shortcut: "[Shift+E]", key: { name: "e", shift: true } },
  { kind: "assign", label: "Adicionar responsáveis", shortcut: "[A]", key: { name: "a" } },
  {
    kind: "unassign",
    label: "Remover responsáveis",
    shortcut: "[Shift+A]",
    key: { name: "a", shift: true },
  },
  {
    kind: "labels",
    label: "Editar labels",
    shortcut: "[Shift+L]",
    key: { name: "l", shift: true },
  },
  {
    kind: "checkout",
    label: "Criar branch e checkout",
    shortcut: "[Shift+C]",
    key: { name: "c", shift: true },
  },
  { kind: "close", label: "Fechar issue", shortcut: "[X]", key: { name: "x" } },
  {
    kind: "reopen",
    label: "Reabrir issue",
    shortcut: "[Shift+X]",
    key: { name: "x", shift: true },
  },
]

export type IssuePaletteId =
  | RemoteDashboardPaletteId
  | GitTabPaletteId
  | `mutation:${IssueActionKind}`

export type IssuePaletteState = Omit<RemoteDashboardPaletteState, "overviewTab" | "copy"> & {
  previewTab: IssuePreviewTab
  /** Availability per write; empty until details and authentication load. */
  availability: ReadonlyMap<IssueActionKind, IssueActionAvailability>
  navigation: boolean
}

export function issueMutationKind(id: string): IssueActionKind | null {
  return id.startsWith("mutation:") ? (id.slice(9) as IssueActionKind) : null
}

export function issuePaletteActions(
  state: IssuePaletteState,
): GitRemotePaletteAction<IssuePaletteId>[] {
  const common = remoteDashboardPaletteActions({
    ...state,
    overviewTab: state.previewTab === "overview",
    copy: {
      selectItem: "Selecione uma issue",
      create: "Criar issue",
      createDescription: "Abre o formulário de nova issue.",
    },
  })
  const mutations = ISSUE_MUTATIONS.map((mutation) => {
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
      !state.hasSelection && "Selecione uma issue",
      !availability && "Carregando detalhes da issue",
      availability && !availability.enabled && (availability.reason ?? "Ação indisponível."),
    )
  })
  return orderRemotePaletteActions<IssuePaletteId>(
    [...common, ...mutations, ...gitTabPaletteActions("issues", state.navigation)],
    state.focus,
  )
}
