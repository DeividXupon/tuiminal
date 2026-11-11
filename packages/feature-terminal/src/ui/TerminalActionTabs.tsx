import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export type TerminalActionPanel = "actions" | "agents"

export function TerminalActionTabs({
  visible,
  activePanel,
  onSelect,
}: {
  visible: boolean
  activePanel: TerminalActionPanel
  onSelect: (panel: TerminalActionPanel) => void
}) {
  if (!visible) return null
  return (
    <box id="terminal-master-key-tabs" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        id="terminal-action-tab-actions"
        label="AÇÕES"
        selected={activePanel === "actions"}
        accent={COLORS.terminal}
        onPress={() => onSelect("actions")}
      />
      <InlineButton
        id="terminal-action-tab-agents"
        label="AGENTES"
        selected={activePanel === "agents"}
        accent={COLORS.terminal}
        onPress={() => onSelect("agents")}
      />
    </box>
  )
}
