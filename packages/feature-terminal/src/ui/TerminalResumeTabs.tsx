import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useEffect, useState } from "react"
import type { AgentResumeTab } from "../model/agent-resume-thread"

const LOADER_FRAMES = ["◐", "◓", "◑", "◒"] as const
const TABS: readonly { id: AgentResumeTab; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "opencode", label: "OpenCode" },
]

export function TerminalResumeLoader({ label, id }: { label: string; id: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => setFrame((current) => (current + 1) % LOADER_FRAMES.length), 90)
    return () => clearInterval(timer)
  }, [])
  return (
    <text
      id={id}
      content={`${LOADER_FRAMES[frame]} ${translateUi(label)}`}
      wrapMode="none"
      style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
    />
  )
}

export function TerminalResumeTabs({
  activeTab,
  loading,
  onSelect,
}: {
  activeTab: AgentResumeTab
  loading: boolean
  onSelect: (tab: AgentResumeTab) => void
}) {
  return (
    <>
      <box id="terminal-resume-tabs" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {TABS.map((tab) => (
          <InlineButton
            key={tab.id}
            id={`terminal-resume-tab-${tab.id}`}
            label={tab.label}
            selected={activeTab === tab.id}
            accent={COLORS.terminal}
            onPress={() => onSelect(tab.id)}
          />
        ))}
      </box>
      {loading && (
        <TerminalResumeLoader
          id="terminal-resume-initial-loader"
          label="Buscando agentes recentes…"
        />
      )}
    </>
  )
}

export function adjacentAgentResumeTab(tab: AgentResumeTab, direction: -1 | 1) {
  const index = TABS.findIndex((candidate) => candidate.id === tab)
  return TABS[(index + direction + TABS.length) % TABS.length]?.id ?? "global"
}
