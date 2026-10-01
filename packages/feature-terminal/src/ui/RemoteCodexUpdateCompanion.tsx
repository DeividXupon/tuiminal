import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TerminalFocusTargetKey } from "../model/focus-selection"
import type { TerminalSession } from "../model/sessions"
import type { FreeTerminalPaneProps } from "./free-terminal-pane-layout"
import { RemoteCodexUpdatePanel } from "./RemoteCodexUpdatePanel"
import { TerminalFocusSelection } from "./TerminalFocusSelection"

export function RemoteCodexUpdateCompanion({
  session,
  height,
  active,
  onActivate,
  onRetry,
  focusSelection,
  focusTarget,
}: {
  session: TerminalSession
  height: number | "40%"
  active: boolean
  onActivate: FreeTerminalPaneProps["onActivate"]
  onRetry: FreeTerminalPaneProps["onRetryRemoteCodex"]
  focusSelection: FreeTerminalPaneProps["focusSelection"]
  focusTarget: TerminalFocusTargetKey
}) {
  const guide = session.remoteCodexUpdate
  if (!guide || !onRetry) return null
  return (
    <box
      id={`terminal-focus-target-setup-${session.id}`}
      style={{
        width: "100%",
        height,
        minHeight: 1,
        flexShrink: 1,
        border: ["top"],
        borderColor: COLORS.border,
        backgroundColor: COLORS.panel,
        position: "relative",
      }}
    >
      <RemoteCodexUpdatePanel
        sessionId={session.id}
        guide={guide}
        profileName={session.label.replace(/^(?:Codex|Claude Code|OpenCode) · /u, "")}
        active={active}
        terminalStatus={session.status}
        onActivateSession={() => onActivate(session.id)}
        onReturnTerminal={() => onActivate(session.id)}
        onRetry={onRetry}
      />
      {focusSelection && (
        <TerminalFocusSelection
          target={focusTarget}
          selected={focusSelection.selectedTarget === focusTarget}
          onFocus={focusSelection.onFocus}
        />
      )}
    </box>
  )
}
