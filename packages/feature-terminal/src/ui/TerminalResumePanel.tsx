import type { ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import type {
  AgentResumePaginationState,
  AgentResumeTab,
  AgentResumeThread,
} from "../model/agent-resume-thread"
import { agentResumeThreadKey } from "../model/agent-resume-thread"
import { TerminalResumeLoader, TerminalResumeTabs } from "./TerminalResumeTabs"
import { TerminalAgentResponsePanel, TerminalResumeThreadRow } from "./TerminalResumeThreads"

export function TerminalResumePanel({
  compact,
  active,
  backgroundColor,
  threads,
  query,
  selectedIndex,
  width,
  now,
  activeTab,
  pagination,
  onSelectTab,
  onSelectThread,
  onReachEnd,
}: {
  compact: boolean
  active: boolean
  backgroundColor: string
  threads: readonly AgentResumeThread[]
  query: string
  selectedIndex: number
  width: number
  now: number
  activeTab: AgentResumeTab
  pagination: AgentResumePaginationState
  onSelectTab: (tab: AgentResumeTab) => void
  onSelectThread: (thread: AgentResumeThread) => void
  onReachEnd: () => void
}) {
  const list = useRef<ScrollBoxRenderable | null>(null)
  const selectedThread = active ? threads[selectedIndex] : undefined
  const loadingMore = activeTab !== "global" && pagination.loadingMore.includes(activeTab)

  useEffect(() => {
    const id = threads[selectedIndex]?.id
    if (active && id) list.current?.scrollChildIntoView(`terminal-resume-thread-${id}`)
  }, [active, selectedIndex, threads])

  const checkForMore = () => {
    const scroll = list.current
    if (!scroll || activeTab === "global" || loadingMore || !pagination.hasMore[activeTab]) return
    if (scroll.scrollTop + scroll.viewport.height >= scroll.scrollHeight - 1) onReachEnd()
  }

  return (
    <box
      id="terminal-agent-panel"
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 1,
        backgroundColor,
        paddingLeft: compact ? 0 : 1,
        paddingRight: compact ? 0 : 1,
      }}
    >
      {active && (
        <text id="terminal-agent-panel-active" content="" style={{ height: 0, flexShrink: 0 }} />
      )}
      {!compact && (
        <text
          content={`${active ? "›" : " "} ${translateUi("AGENTES · RETOMAR")}`}
          style={{ height: 1, flexShrink: 0, fg: active ? COLORS.focus : COLORS.muted }}
        />
      )}
      <TerminalResumeTabs
        activeTab={activeTab}
        loading={pagination.loadingInitial}
        onSelect={onSelectTab}
      />
      <scrollbox
        ref={list}
        id="terminal-agent-results"
        scrollY
        style={{ flexGrow: 1 }}
        onMouseScroll={() => queueMicrotask(checkForMore)}
      >
        {threads.map((thread, index) => (
          <TerminalResumeThreadRow
            key={agentResumeThreadKey(thread)}
            thread={thread}
            active={active && selectedIndex === index}
            alternate={index % 2 === 1}
            width={width}
            now={now}
            backgroundColor={backgroundColor}
            onSelect={onSelectThread}
          />
        ))}
        {!query.trim() && threads.length === 0 && !pagination.loadingInitial && (
          <text
            content={translateUi("Nenhuma conversa de agente disponível para retomar.")}
            style={{ fg: COLORS.muted }}
          />
        )}
        {query.trim() && threads.length === 0 && (
          <text content={translateUi("Nenhum resultado.")} style={{ fg: COLORS.muted }} />
        )}
        {loadingMore && (
          <TerminalResumeLoader id="terminal-resume-more-loader" label="Carregando mais agentes…" />
        )}
      </scrollbox>
      {selectedThread && <TerminalAgentResponsePanel thread={selectedThread} now={now} />}
    </box>
  )
}
