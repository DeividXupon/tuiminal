import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useMemo, useState } from "react"
import {
  isRunningAgent,
  masterKeyShortcutLabel,
  numberedTerminalSections,
  type TerminalSession,
  visibleTerminalShortcutTargets,
} from "../model/sessions"
import { AGENT_WORKING_FRAMES } from "../rendering/agent-presentation"
import { TerminalAgentList } from "../ui/TerminalAgentList"
import { TerminalSessionGroups } from "../ui/TerminalSessionGroups"
import { TerminalInlineButton } from "../ui/TerminalShortcut"
import { TUTORIAL_FOLDERS } from "./TerminalTutorialFixtures"

const noop = () => {}
const COLLAPSED_FOLDERS = [TUTORIAL_FOLDERS[2]?.id ?? "others"]
const COLLAPSED_FOLDER_SET = new Set(COLLAPSED_FOLDERS)

/**
 * Paint-only copy of the Terminal sidebar. It composes the real list components
 * but owns no keyboard handler, focus or persisted fold state.
 */
export function TerminalTutorialSidebar({
  sessions,
  activeSessionId,
  width,
  height,
  masterKeyActive = false,
  borderRight = true,
  id = "tutorial-terminal-sidebar",
}: {
  sessions: TerminalSession[]
  activeSessionId: string
  width: number
  height: number
  masterKeyActive?: boolean
  borderRight?: boolean
  id?: string
}) {
  const masterKey = getUiSettings().terminalMasterKey
  const sections = useMemo(() => numberedTerminalSections(sessions), [sessions])
  const agentCount = sessions.filter(isRunningAgent).length
  const shortcuts = useMemo(
    () =>
      masterKeyActive
        ? new Map(
            visibleTerminalShortcutTargets(sessions, TUTORIAL_FOLDERS, COLLAPSED_FOLDERS).flatMap(
              (session, index) => {
                const shortcut = masterKeyShortcutLabel(index)
                return shortcut ? [[session.id, shortcut] as const] : []
              },
            ),
          )
        : new Map<string, string>(),
    [masterKeyActive, sessions],
  )
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!agentCount || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(
      () => setFrame((current) => (current + 1) % AGENT_WORKING_FRAMES.length),
      100,
    )
    return () => clearInterval(timer)
  }, [agentCount])
  const listWidth = width - Number(borderRight)
  const agentHeight = agentCount ? Math.max(5, Math.floor(height * 0.4)) : 3
  const groups = (folderIndex: number) => (
    <TerminalSessionGroups
      folders={TUTORIAL_FOLDERS.slice(folderIndex, folderIndex + 1)}
      sections={sections}
      selectedFolder={TUTORIAL_FOLDERS[0]?.id ?? ""}
      activeSessionId={activeSessionId}
      cursorId={null}
      cursorFolderId={null}
      collapsedFolderIds={COLLAPSED_FOLDER_SET}
      width={width}
      shortcuts={shortcuts}
      onSelectFolder={noop}
      onToggleFolder={noop}
      onActivate={noop}
    />
  )
  return (
    <box
      id={id}
      style={{
        width,
        height,
        flexShrink: 0,
        overflow: "hidden",
        backgroundColor: COLORS.canvas,
        ...(borderRight ? { border: ["right"] as const, borderColor: COLORS.border } : {}),
      }}
    >
      <box id="tutorial-terminal-agents" style={{ flexShrink: 0 }}>
        <TerminalAgentList
          compact={height < 10}
          frame={frame}
          sessions={sessions}
          activeSessionId={activeSessionId}
          shortcuts={shortcuts}
          width={listWidth}
          height={agentHeight}
          onActivate={noop}
        />
      </box>
      <box style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: "hidden" }}>
        <box id="tutorial-terminal-sessions" style={{ flexShrink: 0 }}>
          <box
            style={{
              height: 1,
              flexDirection: "row",
              paddingLeft: 1,
              paddingRight: 1,
              flexShrink: 0,
            }}
          >
            <text
              content={truncateDisplay(translateUi("Terminais"), width - 6)}
              style={{ fg: COLORS.muted, flexGrow: 1 }}
            />
            <text content={String(sections.length)} style={{ fg: COLORS.muted }} />
          </box>
          {groups(0)}
        </box>
        <box id="tutorial-terminal-folders" style={{ flexShrink: 0 }}>
          <box id="tutorial-terminal-tmux" style={{ flexShrink: 0 }}>
            {groups(1)}
          </box>
          {groups(2)}
        </box>
      </box>
      <TerminalInlineButton
        compact
        id="tutorial-terminal-new"
        label="Novo terminal"
        accent={COLORS.terminal}
        onPress={noop}
      />
      <TerminalInlineButton
        compact
        id="tutorial-terminal-command"
        label="Comando"
        accent={COLORS.terminal}
        onPress={noop}
      />
      <TerminalInlineButton
        compact
        id="tutorial-terminal-master-key"
        label={`[${masterKey}]`}
        accent={COLORS.terminal}
        onPress={noop}
      />
    </box>
  )
}
