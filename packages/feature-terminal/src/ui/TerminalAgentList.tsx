import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef } from "react"
import { isRunningAgent, type TerminalSession } from "../model/sessions"
import { agentPresentation } from "../rendering/agent-presentation"

function agentPrimaryColor(
  compact: boolean,
  taskTitle: string | null | undefined,
  selected: boolean,
) {
  if (compact && taskTitle) return COLORS.focus
  return selected ? COLORS.text : COLORS.muted
}

function TerminalAgentRow({
  compact,
  frame,
  session,
  selected,
  cursor,
  shortcut,
  width,
  onActivate,
}: {
  compact: boolean
  frame: number
  session: TerminalSession
  selected: boolean
  cursor: boolean
  shortcut?: string | undefined
  width: number
  onActivate: (id: string) => void
}) {
  const agent = session.agent
  if (!agent) return null
  const status = agentPresentation(
    agent.state,
    frame,
    session.agentIntegration === "codex-app-server" ? null : agent.activity,
  )
  const cursorRail = cursor ? "▌" : " "
  const statusWidth = Math.min(displayWidth(status.shortLabel), Math.max(5, width - 14))
  const shortcutWidth = shortcut ? displayWidth(shortcut) + 1 : 0
  const primary = compact && agent.taskTitle ? agent.taskTitle : agent.label
  const primaryColor = agentPrimaryColor(compact, agent.taskTitle, selected)
  return (
    <Button
      id={`terminal-agent-${session.id}`}
      height={compact ? 1 : 2}
      width="100%"
      onPress={() => onActivate(session.id)}
    >
      <box
        style={{
          width: "100%",
          height: compact ? 1 : 2,
          flexDirection: "row",
          backgroundColor: selected || cursor ? COLORS.panelRaised : "transparent",
          paddingRight: 1,
        }}
      >
        <text
          content={compact ? cursorRail : `${cursorRail}\n${cursorRail}`}
          style={{ fg: COLORS.terminal, width: 1, flexShrink: 0 }}
        />
        {shortcut && (
          <ShortcutText
            id={`terminal-agent-shortcut-${session.id}`}
            content={`${shortcut} `}
            highlight={false}
            style={{ fg: COLORS.terminal, width: shortcutWidth, flexShrink: 0 }}
          />
        )}
        <box style={{ height: compact ? 1 : 2, flexGrow: 1, minWidth: 0 }}>
          <box style={{ height: 1, flexDirection: "row", width: "100%" }}>
            <text content={`${status.marker} `} style={{ fg: status.color, flexShrink: 0 }} />
            <text
              id={`terminal-agent-primary-${session.id}`}
              content={truncateDisplay(
                primary,
                Math.max(2, width - statusWidth - 6 - shortcutWidth),
              )}
              style={{ fg: primaryColor, flexGrow: 1 }}
            />
            <text
              content={truncateDisplay(status.shortLabel, statusWidth)}
              style={{ fg: status.color, width: statusWidth, flexShrink: 0 }}
            />
          </box>
          {!compact && (
            <text
              id={`terminal-agent-context-${session.id}`}
              content={`  ${truncateDisplay(agent.taskTitle || session.title, width - 5)}`}
              style={{ fg: agent.taskTitle ? COLORS.focus : COLORS.muted }}
            />
          )}
        </box>
      </box>
    </Button>
  )
}

export function TerminalAgentList({
  compact = false,
  frame,
  sessions,
  activeSessionId,
  cursorSessionId,
  width,
  height,
  shortcuts = new Map(),
  onActivate,
}: {
  compact?: boolean
  frame: number
  sessions: TerminalSession[]
  activeSessionId: string | null
  cursorSessionId?: string | null
  width: number
  height: number
  shortcuts?: ReadonlyMap<string, string>
  onActivate: (id: string) => void
}) {
  const agents = sessions.filter(isRunningAgent)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const visibleCursor = agents.some((session) => session.id === cursorSessionId)
  useEffect(() => {
    if (visibleCursor) scrollRef.current?.scrollChildIntoView(`terminal-agent-${cursorSessionId}`)
  }, [cursorSessionId, visibleCursor])
  return (
    <box
      id="terminal-agent-list"
      style={{
        height,
        flexShrink: 0,
        border: compact ? [] : ["bottom"],
        borderColor: COLORS.border,
      }}
    >
      {(!compact || height > 1) && (
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
            content={truncateDisplay(translateUi("Agentes"), width - 6)}
            style={{ fg: COLORS.muted, flexGrow: 1 }}
          />
          <text
            id="terminal-agent-count"
            content={String(agents.length)}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
      <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1, minHeight: 0, width: "100%" }}>
        {!agents.length && (
          <text
            content={` ${truncateDisplay(translateUi("Sem agentes ativos"), width - 3)}`}
            style={{ fg: COLORS.muted }}
          />
        )}
        {agents.map((session) => (
          <TerminalAgentRow
            key={session.id}
            compact={compact}
            frame={frame}
            session={session}
            selected={session.id === activeSessionId}
            cursor={session.id === cursorSessionId}
            shortcut={shortcuts.get(session.id)}
            width={width}
            onActivate={onActivate}
          />
        ))}
      </scrollbox>
    </box>
  )
}
