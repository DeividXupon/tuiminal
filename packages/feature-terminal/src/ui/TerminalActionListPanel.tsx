import type { ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import type { TerminalAction } from "../model/terminal-actions"
import { TerminalActionRow } from "./TerminalActionRow"

export function TerminalActionListPanel({
  compact,
  active,
  backgroundColor,
  actions,
  selectedIndex,
  descriptionWidth,
  query,
  disabled,
  onSelect,
}: {
  compact: boolean
  active: boolean
  backgroundColor: string
  actions: readonly TerminalAction[]
  selectedIndex: number
  descriptionWidth: number
  query: string
  disabled: (key: string) => boolean
  onSelect: (index: number, action: TerminalAction) => void
}) {
  const list = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    const key = actions[selectedIndex]?.key
    if (active && key) list.current?.scrollChildIntoView(`terminal-action-${key}`)
  }, [actions, active, selectedIndex])

  return (
    <box
      id="terminal-action-panel"
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 1,
        backgroundColor,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {!compact && (
        <text
          content={`${active ? "›" : " "} ${translateUi("AÇÕES")}`}
          style={{ height: 1, flexShrink: 0, fg: active ? COLORS.focus : COLORS.muted }}
        />
      )}
      <scrollbox ref={list} id="terminal-action-results" scrollY style={{ flexGrow: 1 }}>
        {actions.map((action, index) => (
          <TerminalActionRow
            key={action.key}
            action={action}
            active={active && selectedIndex === index}
            disabled={disabled(action.key)}
            backgroundColor={backgroundColor}
            descriptionWidth={descriptionWidth}
            onSelect={() => onSelect(index, action)}
          />
        ))}
        {query.trim() && actions.length === 0 && (
          <text content={translateUi("Nenhum resultado.")} style={{ fg: COLORS.muted }} />
        )}
      </scrollbox>
    </box>
  )
}
