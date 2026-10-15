import { translateUi } from "../i18n/index"

export type ActionPaletteTag = {
  /** Untranslated catalog label. */
  label: string
  color: string
}

export type ActionPaletteAction<Id extends string = string, Tag extends string = string> = {
  id: Id
  /** Bracketed key hint, for example `[S]`; empty when the action has no direct key. */
  shortcut: string
  /** Untranslated catalog label. */
  label: string
  /** Untranslated catalog description. */
  description: string
  tags: readonly Tag[]
  /** Untranslated reason; present only while the action is unavailable. */
  disabledReason?: string | null | undefined
  /**
   * Optional direct key while the palette is open and the search is not focused. Palette
   * navigation (`J/K`, `H/L`, arrows, `Tab`, `Enter`, `/`, `?`, `Esc`) always wins.
   */
  key?: ActionPaletteKey | undefined
}

export type ActionPaletteKey = { name: string; shift?: boolean; ctrl?: boolean }

type PaletteKeyEvent = {
  name: string
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  shift?: boolean
  super?: boolean
}

/** The available action bound to exactly this key and modifier set, if any. */
export function actionPaletteActionForKey<Action extends ActionPaletteAction>(
  actions: readonly Action[],
  key: PaletteKeyEvent,
) {
  if (key.meta || key.option || key.super) return null
  return (
    actions.find(
      (action) =>
        action.key &&
        actionPaletteActionEnabled(action) &&
        action.key.name === key.name.toLowerCase() &&
        Boolean(action.key.shift) === Boolean(key.shift) &&
        Boolean(action.key.ctrl) === Boolean(key.ctrl),
    ) ?? null
  )
}

export function actionPaletteActionEnabled(action: ActionPaletteAction) {
  return !action.disabledReason
}

/** Available actions first, preserving the feature-defined order inside each group. */
export function orderActionPaletteActions<Action extends ActionPaletteAction>(
  actions: readonly Action[],
) {
  return [
    ...actions.filter(actionPaletteActionEnabled),
    ...actions.filter((action) => !actionPaletteActionEnabled(action)),
  ]
}

export function filterActionPaletteActions<Action extends ActionPaletteAction>(
  actions: readonly Action[],
  query: string,
  tags: Readonly<Record<string, ActionPaletteTag>>,
  translate: (source: string) => string = translateUi,
) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...actions]
  return actions.filter((action) =>
    [
      action.shortcut,
      translate(action.label),
      translate(action.description),
      ...action.tags.map((tag) => (tags[tag] ? translate(tags[tag].label) : tag)),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  )
}

export function isActionPaletteKey(key: {
  name: string
  sequence?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  option?: boolean
  super?: boolean
}) {
  if (key.ctrl || key.meta || key.option || key.super) return false
  return key.name === "?" || key.sequence === "?" || (key.name === "/" && Boolean(key.shift))
}

export type ActionPaletteSideItem = {
  id: string
  /** User data such as a branch name: rendered literally, never translated. */
  label: string
  /** Untranslated short marker, for example the current item. */
  detail?: string | undefined
  /** Untranslated reason; present only while the item is unavailable. */
  disabledReason?: string | null | undefined
}

export type ActionPaletteSideSection = {
  /** Stable id used for renderable ids and selection keys. */
  id: string
  /** Untranslated block title. */
  title: string
  items: readonly ActionPaletteSideItem[]
  loading?: boolean | undefined
  /** Untranslated text shown when nothing matches or nothing is available. */
  emptyText: string
  /** Already translated failure from the owning feature. */
  error?: string | undefined
  onSelect: (id: string) => void
}

/** Side column of equal-height stacked blocks; it takes one third of the palette width. */
export type ActionPaletteSide = readonly ActionPaletteSideSection[]

export type ActionPaletteSideEntry = ActionPaletteSideItem & {
  /** The owning block's item id; `id` is `${sectionId}:${itemId}`, unique across blocks. */
  itemId: string
  sectionId: string
}

/** Filters every block by the shared query and flattens them in display order. */
export function actionPaletteSideEntries(side: ActionPaletteSide, query: string) {
  return side.flatMap((section) =>
    filterActionPaletteSideItems(section.items, query).map(
      (item): ActionPaletteSideEntry => ({
        ...item,
        id: `${section.id}:${item.id}`,
        itemId: item.id,
        sectionId: section.id,
      }),
    ),
  )
}

export type ActionPalettePanel = "actions" | "side"

export function filterActionPaletteSideItems(
  items: readonly ActionPaletteSideItem[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase()
  return needle
    ? items.filter((item) => item.label.toLocaleLowerCase().includes(needle))
    : [...items]
}

/** `[Tab]`, `[H/L]` and `[←/→]` move between panels outside the search input. */
export function actionPalettePanelForKey(
  key: {
    name: string
    ctrl?: boolean
    meta?: boolean
    option?: boolean
    shift?: boolean
    super?: boolean
  },
  current: ActionPalettePanel,
): ActionPalettePanel | null {
  if (key.ctrl || key.meta || key.option || key.shift || key.super) return null
  if (key.name === "tab") return current === "actions" ? "side" : "actions"
  if (key.name === "left" || key.name === "h") return "actions"
  if (key.name === "right" || key.name === "l") return "side"
  return null
}
