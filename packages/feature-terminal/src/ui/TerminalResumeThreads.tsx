import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { agentProvider } from "../model/agent-provider"
import type { AgentResumeThread } from "../model/agent-resume-thread"
import { AgentProviderWordmark } from "./AgentProviderWordmark"

function resumeThreadPresentation(state: AgentResumeThread["state"]) {
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

function ResumeThreadState({ thread, now }: { thread: AgentResumeThread; now: number }) {
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

function resumeThreadStateWidth(thread: AgentResumeThread, now: number) {
  const presentation = resumeThreadPresentation(thread.state)
  const idle = thread.state === "idle" ? ` · ${idleDurationLabel(thread.updatedAt, now)}` : ""
  return 1 + displayWidth(presentation.label) + displayWidth(idle)
}

export function TerminalResumeThreadRow({
  thread,
  active,
  alternate,
  width,
  now,
  backgroundColor,
  onSelect,
}: {
  thread: AgentResumeThread
  active: boolean
  alternate: boolean
  width: number
  now: number
  backgroundColor: string
  onSelect?: (thread: AgentResumeThread) => void
}) {
  const presentation = resumeThreadPresentation(thread.state)
  const contentWidth = Math.max(1, width - 2)
  const railColor = active ? COLORS.terminal : alternate ? COLORS.panelRaised : COLORS.border
  const remote = Boolean(thread.remoteProfileId)
  const providerId = thread.providerId ?? "codex"
  const providerLabel = agentProvider(providerId).label
  const locationLabel = translateUi(remote ? "Remoto" : "Local")
  const origin = `${providerLabel} · ${locationLabel}`
  const summary =
    thread.preview ||
    (!thread.projectName ? thread.cwd : "") ||
    translateUi("Sem mensagens enviadas")
  const project = [
    remote ? thread.remoteProfileName || thread.remoteProfileId : "",
    thread.projectName,
  ]
    .filter(Boolean)
    .join(" · ")
  const metadataWidth = Math.max(1, contentWidth - displayWidth(origin) - 3)
  const branch = thread.gitBranch ? `⎇ ${thread.gitBranch}` : ""
  const branchWidth = branch
    ? Math.min(displayWidth(branch), Math.max(1, Math.floor(metadataWidth / 2)))
    : 0
  const projectWidth = Math.max(1, metadataWidth - branchWidth - (branch ? 3 : 0))
  const stateWidth = resumeThreadStateWidth(thread, now)
  const titleAndRuleWidth = Math.max(1, contentWidth - stateWidth - 2)
  const titleWidth = Math.max(
    3,
    Math.min(displayWidth(thread.title) + 2, Math.max(3, titleAndRuleWidth - 3)),
  )
  const ruleWidth = Math.max(1, titleAndRuleWidth - titleWidth)
  const rule =
    ruleWidth >= 3 ? ` ${"─".repeat(Math.max(1, ruleWidth - 2))} ` : "─".repeat(ruleWidth)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row selection is also available through arrows and Enter.
    <box
      id={`terminal-resume-thread-${thread.id}`}
      onMouseDown={() => onSelect?.(thread)}
      style={{
        height: 3,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: active ? COLORS.panelRaised : backgroundColor,
      }}
    >
      <box
        id={`terminal-resume-rail-${thread.id}`}
        style={{ width: 2, height: 3, flexShrink: 0, flexDirection: "column" }}
      >
        {[0, 1, 2].map((line) => (
          <text
            key={line}
            id={`terminal-resume-rail-${thread.id}-${line}`}
            content="▌ "
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: railColor }}
          />
        ))}
      </box>
      <box style={{ height: 3, minWidth: 1, flexGrow: 1, flexDirection: "column" }}>
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <text
            id={`terminal-resume-marker-${thread.id}`}
            content={`${presentation.marker} `}
            wrapMode="none"
            style={{ flexShrink: 0, fg: presentation.color }}
          />
          <text
            id={`terminal-resume-title-${thread.id}`}
            content={` ${truncateDisplay(thread.title, Math.max(1, titleWidth - 2))} `}
            wrapMode="none"
            style={{
              flexShrink: 0,
              fg: active ? COLORS.focus : presentation.titleColor,
              bg: COLORS.panelRaised,
            }}
          />
          <text
            id={`terminal-resume-rule-${thread.id}`}
            content={rule}
            wrapMode="none"
            style={{ flexShrink: 0, fg: COLORS.border }}
          />
          <ResumeThreadState thread={thread} now={now} />
        </box>
        <box style={{ height: 1, minWidth: 1, flexShrink: 0, flexDirection: "row" }}>
          <text
            id={`terminal-resume-connector-${thread.id}`}
            content="└"
            wrapMode="none"
            style={{ flexShrink: 0, fg: COLORS.border }}
          />
          <text
            id={`terminal-resume-detail-${thread.id}`}
            content={`  ${truncateDisplay(summary, Math.max(1, contentWidth - 3))}`}
            wrapMode="none"
            style={{ minWidth: 1, flexGrow: 1, fg: COLORS.text }}
          />
        </box>
        <box style={{ height: 1, minWidth: 1, flexDirection: "row" }}>
          <text
            id={`terminal-resume-origin-${thread.id}`}
            wrapMode="none"
            style={{
              flexShrink: 0,
              fg: remote ? COLORS.database : COLORS.success,
              bg: remote ? COLORS.databaseSelectionBg : COLORS.diffAddedBg,
            }}
          >
            <span fg={remote ? COLORS.database : COLORS.success}> </span>
            <AgentProviderWordmark providerId={providerId} label={providerLabel} />
            <span fg={remote ? COLORS.database : COLORS.success}>{` · ${locationLabel} `}</span>
          </text>
          <text
            id={`terminal-resume-project-${thread.id}`}
            content={` ${truncateDisplay(project, projectWidth)}`}
            wrapMode="none"
            style={{ flexShrink: 0, fg: COLORS.text }}
          />
          {branch && (
            <text
              id={`terminal-resume-branch-${thread.id}`}
              content={`  ${truncateDisplay(branch, branchWidth)}`}
              wrapMode="none"
              style={{ flexShrink: 0, fg: COLORS.git }}
            />
          )}
        </box>
      </box>
    </box>
  )
}

export function TerminalAgentResponsePanel({
  thread,
  now,
}: {
  thread: AgentResumeThread
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
