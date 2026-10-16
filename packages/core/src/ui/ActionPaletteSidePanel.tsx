import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { displayWidth, translateUi, truncateDisplay } from "../i18n/index"
import { COLORS } from "../settings/theme"
import type {
  ActionPaletteSide,
  ActionPaletteSideEntry,
  ActionPaletteSideSection,
} from "./action-palette"

function SideRow({
  rowId,
  entry,
  selected,
  width,
  backgroundColor,
  onPress,
}: {
  rowId: string
  entry: ActionPaletteSideEntry
  selected: boolean
  width: number
  backgroundColor: string
  onPress: () => void
}) {
  const enabled = !entry.disabledReason
  const detail = entry.detail ? ` · ${translateUi(entry.detail)}` : ""
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: rows are also reachable with arrows and Enter.
    <box
      id={rowId}
      onMouseDown={onPress}
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: selected ? COLORS.panelRaised : backgroundColor,
      }}
    >
      <text
        content={selected ? "› " : "  "}
        style={{ flexShrink: 0, fg: selected ? COLORS.focus : COLORS.muted }}
      />
      {/* Project and branch names are user data: plain text, no shortcut styling. */}
      <text
        id={`${rowId}-label`}
        content={truncateDisplay(entry.label, Math.max(1, width - 2 - displayWidth(detail)))}
        wrapMode="none"
        style={{ flexShrink: 1, minWidth: 1, fg: enabled ? COLORS.text : COLORS.muted }}
      />
      <text
        content={detail}
        wrapMode="none"
        style={{ flexShrink: 0, fg: enabled ? COLORS.muted : COLORS.success }}
      />
    </box>
  )
}

function SideSection({
  id,
  section,
  entries,
  selectedId,
  active,
  width,
  backgroundColor,
  onPress,
}: {
  id: string
  section: ActionPaletteSideSection
  entries: readonly ActionPaletteSideEntry[]
  selectedId: string | null
  active: boolean
  width: number
  backgroundColor: string
  onPress: (entry: ActionPaletteSideEntry) => void
}) {
  const list = useRef<ScrollBoxRenderable | null>(null)
  const sectionId = `${id}-side-${section.id}`
  const selected = entries.find((entry) => entry.id === selectedId)
  useEffect(() => {
    if (active && selected) list.current?.scrollChildIntoView(`${sectionId}-row-${selected.itemId}`)
  }, [active, sectionId, selected])
  const message = section.error ?? (section.loading ? translateUi("Carregando…") : "")
  return (
    // Every block grows from a zero basis, so stacked blocks always share the height equally.
    <box id={sectionId} style={{ flexGrow: 1, flexBasis: 0, minHeight: 2 }}>
      <text
        content={`${active && selected ? "›" : " "} ${translateUi(section.title)}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: active && selected ? COLORS.focus : COLORS.muted }}
      />
      <scrollbox
        ref={list}
        id={`${sectionId}-results`}
        scrollY
        style={{ flexGrow: 1, minHeight: 1 }}
      >
        {entries.map((entry) => (
          <SideRow
            key={entry.id}
            rowId={`${sectionId}-row-${entry.itemId}`}
            entry={entry}
            selected={active && entry.id === selectedId}
            width={width}
            backgroundColor={backgroundColor}
            onPress={() => onPress(entry)}
          />
        ))}
        {message ? (
          <text content={message} style={{ fg: section.error ? COLORS.danger : COLORS.muted }} />
        ) : entries.length === 0 ? (
          <text content={translateUi(section.emptyText)} style={{ fg: COLORS.muted }} />
        ) : null}
      </scrollbox>
    </box>
  )
}

/**
 * One-third column of `ActionPalette`: equal-height stacked blocks whose rows share one
 * keyboard selection owned by the palette.
 */
export function ActionPaletteSidePanel({
  id,
  side,
  entries,
  selectedId,
  active,
  width,
  onPress,
}: {
  id: string
  side: ActionPaletteSide
  entries: readonly ActionPaletteSideEntry[]
  selectedId: string | null
  active: boolean
  width: number
  onPress: (entry: ActionPaletteSideEntry) => void
}) {
  const backgroundColor = active ? COLORS.panelAlt : COLORS.panel
  return (
    <box
      id={`${id}-side`}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 1,
        gap: 1,
        backgroundColor,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {side.map((section) => (
        <SideSection
          key={section.id}
          id={id}
          section={section}
          entries={entries.filter((entry) => entry.sectionId === section.id)}
          selectedId={selectedId}
          active={active}
          width={width}
          backgroundColor={backgroundColor}
          onPress={onPress}
        />
      ))}
    </box>
  )
}
