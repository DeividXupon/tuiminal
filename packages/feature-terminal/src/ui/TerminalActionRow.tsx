import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import {
  TERMINAL_ACTION_TAG_LABELS,
  type TerminalAction,
  type TerminalActionTag,
} from "../model/terminal-actions"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { TerminalShortcutText } from "./TerminalShortcut"

function terminalActionTagColor(tag: TerminalActionTag) {
  switch (tag) {
    case "feature":
      return COLORS.graphAccent
    case "agent":
      return COLORS.database
    case "terminal":
      return COLORS.terminal
    case "sidebar":
      return COLORS.warning
    case "navigation":
      return COLORS.git
    case "app":
      return COLORS.http
  }
}

export function TerminalActionRow({
  action,
  active,
  disabled,
  backgroundColor,
  descriptionWidth,
  onSelect,
}: {
  action: TerminalAction
  active: boolean
  disabled: boolean
  backgroundColor: string
  descriptionWidth: number
  onSelect: () => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row selection is also available through arrows and Enter.
    <box
      id={`terminal-action-${action.key}`}
      onMouseDown={onSelect}
      style={{
        height: 2,
        flexShrink: 0,
        backgroundColor: active ? COLORS.panelRaised : backgroundColor,
      }}
    >
      <box style={{ height: 1, flexDirection: "row", minWidth: 1 }}>
        <text
          content={active ? "› " : "  "}
          style={{ fg: active ? COLORS.focus : COLORS.muted, flexShrink: 0 }}
        />
        <TerminalShortcutText
          id={`terminal-action-title-${action.key}`}
          content={translateUi(action.label)}
          shortcutColor={terminalShortcutColor(!disabled)}
          wrapMode="none"
          style={{ fg: COLORS.text, flexGrow: 1, minWidth: 1, overflow: "hidden" }}
        />
        <box
          id={`terminal-action-tags-${action.key}`}
          style={{ height: 1, flexDirection: "row", flexShrink: 0, gap: 1 }}
        >
          {action.tags.map((tag) => (
            <text
              key={tag}
              id={`terminal-action-tag-${action.key}-${tag}`}
              content={` ${translateUi(TERMINAL_ACTION_TAG_LABELS[tag])} `}
              wrapMode="none"
              style={{ fg: terminalActionTagColor(tag), bg: COLORS.panelRaised, flexShrink: 0 }}
            />
          ))}
        </box>
      </box>
      <text
        content={`  ${truncateDisplay(translateUi(action.description), descriptionWidth)}`}
        wrapMode="none"
        style={{ height: 1, fg: COLORS.muted }}
      />
    </box>
  )
}
