import {
  type ActionPaletteAction,
  type ActionPaletteKey,
  orderActionPaletteActions,
} from "@xupon/tuiminal-core/ui/action-palette"
import type { GitWorkspaceTab } from "./workspace"

export type GitRemotePaletteTag =
  | "list"
  | "preview"
  | "github"
  | "box"
  | "view"
  | "navigation"
  | "app"

export type GitRemotePaletteAction<Id extends string> = ActionPaletteAction<Id, GitRemotePaletteTag>

type Rule = string | null | false | undefined

/** One palette row; the first truthy rule becomes the unavailable reason. */
export function remotePaletteAction<Id extends string>(
  definition: {
    id: Id
    shortcut: string
    label: string
    description: string
    tags: readonly GitRemotePaletteTag[]
    key?: ActionPaletteKey | undefined
  },
  ...rules: Rule[]
): GitRemotePaletteAction<Id> {
  return {
    ...definition,
    disabledReason: rules.find((rule): rule is string => Boolean(rule)) ?? null,
  }
}

/** Blocks listed first for each focused pane: GitHub writes lead while the list is focused. */
const FOCUS_PRIORITY: Readonly<Record<"list" | "preview", readonly GitRemotePaletteTag[]>> = {
  list: ["github", "list"],
  preview: ["preview", "github"],
}

/** Prioritized blocks for the focused pane, then other rows; available rows before unavailable. */
export function orderRemotePaletteActions<Id extends string>(
  actions: readonly GitRemotePaletteAction<Id>[],
  focus: "list" | "preview",
) {
  const priority = FOCUS_PRIORITY[focus]
  const rank = (action: GitRemotePaletteAction<Id>) => {
    const index = action.tags[0] ? priority.indexOf(action.tags[0]) : -1
    return index < 0 ? priority.length : index
  }
  // Array.prototype.sort is stable, so the feature order is kept inside each block.
  return orderActionPaletteActions([...actions].sort((left, right) => rank(left) - rank(right)))
}

export type GitTabPaletteId = "tab-base" | "tab-pr" | "tab-issues" | "tab-inbox"

const TAB_ACTIONS: ReadonlyArray<{
  tab: GitWorkspaceTab
  id: GitTabPaletteId
  shortcut: string
  label: string
  description: string
}> = [
  {
    tab: "base",
    id: "tab-base",
    shortcut: "[1]",
    label: "Diffs",
    description: "Abre as alterações locais.",
  },
  {
    tab: "pr",
    id: "tab-pr",
    shortcut: "[2]",
    label: "Pull Requests",
    description: "Abre os pull requests do GitHub.",
  },
  {
    tab: "issues",
    id: "tab-issues",
    shortcut: "[3]",
    label: "Issues",
    description: "Abre as issues do GitHub.",
  },
  {
    tab: "inbox",
    id: "tab-inbox",
    shortcut: "[4]",
    label: "Inbox",
    description: "Abre as notificações do GitHub.",
  },
]

/** Other Git tabs; absent when no owner can switch tabs. */
export function gitTabPaletteActions(current: GitWorkspaceTab, navigation: boolean) {
  if (!navigation) return []
  return TAB_ACTIONS.filter((action) => action.tab !== current).map(({ tab: _tab, ...action }) =>
    remotePaletteAction({ ...action, tags: ["navigation"] }),
  )
}

/** `[M]` row shared by the GitHub tabs; the palette hook opens the box selection itself. */
export function chooseBoxPaletteAction() {
  return remotePaletteAction({
    id: "choose-box" as const,
    shortcut: "[M]",
    label: "Escolher box",
    description: "Navega visualmente entre os boxes abertos.",
    tags: ["box"],
    key: { name: "m" },
  })
}

export function gitTabForPaletteId(id: string): GitWorkspaceTab | null {
  return TAB_ACTIONS.find((action) => action.id === id)?.tab ?? null
}
