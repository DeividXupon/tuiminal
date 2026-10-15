import {
  type BoxRenderable,
  type InputRenderable,
  type KeyEvent,
  RenderableEvents,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { displayWidth, translateUi, truncateDisplay } from "../i18n/index"
import { COLORS } from "../settings/theme"
import { ActionPaletteSidePanel } from "./ActionPaletteSidePanel"
import {
  type ActionPaletteAction,
  type ActionPalettePanel,
  type ActionPaletteSide,
  type ActionPaletteSideEntry,
  type ActionPaletteTag,
  actionPaletteActionEnabled,
  actionPaletteActionForKey,
  actionPalettePanelForKey,
  actionPaletteSideEntries,
  filterActionPaletteActions,
  isActionPaletteKey,
} from "./action-palette"
import { InlineButton } from "./InlineButton"
import { ModalSurface } from "./ModalSurface"
import { ShortcutText } from "./ShortcutText"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

function paletteDirection(key: KeyEvent, searchFocused: boolean) {
  if (key.ctrl || key.meta || key.option || key.super) return 0
  if (key.name === "up" || (!searchFocused && key.name === "k")) return -1
  if (key.name === "down" || (!searchFocused && key.name === "j")) return 1
  return 0
}

function isSlash(key: KeyEvent) {
  return !key.shift && (key.name === "/" || key.sequence === "/")
}

function firstEnabledIndex(actions: readonly { disabledReason?: string | null | undefined }[]) {
  return Math.max(
    0,
    actions.findIndex((action) => !action.disabledReason),
  )
}

function isEnter(key: KeyEvent) {
  return key.name === "return" || key.name === "enter" || key.name === "linefeed"
}

/** Keeps a selection by id across filtering, falling back to the first available row. */
function useListSelection<Item extends { id: string; disabledReason?: string | null | undefined }>(
  items: readonly Item[],
) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => items[firstEnabledIndex(items)]?.id ?? null,
  )
  useEffect(() => {
    if (selectedId && items.some((item) => item.id === selectedId)) return
    setSelectedId(items[firstEnabledIndex(items)]?.id ?? null)
  }, [items, selectedId])
  const index = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  )
  const move = (direction: number) => {
    if (!items.length) return
    setSelectedId(items[(index + direction + items.length) % items.length]?.id ?? null)
  }
  return { selected: items[index], selectedId: items[index]?.id ?? null, setSelectedId, move }
}

/** Panels side by side need room for readable action rows; narrower dialogs keep actions only. */
const SIDE_PANEL_MIN_DIALOG_WIDTH = 72

function ActionPaletteRow({
  rowId,
  action,
  tags,
  selected,
  width,
  backgroundColor,
  onPress,
}: {
  rowId: string
  action: ActionPaletteAction
  tags: Readonly<Record<string, ActionPaletteTag>>
  selected: boolean
  width: number
  backgroundColor: string
  onPress: () => void
}) {
  const enabled = actionPaletteActionEnabled(action)
  const background = selected ? COLORS.panelRaised : backgroundColor
  const detail = action.disabledReason
    ? `⊘ ${translateUi(action.disabledReason)}`
    : translateUi(action.description)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: rows are also reachable with arrows and Enter.
    <box
      id={rowId}
      onMouseDown={onPress}
      style={{ height: 2, flexShrink: 0, backgroundColor: background }}
    >
      <box style={{ height: 1, flexDirection: "row", minWidth: 1 }}>
        <text
          content={selected ? "› " : "  "}
          style={{ flexShrink: 0, fg: selected ? COLORS.focus : COLORS.muted }}
        />
        <ShortcutText
          id={`${rowId}-title`}
          content={`${action.shortcut ? `${action.shortcut} ` : ""}${translateUi(action.label)}`}
          {...(enabled ? {} : { shortcutColor: COLORS.border })}
          wrapMode="none"
          style={{
            flexGrow: 1,
            minWidth: 1,
            overflow: "hidden",
            fg: enabled ? COLORS.text : COLORS.muted,
          }}
        />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 1 }}>
          {action.tags.map((tag) => (
            <text
              key={tag}
              id={`${rowId}-tag-${tag}`}
              content={` ${translateUi(tags[tag]?.label ?? tag)} `}
              wrapMode="none"
              style={{
                flexShrink: 0,
                fg: enabled ? (tags[tag]?.color ?? COLORS.muted) : COLORS.muted,
                bg: COLORS.panelRaised,
              }}
            />
          ))}
        </box>
      </box>
      <text
        id={`${rowId}-detail`}
        content={`  ${truncateDisplay(detail, Math.max(1, width - 2))}`}
        wrapMode="none"
        style={{ height: 1, fg: enabled ? COLORS.muted : COLORS.warning }}
      />
    </box>
  )
}

/**
 * Searchable, tagged action list for a feature-owned `[?]` shortcut. Mount only while open:
 * the palette owns its keyboard handling and returns every outcome through callbacks.
 * An optional `side` column of equal-height blocks takes one third of the width, for
 * example versioned projects above local branches.
 */
export function ActionPalette<Id extends string>({
  id,
  title,
  accent,
  actions,
  tags,
  side,
  width,
  height,
  onRun,
  onClose,
}: {
  id: string
  /** Untranslated title. */
  title: string
  accent: string
  actions: readonly ActionPaletteAction<Id>[]
  tags: Readonly<Record<string, ActionPaletteTag>>
  side?: ActionPaletteSide | undefined
  width: number
  height: number
  onRun: (id: Id) => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const input = useRef<InputRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [panel, setPanel] = useState<ActionPalettePanel>("actions")
  const visible = useMemo(
    () => filterActionPaletteActions(actions, query, tags),
    [actions, query, tags],
  )
  const sideEntries = useMemo(() => actionPaletteSideEntries(side ?? [], query), [query, side])
  const actionSelection = useListSelection(visible)
  const sideSelection = useListSelection(sideEntries)
  const selected = actionSelection.selected
  const dialogWidth = Math.max(1, Math.min(120, width - 2))
  const dialogHeight = Math.max(1, Math.min(32, height - 2))
  const showSide = Boolean(side) && dialogWidth >= SIDE_PANEL_MIN_DIALOG_WIDTH
  const activePanel = showSide ? panel : "actions"
  const contentWidth = Math.max(1, dialogWidth - 4)
  const sideWidth = showSide ? Math.max(1, Math.floor((contentWidth - 1) / 3) - 2) : 0
  const rowWidth = showSide ? Math.max(1, contentWidth - sideWidth - 5) : contentWidth

  useEffect(() => {
    dialog.current?.focus()
  }, [])
  useEffect(() => {
    const search = input.current
    if (!search) return
    const updateFocus = () => setSearchFocused(search.focused)
    updateFocus()
    search.on(RenderableEvents.FOCUSED, updateFocus)
    search.on(RenderableEvents.BLURRED, updateFocus)
    return () => {
      search.off(RenderableEvents.FOCUSED, updateFocus)
      search.off(RenderableEvents.BLURRED, updateFocus)
    }
  }, [])
  useEffect(() => {
    if (selected) list.current?.scrollChildIntoView(`${id}-row-${selected.id}`)
  }, [id, selected])

  const run = (action: ActionPaletteAction<Id> | undefined) => {
    if (action && actionPaletteActionEnabled(action)) onRun(action.id)
  }
  const choose = (entry: ActionPaletteSideEntry | undefined) => {
    if (!entry || entry.disabledReason) return
    side?.find((section) => section.id === entry.sectionId)?.onSelect(entry.itemId)
  }

  const handleNavigation = (key: KeyEvent, searchFocused: boolean) => {
    const nextPanel = showSide && !searchFocused ? actionPalettePanelForKey(key, activePanel) : null
    if (nextPanel) {
      setPanel(nextPanel)
      return true
    }
    const direction = paletteDirection(key, searchFocused)
    if (!direction) return false
    if (activePanel === "side") sideSelection.move(direction)
    else actionSelection.move(direction)
    return true
  }

  const handleDialogKey = (key: KeyEvent, searchFocused: boolean) => {
    if (key.name === "escape") {
      if (searchFocused) dialog.current?.focus()
      else onClose()
    } else if (!searchFocused && isActionPaletteKey(key)) onClose()
    else if (!searchFocused && isSlash(key)) input.current?.focus()
    else return false
    return true
  }

  useKeyboard((key) => {
    const searchFocused = input.current?.focused ?? false
    if (handleDialogKey(key, searchFocused) || handleNavigation(key, searchFocused)) {
      consume(key)
    } else if (isEnter(key)) {
      consume(key)
      if (activePanel === "side") choose(sideSelection.selected)
      else run(selected)
    } else if (!searchFocused) {
      const direct = actionPaletteActionForKey(actions, key)
      if (!direct) return
      consume(key)
      run(direct)
    }
  })

  const available = visible.filter(actionPaletteActionEnabled).length
  const counter = `${available}/${visible.length}`
  const actionBackground = showSide && activePanel === "actions" ? COLORS.panelAlt : COLORS.canvas
  return (
    <ModalSurface
      dialogRef={dialog}
      id={id}
      width={dialogWidth}
      height={dialogHeight}
      zIndex={960}
      borderColor={accent}
      backdropOpacity={0}
      onBackdropPress={onClose}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={`◆ ${translateUi(title)}`}
          wrapMode="none"
          style={{ flexGrow: 1, minWidth: 1, overflow: "hidden", fg: accent }}
        />
        <text
          content={counter}
          style={{ flexShrink: 0, width: displayWidth(counter) + 1, fg: COLORS.muted }}
        />
        <InlineButton label="[Esc] Fechar" accent={accent} onPress={onClose} />
      </box>
      <input
        ref={input}
        id={`${id}-search`}
        value={query}
        placeholder={translateUi(searchFocused ? "Pesquisar ações…" : "[/] Buscar")}
        onInput={setQuery}
        onMouseDown={() => input.current?.focus()}
        width="100%"
        style={{
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      <box
        id={`${id}-panels`}
        style={{ flexGrow: 1, minHeight: 1, marginTop: 1, flexDirection: "row", gap: 1 }}
      >
        <box
          id={`${id}-actions`}
          style={{ flexGrow: 2, flexBasis: 0, minWidth: 1, backgroundColor: actionBackground }}
        >
          <scrollbox ref={list} id={`${id}-results`} scrollY style={{ flexGrow: 1 }}>
            {visible.map((action) => (
              <ActionPaletteRow
                key={action.id}
                rowId={`${id}-row-${action.id}`}
                action={action}
                tags={tags}
                selected={activePanel === "actions" && action.id === selected?.id}
                width={rowWidth}
                backgroundColor={actionBackground}
                onPress={() => {
                  setPanel("actions")
                  actionSelection.setSelectedId(action.id)
                  run(action)
                }}
              />
            ))}
            {visible.length === 0 ? (
              <text content={translateUi("Nenhum resultado.")} style={{ fg: COLORS.muted }} />
            ) : null}
          </scrollbox>
        </box>
        {showSide && side ? (
          <ActionPaletteSidePanel
            id={id}
            side={side}
            entries={sideEntries}
            selectedId={sideSelection.selectedId}
            active={activePanel === "side"}
            width={sideWidth}
            onPress={(entry) => {
              setPanel("side")
              sideSelection.setSelectedId(entry.id)
              choose(entry)
            }}
          />
        ) : null}
      </box>
    </ModalSurface>
  )
}
