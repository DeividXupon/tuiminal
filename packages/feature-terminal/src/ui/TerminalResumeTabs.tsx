import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useEffect, useState } from "react"
import type { AgentProviderId } from "../model/agent-provider"
import type { AgentResumeTab } from "../model/agent-resume-thread"

const LOADER_FRAMES = ["◐", "◓", "◑", "◒"] as const
const TABS: readonly { id: AgentResumeTab; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "opencode", label: "OpenCode" },
]

function useLoaderFrame(active: boolean) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => setFrame((current) => (current + 1) % LOADER_FRAMES.length), 90)
    return () => clearInterval(timer)
  }, [active])
  return LOADER_FRAMES[frame]
}

export function TerminalResumeLoader({ label, id }: { label: string; id: string }) {
  const frame = useLoaderFrame(true)
  return (
    <text
      id={id}
      content={`${frame} ${translateUi(label)}`}
      wrapMode="none"
      style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
    />
  )
}

export function TerminalResumeTabs({
  activeTab,
  loadingProviders,
  onSelect,
}: {
  activeTab: AgentResumeTab
  loadingProviders: readonly AgentProviderId[]
  onSelect: (tab: AgentResumeTab) => void
}) {
  const activeTabLoading =
    activeTab === "global" ? loadingProviders.length > 0 : loadingProviders.includes(activeTab)
  const loaderFrame = useLoaderFrame(activeTabLoading)
  return (
    <box id="terminal-resume-tabs" style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <InlineButton
        id="terminal-resume-tab-previous"
        label="[Z←]"
        accent={COLORS.terminal}
        onPress={() => onSelect(adjacentAgentResumeTab(activeTab, -1))}
      />
      {TABS.map((tab) => (
        <InlineButton
          key={tab.id}
          id={`terminal-resume-tab-${tab.id}`}
          label={
            activeTab === tab.id && activeTabLoading ? `${loaderFrame} ${tab.label}` : tab.label
          }
          selected={activeTab === tab.id}
          accent={COLORS.terminal}
          onPress={() => onSelect(tab.id)}
        />
      ))}
      <InlineButton
        id="terminal-resume-tab-next"
        label="[→V]"
        accent={COLORS.terminal}
        onPress={() => onSelect(adjacentAgentResumeTab(activeTab, 1))}
      />
    </box>
  )
}

export function adjacentAgentResumeTab(tab: AgentResumeTab, direction: -1 | 1) {
  const index = TABS.findIndex((candidate) => candidate.id === tab)
  return TABS[(index + direction + TABS.length) % TABS.length]?.id ?? "global"
}
