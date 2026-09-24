import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { CodexResumeThread } from "../model/codex-resume-threads"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { TerminalShortcutText } from "./TerminalShortcut"

function resumeThreadPresentation(state: CodexResumeThread["state"]) {
  switch (state) {
    case "working":
      return {
        label: translateUi("Trabalhando"),
        marker: "●",
        color: COLORS.terminal,
        titleColor: COLORS.terminal,
      }
    case "blocked":
      return {
        label: translateUi("Bloqueado"),
        marker: "◆",
        color: COLORS.warning,
        titleColor: COLORS.warning,
      }
    case "failed":
      return {
        label: translateUi("Falhou"),
        marker: "×",
        color: COLORS.danger,
        titleColor: COLORS.danger,
      }
    default:
      return {
        label: translateUi("Ocioso"),
        marker: "○",
        color: COLORS.muted,
        titleColor: COLORS.text,
      }
  }
}

function idleDurationLabel(updatedAt: number, now: number) {
  if (updatedAt <= 0) return "—"
  const timestamp = updatedAt < 10_000_000_000 ? updatedAt * 1_000 : updatedAt
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function ResumeThreadState({ thread, now }: { thread: CodexResumeThread; now: number }) {
  const presentation = resumeThreadPresentation(thread.state)
  return (
    <text wrapMode="none" style={{ flexShrink: 0 }}>
      <span fg={presentation.color}>{` ${presentation.label}`}</span>
      {thread.state === "idle" && (
        <span fg={COLORS.text}>{` · ${idleDurationLabel(thread.updatedAt, now)}`}</span>
      )}
    </text>
  )
}

export function TerminalResumeThreadRow({
  thread,
  active,
  width,
  now,
  backgroundColor,
  onSelect,
}: {
  thread: CodexResumeThread
  active: boolean
  width: number
  now: number
  backgroundColor: string
  onSelect?: (id: string) => void
}) {
  const presentation = resumeThreadPresentation(thread.state)
  const detail = thread.preview || thread.cwd || translateUi("Sem mensagens enviadas")
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row selection is also available through arrows and Enter.
    <box
      id={`terminal-resume-thread-${thread.id}`}
      onMouseDown={() => onSelect?.(thread.id)}
      style={{
        height: 2,
        flexShrink: 0,
        backgroundColor: active ? COLORS.panelRaised : backgroundColor,
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={`${active ? "›" : " "} `}
          wrapMode="none"
          style={{ flexShrink: 0, fg: active ? COLORS.focus : COLORS.muted }}
        />
        <text
          content={`${presentation.marker} `}
          wrapMode="none"
          style={{ flexShrink: 0, fg: presentation.color }}
        />
        <TerminalShortcutText
          content="[Enter] "
          shortcutColor={terminalShortcutColor(active)}
          style={{ flexShrink: 0, fg: active ? COLORS.focus : COLORS.terminal }}
        />
        <text
          id={`terminal-resume-title-${thread.id}`}
          content={truncateDisplay(thread.title, Math.max(1, width - 22))}
          wrapMode="none"
          style={{ flexGrow: 1, fg: active ? COLORS.focus : presentation.titleColor }}
        />
        <ResumeThreadState thread={thread} now={now} />
      </box>
      <text
        id={`terminal-resume-detail-${thread.id}`}
        content={`  ${truncateDisplay(detail, width)}`}
        wrapMode="none"
        style={{ height: 1, fg: active ? COLORS.text : COLORS.muted }}
      />
    </box>
  )
}

export function TerminalAgentResponsePanel({
  thread,
  now,
}: {
  thread: CodexResumeThread
  now: number
}) {
  const presentation = resumeThreadPresentation(thread.state)
  return (
    <box
      id="terminal-agent-response-panel"
      style={{
        height: 4,
        flexShrink: 0,
        backgroundColor: COLORS.panelAlt,
        overflow: "hidden",
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={`${presentation.marker} ${translateUi("RESPOSTA FINAL")} · ${thread.title}`}
          wrapMode="none"
          style={{ flexGrow: 1, fg: COLORS.terminal }}
        />
        <ResumeThreadState thread={thread} now={now} />
      </box>
      <text
        id="terminal-agent-response-text"
        content={thread.lastResponse || translateUi("Sem mensagens enviadas")}
        wrapMode="word"
        style={{
          height: 3,
          overflow: "hidden",
          fg: thread.lastResponse ? COLORS.focus : COLORS.muted,
        }}
      />
    </box>
  )
}
