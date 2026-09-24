import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { useEffect, useRef } from "react"
import {
  isLocalhostAgentSession,
  orderedRunningAgents,
  type TerminalSession,
} from "../model/sessions"
import { agentPresentation, codexActivityIndicators } from "../rendering/agent-presentation"
import { TerminalShortcutText } from "./TerminalShortcut"

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
  const status = agentPresentation(agent.state, frame, agent.activity)
  const cursorRail = cursor ? "▌" : " "
  const statusWidth = Math.min(displayWidth(status.shortLabel), Math.max(5, width - 14))
  const shortcutWidth = shortcut ? displayWidth(shortcut) : 0
  const primary = compact && agent.taskTitle ? agent.taskTitle : agent.label
  const primaryColor = agentPrimaryColor(compact, agent.taskTitle, selected)
  const showActivity = !compact && session.agentIntegration === "codex-app-server"
  const rowHeight = compact ? 1 : showActivity ? 3 : 2
  const activityIndicators = showActivity
    ? codexActivityIndicators(agent.state, agent.activity, frame)
    : []
  return (
    <Button
      id={`terminal-agent-${session.id}`}
      height={rowHeight}
      width="100%"
      onPress={() => onActivate(session.id)}
    >
      <box
        style={{
          width: "100%",
          height: rowHeight,
          flexDirection: "row",
          backgroundColor: selected || cursor ? COLORS.panelRaised : "transparent",
          paddingRight: 1,
        }}
      >
        <text
          content={
            compact ? cursorRail : Array.from({ length: rowHeight }, () => cursorRail).join("\n")
          }
          style={{ fg: COLORS.terminal, width: 1, flexShrink: 0 }}
        />
        {shortcut && (
          <TerminalShortcutText
            id={`terminal-agent-shortcut-${session.id}`}
            content={shortcut}
            shortcutColor={BRAND_COLOR}
            style={{ fg: BRAND_COLOR, width: shortcutWidth, flexShrink: 0 }}
          />
        )}
        <box style={{ height: rowHeight, flexGrow: 1, minWidth: 0 }}>
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
          {showActivity && (
            <box
              id={`terminal-agent-activity-${session.id}`}
              style={{
                height: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                paddingLeft: 2,
              }}
            >
              {activityIndicators.map((indicator) => (
                <text
                  key={indicator.key}
                  content={indicator.marker}
                  style={{
                    fg: indicator.active
                      ? indicator.bright
                        ? COLORS.terminal
                        : COLORS.muted
                      : COLORS.border,
                    flexShrink: 0,
                  }}
                />
              ))}
            </box>
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
  const agents = orderedRunningAgents(sessions)
  const terminalAgents = agents.filter((session) => !isLocalhostAgentSession(session))
  const localhostAgents = agents.filter(isLocalhostAgentSession)
  const groups = [
    { id: "term", label: translateUi("Local • term"), sessions: terminalAgents },
    { id: "localhost", label: translateUi("Local • localhost"), sessions: localhostAgents },
  ].filter((group) => group.sessions.length > 0)
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
        {groups.map((group) => (
          <box key={group.id} style={{ width: "100%" }}>
            {!compact && (
              <box
                id={`terminal-agent-group-${group.id}`}
                style={{
                  height: 1,
                  flexDirection: "row",
                  paddingLeft: 2,
                  paddingRight: 1,
                  flexShrink: 0,
                }}
              >
                <text
                  content={truncateDisplay(group.label, width - 6)}
                  style={{ fg: COLORS.muted, flexGrow: 1 }}
                />
                <text
                  id={`terminal-agent-group-${group.id}-count`}
                  content={String(group.sessions.length)}
                  style={{ fg: COLORS.muted }}
                />
              </box>
            )}
            {group.sessions.map((session) => (
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
          </box>
        ))}
      </scrollbox>
    </box>
  )
}
